from datetime import datetime
from io import BytesIO
from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session
from app.api import deps
from app.models.remote_action import RemoteAction, RemoteActionStatus
from app.services.extractor_modules import ModulesExtractor
from app.services.yummy_client import YummyIntegrationClient
from app.models.user import User
from app.models.yummy import YummyInstallation, YummySnapshot
import requests
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font

router = APIRouter()

from pydantic import BaseModel
from typing import Optional

def get_integration_client():
    from app.db.session import SessionLocal
    from app.models.yummy import YummyInstallation
    from app.services.yummy_client import YummyIntegrationClient
    
    db = SessionLocal()
    try:
        install = db.query(YummyInstallation).order_by(
            YummyInstallation.last_health_check.desc().nullslast(),
            YummyInstallation.created_at.desc(),
        ).first()
        if install and installation_is_online(install):
            return YummyIntegrationClient(install.base_url, install.api_key)
        return None
    finally:
        db.close()

class ProductData(BaseModel):
    name: str
    price: float
    stock: int

class StockData(BaseModel):
    stock: float

class NovedadData(BaseModel):
    event_type: str
    amount: float
    notes: str


class EmployeeUpdateData(BaseModel):
    name: str
    role: str
    phone: Optional[str] = ""
    salary_base: float = 0
    profile_image: Optional[str] = ""
    notes: Optional[str] = ""
    vacation_days: Optional[int] = 0
    rest_days: Optional[int] = 0
    absences_count: Optional[int] = 0

class ClientData(BaseModel):
    name: str
    phone: str = ""
    address: str = ""
    notes: str = ""


class CashShiftCloseData(BaseModel):
    shift: str = "general"
    movement_date: Optional[str] = None
    generate_report: bool = True


class CashShiftDeleteData(BaseModel):
    date: str
    shift: str = "general"
    start_at: str
    end_at: Optional[str] = None
    closed_at: Optional[str] = None


EMPLOYEES_SNAPSHOT_KEY = "employees_snapshot_v1"
CASHBOX_SNAPSHOT_KEY = "cashbox_report_snapshot_v1"


def _is_valid_cashbox_date(value: str) -> bool:
    candidate = str(value or "").strip()
    if not candidate:
        return False
    try:
        datetime.strptime(candidate, "%Y-%m-%d")
    except ValueError:
        return False
    return True
ACTIVE_ORDERS_SNAPSHOT_KEY = "active_orders_snapshot_v1"
AUDIT_LOGS_SNAPSHOT_KEY = "audit_logs_snapshot_v1"
OFFLINE_FALLBACK_THRESHOLD_SECONDS = 20


def _fetch_active_orders_for_installation(
    db: Session,
    current_user: User,
    installation_id: Optional[str] = None,
    kitchen_view: bool = False,
):
    install = get_installation_for_user(db, current_user, installation_id, online_only=False)
    if not install:
        return []

    if installation_is_online(install):
        try:
            client = YummyIntegrationClient(install.base_url, install.api_key)
            endpoint = "/api/v1/data/cocina/pedidos" if kitchen_view else "/api/pedidos"
            parsed = client.request("GET", endpoint)
            orders = parsed.get("data", []) if isinstance(parsed, dict) else (parsed if isinstance(parsed, list) else [])
            if not isinstance(orders, list):
                raise RuntimeError("Remote active orders unavailable")
            save_installation_snapshot(
                db,
                install.id,
                ACTIVE_ORDERS_SNAPSHOT_KEY,
                {"orders": orders},
            )
            return orders
        except Exception as e:
            print("Error fetching pedidos:", e)

    snapshot = load_installation_snapshot(db, install.id, ACTIVE_ORDERS_SNAPSHOT_KEY) or {}
    return snapshot.get("orders", [])


def _extract_remote_payload(payload):
    if isinstance(payload, dict) and "data" in payload:
        return payload.get("data")
    return payload


def _queue_installation_action(
    db: Session,
    install: YummyInstallation,
    current_user: User,
    action_type: str,
    payload: dict,
    message: str,
    extra_response: Optional[dict] = None,
    mark_offline: bool = False,
):
    action = RemoteAction(
        installation_id=install.id,
        created_by_user_id=current_user.id,
        action_type=action_type,
        status=RemoteActionStatus.PENDING,
        payload=payload,
        result_payload={"_retry_count": 0, "_queued": True},
    )
    db.add(action)
    db.flush()
    if mark_offline:
        install.connection_status = "OFFLINE"
        db.add(install)
    db.commit()
    db.refresh(action)
    response = {
        "id": str(action.id),
        "status": "QUEUED",
        "installation_id": str(install.id),
        "queued": True,
        "message": message,
        "retry_count": 0,
    }
    if isinstance(extra_response, dict):
        response.update(extra_response)
    return JSONResponse(status_code=202, content=response)


def _build_remote_cashbox_report(client: YummyIntegrationClient, days_limit: int = 10):
    initial_payload = _extract_remote_payload(client.request("GET", "/api/caja"))
    if not isinstance(initial_payload, dict):
        raise RuntimeError("Remote cashbox summary unavailable")

    available_dates = [
        str(date_value).strip()
        for date_value in list(initial_payload.get("available_dates") or [])
        if _is_valid_cashbox_date(date_value)
    ]
    if not available_dates:
        date_value = str(initial_payload.get("date") or datetime.now().date().isoformat())
        available_dates = [date_value] if _is_valid_cashbox_date(date_value) else []

    global_shift_history = list(initial_payload.get("shift_history") or [])
    report = []

    safe_days_limit = max(1, min(int(days_limit or 10), 30))

    for date_value in available_dates[:safe_days_limit]:
        day_payload = _extract_remote_payload(client.request("GET", f"/api/caja?date={date_value}"))
        if not isinstance(day_payload, dict):
            continue

        day_shift_history = [
            row for row in global_shift_history
            if str(row.get("date") or "") == str(date_value)
        ]

        shifts = []
        shift_counter = 1
        for history_row in reversed(day_shift_history):
            shift_label = str(history_row.get("shift") or "general").strip() or "general"
            closed_at = str(history_row.get("closed_at") or "").strip()
            query = f"/api/caja/shift-summary?date={date_value}&shift={shift_label}"
            if closed_at:
                query += f"&closed_at={closed_at}"
            shift_payload = _extract_remote_payload(client.request("GET", query))
            if not isinstance(shift_payload, dict):
                continue
            shifts.append({
                "shift_id": shift_counter,
                "shift_label": str(shift_payload.get("shift") or shift_label).strip() or "general",
                "saldo_inicial": float(shift_payload.get("opening_balance") or 0),
                "ingresos": float(shift_payload.get("sales_total") or 0),
                "salidas": float(
                    (shift_payload.get("withdrawals_total") or 0)
                    + (shift_payload.get("vouchers_total") or 0)
                    + (shift_payload.get("losses_total") or 0)
                ),
                "start_time": shift_payload.get("start_at"),
                "end_time": shift_payload.get("end_at"),
                "efectivo": float(shift_payload.get("cash_total") or 0),
                "transferencia": float(shift_payload.get("transfer_total") or 0),
                "online": float(shift_payload.get("online_total") or 0),
                "debito": float(shift_payload.get("debit_total") or 0),
                "mixto": 0.0,
                "movimientos": list(shift_payload.get("movements") or []),
            })
            shift_counter += 1

        if str(day_payload.get("status") or "").strip().lower() == "open":
            active_shift_label = str(day_payload.get("shift_label") or "general").strip() or "general"
            shift_payload = _extract_remote_payload(
                client.request("GET", f"/api/caja/shift-summary?date={date_value}&shift={active_shift_label}")
            )
            if isinstance(shift_payload, dict):
                active_start = str(shift_payload.get("start_at") or "")
                already_listed = any(str(shift.get("start_time") or "") == active_start for shift in shifts)
                if not already_listed:
                    shifts.append({
                        "shift_id": shift_counter,
                        "shift_label": str(shift_payload.get("shift") or active_shift_label).strip() or "general",
                        "saldo_inicial": float(shift_payload.get("opening_balance") or 0),
                        "ingresos": float(shift_payload.get("sales_total") or 0),
                        "salidas": float(
                            (shift_payload.get("withdrawals_total") or 0)
                            + (shift_payload.get("vouchers_total") or 0)
                            + (shift_payload.get("losses_total") or 0)
                        ),
                        "start_time": shift_payload.get("start_at"),
                        "end_time": shift_payload.get("end_at"),
                        "efectivo": float(shift_payload.get("cash_total") or 0),
                        "transferencia": float(shift_payload.get("transfer_total") or 0),
                        "online": float(shift_payload.get("online_total") or 0),
                        "debito": float(shift_payload.get("debit_total") or 0),
                        "mixto": 0.0,
                        "movimientos": list(shift_payload.get("movements") or []),
                    })

        shifts.sort(key=lambda shift: str(shift.get("start_time") or ""), reverse=True)

        resolved_date = str(day_payload.get("date") or date_value).strip()
        if not _is_valid_cashbox_date(resolved_date):
            continue

        report.append({
            "date": resolved_date,
            "total_ingresos": float(day_payload.get("sales_total") or 0),
            "total_salidas": float(
                (day_payload.get("withdrawals_total") or 0)
                + (day_payload.get("vouchers_total") or 0)
                + (day_payload.get("losses_total") or 0)
            ),
            "neto_dia": float(day_payload.get("cash_balance") or 0),
            "efectivo": float(day_payload.get("cash_total") or 0),
            "transferencia": float(day_payload.get("transfer_total") or 0),
            "online": float(day_payload.get("online_total") or 0),
            "debito": float(day_payload.get("debit_total") or 0),
            "mixto": 0.0,
            "shifts": shifts,
        })

    return report


def _refresh_cashbox_snapshot(db: Session, install) -> None:
    if not install:
        return
    try:
        client = YummyIntegrationClient(install.base_url, install.api_key)
        report = _build_remote_cashbox_report(client)
        if isinstance(report, list):
            save_installation_snapshot(
                db,
                install.id,
                CASHBOX_SNAPSHOT_KEY,
                {"report": report},
            )
    except Exception:
        pass


def _summarize_snapshot_shift_movements(movements: list[dict]):
    totals = {
        "withdrawals_total": 0.0,
        "vouchers_total": 0.0,
        "losses_total": 0.0,
    }
    normalized_movements = []
    for movement in list(movements or []):
        movement_type = str(movement.get("type") or movement.get("movement_type") or "").strip().lower()
        amount = abs(float(movement.get("amount") or 0))
        if movement_type == "retiro":
            totals["withdrawals_total"] += amount
        elif movement_type in {"vale", "adelanto"}:
            totals["vouchers_total"] += amount
        elif movement_type == "perdida":
            totals["losses_total"] += amount
        normalized_movements.append({
            "movement_type": movement.get("type") or movement.get("movement_type") or "",
            "type": movement.get("type") or movement.get("movement_type") or "",
            "amount": amount,
            "notes": movement.get("notes") or "",
            "created_at": movement.get("created_at") or movement.get("movement_date") or "",
            "movement_date": movement.get("movement_date") or "",
            "employee_name": movement.get("employee_name") or "",
        })
    return totals, normalized_movements


def _build_shift_summary_from_snapshot(report: list[dict], movement_date: str, shift: str, closed_at: Optional[str] = None):
    target_date = str(movement_date or "").strip()
    target_shift = str(shift or "general").strip().lower() or "general"
    target_closed_at = str(closed_at or "").strip()

    for day_report in list(report or []):
        if str(day_report.get("date") or "").strip() != target_date:
            continue
        for shift_row in list(day_report.get("shifts") or []):
            shift_label = str(shift_row.get("shift_label") or shift_row.get("shift_id") or "general").strip().lower() or "general"
            shift_end_time = str(shift_row.get("end_time") or "").strip()
            if shift_label != target_shift:
                continue
            if target_closed_at and shift_end_time and shift_end_time != target_closed_at:
                continue

            movement_totals, normalized_movements = _summarize_snapshot_shift_movements(shift_row.get("movimientos") or [])
            opening_balance = float(shift_row.get("saldo_inicial") or 0)
            cash_total = float(shift_row.get("efectivo") or 0)
            cash_balance = opening_balance + cash_total - (
                movement_totals["withdrawals_total"]
                + movement_totals["vouchers_total"]
                + movement_totals["losses_total"]
            )

            return {
                "date": target_date,
                "shift": str(shift_row.get("shift_label") or shift or "general").strip() or "general",
                "opening_balance": opening_balance,
                "sales_total": float(shift_row.get("ingresos") or 0),
                "cash_balance": cash_balance,
                "cash_total": cash_total,
                "transfer_total": float(shift_row.get("transferencia") or 0),
                "online_total": float(shift_row.get("online") or 0),
                "debit_total": float(shift_row.get("debito") or 0),
                "withdrawals_total": movement_totals["withdrawals_total"],
                "vouchers_total": movement_totals["vouchers_total"],
                "losses_total": movement_totals["losses_total"],
                "start_at": shift_row.get("start_time"),
                "end_at": shift_row.get("end_time"),
                "movements": normalized_movements,
                "products": [],
                "sales": [],
                "snapshot": True,
            }
    return None


def _format_order_item_detail(item: dict) -> str:
    quantity = item.get("quantity", 1) or 1
    name = str(item.get("product_name") or item.get("name") or "Producto").strip()
    parts = [f"{quantity}x {name}"]

    for entry in item.get("guarniciones", []) or []:
        entry_name = str(entry.get("name", "")).strip()
        if entry_name:
            parts.append(f"  - {entry.get('quantity', 1) or 1}x {entry_name}")

    for entry in item.get("extras", []) or []:
        entry_name = str(entry.get("name", "")).strip()
        if entry_name:
            parts.append(f"  + {entry.get('quantity', 1) or 1}x {entry_name}")

    for entry in item.get("toppings", []) or []:
        entry_name = str(entry.get("name", "")).strip()
        if entry_name:
            parts.append(f"  + {entry_name}")

    return "\n".join(parts)


def get_installation_for_user(
    db: Session,
    current_user: User,
    installation_id: Optional[str] = None,
    online_only: bool = False,
):
    query = db.query(YummyInstallation).filter(
        YummyInstallation.organization_id == current_user.organization_id,
    )
    if installation_id:
        query = query.filter(YummyInstallation.id == installation_id)
    install = query.order_by(YummyInstallation.last_health_check.desc().nullslast(), YummyInstallation.created_at.desc()).first()
    if online_only and not installation_is_online(install):
        return None
    return install


def installation_runtime_status(install: Optional[YummyInstallation]) -> str:
    if not install:
        return "OFFLINE"
    if str(install.connection_status or "").upper() == "REVOKED":
        return "REVOKED"
    if not install.last_health_check:
        return str(install.connection_status or "PENDING").upper()
    elapsed = (datetime.utcnow() - install.last_health_check).total_seconds()
    if elapsed > OFFLINE_FALLBACK_THRESHOLD_SECONDS:
        return "OFFLINE"
    return "ONLINE"


def installation_is_online(install: Optional[YummyInstallation]) -> bool:
    return installation_runtime_status(install) == "ONLINE"


def save_installation_snapshot(
    db: Session,
    installation_id,
    snapshot_key: str,
    payload: dict,
):
    db.add(
        YummySnapshot(
            installation_id=installation_id,
            snapshot_data={
                "snapshot_key": snapshot_key,
                "payload": payload,
                "saved_at": datetime.utcnow().isoformat(),
            },
            status="SUCCESS",
        )
    )
    db.commit()


def load_installation_snapshot(
    db: Session,
    installation_id,
    snapshot_key: str,
):
    row = (
        db.query(YummySnapshot)
        .filter(YummySnapshot.installation_id == installation_id)
        .filter(YummySnapshot.snapshot_data["snapshot_key"].as_string() == snapshot_key)
        .order_by(YummySnapshot.created_at.desc())
        .first()
    )
    if row:
        data = row.snapshot_data or {}
        return data.get("payload") or {}
    return None


def save_employees_snapshot(
    db: Session,
    installation_id,
    *,
    employees=None,
    novedades=None,
):
    current_payload = load_installation_snapshot(db, installation_id, EMPLOYEES_SNAPSHOT_KEY) or {}
    next_payload = {
        "employees": current_payload.get("employees", []),
        "novedades": current_payload.get("novedades", []),
    }
    if employees is not None:
        next_payload["employees"] = employees
    if novedades is not None:
        next_payload["novedades"] = novedades
    save_installation_snapshot(db, installation_id, EMPLOYEES_SNAPSHOT_KEY, next_payload)


def employees_payload_has_error(payload: list[dict]) -> bool:
    if not payload:
        return False
    first = payload[0] or {}
    return str(first.get("id")) == "999" or str(first.get("role", "")).strip().lower() == "error"


def novedades_payload_has_error(payload: list[dict]) -> bool:
    if not payload:
        return False
    first = payload[0] or {}
    return str(first.get("id")) == "999" or str(first.get("event_type", "")).strip().lower() == "error"


def employee_novedades_from_rows(employees: list[dict]) -> list[dict]:
    def sort_value(value):
        text = str(value or "").replace("pago-", "").strip()
        return int(text) if text.isdigit() else 0

    rows = []
    for employee in employees or []:
        employee_id = employee.get("id")
        employee_name = employee.get("name") or employee.get("employee_name") or ""
        for event in employee.get("events", []) or []:
            rows.append({
                "id": event.get("id"),
                "employee_id": event.get("employee_id") or employee_id,
                "employee_name": event.get("employee_name") or employee_name,
                "event_type": event.get("event_type") or "adelanto",
                "amount": event.get("amount") or 0,
                "event_date": event.get("event_date") or event.get("date") or "",
                "sort_at": event.get("sort_at") or event.get("created_at") or event.get("event_date") or "",
                "sort_order": event.get("sort_order") or event.get("id") or 0,
                "notes": event.get("notes") or "",
            })
        for payment in employee.get("payments", []) or []:
            payment_id = str(payment.get("id") or "")
            rows.append({
                "id": payment_id if payment_id.startswith("pago-") else f"pago-{payment_id}",
                "employee_id": payment.get("employee_id") or employee_id,
                "employee_name": payment.get("employee_name") or employee_name,
                "event_type": payment.get("event_type") or payment.get("payment_type") or "adelanto",
                "amount": payment.get("amount") or 0,
                "event_date": payment.get("event_date") or payment.get("payment_date") or "",
                "sort_at": payment.get("sort_at") or payment.get("created_at") or payment.get("payment_date") or "",
                "sort_order": payment.get("sort_order") or payment.get("id") or 0,
                "notes": payment.get("notes") or "",
            })
    return sorted(rows, key=lambda item: (sort_value(item.get("sort_order")), str(item.get("id") or "")), reverse=True)


def get_integration_client_for_installation(
    db: Session,
    current_user: User,
    installation_id: Optional[str] = None,
):
    from app.services.yummy_client import YummyIntegrationClient

    query = db.query(YummyInstallation).filter(
        YummyInstallation.organization_id == current_user.organization_id,
    )
    if installation_id:
        query = query.filter(YummyInstallation.id == installation_id)
    install = query.order_by(YummyInstallation.last_health_check.desc().nullslast(), YummyInstallation.created_at.desc()).first()
    if not install or not installation_is_online(install):
        raise HTTPException(status_code=503, detail="Yummy is not ONLINE")
    return YummyIntegrationClient(install.base_url, install.api_key)

@router.get("/products")
def get_products(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_products(db)

@router.post("/products")
def create_product(data: ProductData, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.create_product(db, data.dict())

@router.put("/products/{product_id}")
def update_product(product_id: int, data: ProductData, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.update_product(db, product_id, data.dict())

@router.delete("/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.delete_product(db, product_id)

class ReorderData(BaseModel):
    ordered_ids: list[int]

@router.post("/products/reorder")
def reorder_products(data: ReorderData, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.reorder_products(db, data.ordered_ids)

@router.patch("/products/{product_id}/stock")
def update_product_stock(
    product_id: int,
    data: StockData,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    target_stock = float(data.stock)
    install = get_installation_for_user(db, current_user, installation_id, online_only=False)
    if not install:
        raise HTTPException(status_code=404, detail="Instalación no encontrada")

    if installation_is_online(install):
        client = YummyIntegrationClient(install.base_url, install.api_key)
        try:
            current_rows = client.execute_sql(
                """
                SELECT COALESCE(stock_quantity, 0)
                FROM productos
                WHERE id = ?
                LIMIT 1
                """,
                [product_id],
            )
            rows = (current_rows or {}).get("rows", [])
            if not rows:
                raise HTTPException(status_code=404, detail="Producto no encontrado")

            current_stock = float(rows[0][0] or 0)
            diff = target_stock - current_stock
            if abs(diff) < 0.0001:
                return {"success": True, "new_stock": current_stock, "message": "Sin cambios"}

            movement_type = "ingreso" if diff > 0 else "salida"
            payload = client.request(
                "POST",
                "/api/integration/stock/movimientos",
                payload={
                    "product_id": product_id,
                    "movement_type": movement_type,
                    "quantity": abs(diff),
                    "notes": "Ajuste rapido desde panel central",
                },
            )
            return {
                "success": True,
                "previous_stock": current_stock,
                "new_stock": target_stock,
                "movement": payload.get("data") if isinstance(payload, dict) else payload,
            }
        except requests.RequestException:
            return _queue_installation_action(
                db,
                install,
                current_user,
                "ADJUST_STOCK",
                {
                    "product_id": product_id,
                    "target_stock": target_stock,
                    "notes": "Ajuste rapido desde panel central",
                },
                "Ajuste de stock en cola. Se aplicará cuando el local vuelva a estar online.",
                extra_response={
                    "success": True,
                    "previous_stock": None,
                    "new_stock": target_stock,
                    "product_id": product_id,
                },
                mark_offline=True,
            )

    return _queue_installation_action(
        db,
        install,
        current_user,
        "ADJUST_STOCK",
        {
            "product_id": product_id,
            "target_stock": target_stock,
            "notes": "Ajuste rapido desde panel central",
        },
        "Ajuste de stock en cola. Se aplicará cuando el local vuelva a estar online.",
        extra_response={
            "success": True,
            "previous_stock": None,
            "new_stock": target_stock,
            "product_id": product_id,
        },
    )

@router.get("/clients")
def get_clients(
    installation_id: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=5000, ge=1, le=5000),
    search: Optional[str] = Query(default=None),
    paged: bool = Query(default=False),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    params = {
        "page": page,
        "page_size": page_size,
    }
    if search:
        params["search"] = search
    payload = client.request("GET", f"/api/clientes?{urlencode(params)}")
    if isinstance(payload, dict):
        payload_data = payload.get("data") or payload
        items = payload_data.get("items") or []
        if paged:
            return {
                "items": items,
                "total": int(payload_data.get("total") or len(items)),
                "page": int(payload_data.get("page") or page),
                "page_size": int(payload_data.get("page_size") or page_size),
            }
        return items
    return payload if isinstance(payload, list) else []

@router.post("/clients")
def create_client(
    data: ClientData,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    request_payload = data.model_dump(exclude_none=True)
    request_payload["name"] = str(request_payload.get("name") or "").strip() or "Cliente"
    request_payload["addresses"] = [request_payload["address"]] if str(request_payload.get("address") or "").strip() else []
    payload = client.request("POST", "/api/clientes", payload=request_payload)
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload

@router.put("/clients/{client_id}")
def update_client(
    client_id: int,
    data: ClientData,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    request_payload = data.model_dump(exclude_none=True)
    request_payload["name"] = str(request_payload.get("name") or "").strip() or "Cliente"
    request_payload["addresses"] = [request_payload["address"]] if str(request_payload.get("address") or "").strip() else []
    payload = client.request("PUT", f"/api/clientes/{client_id}", payload=request_payload)
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload

@router.delete("/clients/{client_id}")
def delete_client(
    client_id: int,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request("DELETE", f"/api/clientes/{client_id}")
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


@router.post("/clients/{client_id}/reset-monthly")
def reset_client_monthly_counts(
    client_id: int,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request("POST", f"/api/clientes/{client_id}/reset-monthly")
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload

@router.get("/employees")
def get_employees(
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    install = get_installation_for_user(db, current_user, installation_id, online_only=False)
    if not install:
        return []

    try:
        client = YummyIntegrationClient(install.base_url, install.api_key)
        payload = client.request("GET", "/api/integration/employees")
        employees = _extract_remote_payload(payload)
        if employees_payload_has_error(employees):
            raise RuntimeError("Remote employees snapshot unavailable")
        save_employees_snapshot(db, install.id, employees=employees)
        return employees
    except Exception:
        pass

    snapshot = load_installation_snapshot(db, install.id, EMPLOYEES_SNAPSHOT_KEY) or {}
    return snapshot.get("employees", [])

@router.get("/employees/novedades")
def get_empleado_novedades(
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    install = get_installation_for_user(db, current_user, installation_id, online_only=False)
    if not install:
        return []

    try:
        client = YummyIntegrationClient(install.base_url, install.api_key)
        payload = client.request("GET", "/api/integration/employees/novedades")
        novedades = _extract_remote_payload(payload)
        if novedades_payload_has_error(novedades):
            raise RuntimeError("Remote employees snapshot unavailable")
        if not novedades:
            employee_payload = client.request("GET", "/api/integration/employees")
            novedades = employee_novedades_from_rows(_extract_remote_payload(employee_payload) or [])
        save_employees_snapshot(db, install.id, novedades=novedades)
        return novedades
    except Exception:
        pass

    snapshot = load_installation_snapshot(db, install.id, EMPLOYEES_SNAPSHOT_KEY) or {}
    novedades = snapshot.get("novedades", [])
    if novedades:
        return novedades
    return employee_novedades_from_rows(snapshot.get("employees", []))

@router.post("/employees/{employee_id}/novedad")
def add_empleado_novedad(
    employee_id: int,
    data: NovedadData,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request("POST", f"/api/integration/employees/{employee_id}/novedades", payload=data.dict())
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


@router.delete("/employees/novedades/{event_id}")
def delete_empleado_novedad(
    event_id: str,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    normalized_event_id = str(event_id or "").strip()
    if normalized_event_id.startswith("pago-"):
        payment_id = normalized_event_id.split("pago-", 1)[1].strip()
        if not payment_id.isdigit():
            raise HTTPException(status_code=400, detail="ID de pago inválido")
        payload = client.request("DELETE", f"/api/integration/employee-payments/{payment_id}")
    else:
        payload = client.request("DELETE", f"/api/integration/employee-events/{normalized_event_id}")
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


@router.put("/employees/{employee_id}")
def update_employee(
    employee_id: int,
    data: EmployeeUpdateData,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request("PUT", f"/api/integration/employees/{employee_id}", payload=data.model_dump())
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


@router.post("/employees/{employee_id}/reset")
def reset_employee(
    employee_id: int,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request("POST", f"/api/integration/employees/{employee_id}/reset", payload={})
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload

@router.get("/caja")
def get_caja(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_caja_movimientos(db)

@router.get("/repartidores")
def get_repartidores(
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request("GET", "/api/integration/repartidores")
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload

@router.get("/caja/report")
def get_caja_report(
    installation_id: Optional[str] = Query(default=None),
    days: int = Query(default=10, ge=1, le=30),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    install = get_installation_for_user(db, current_user, installation_id, online_only=False)
    if not install:
        return []

    if installation_is_online(install):
        try:
            client = YummyIntegrationClient(install.base_url, install.api_key)
            report = _build_remote_cashbox_report(client, days_limit=days)
            if isinstance(report, list) and len(report) == 0:
                client.check_health()
            if not isinstance(report, list):
                raise RuntimeError("Remote cash report unavailable")
            save_installation_snapshot(
                db,
                install.id,
                CASHBOX_SNAPSHOT_KEY,
                {"report": report},
            )
            return report
        except Exception:
            pass

    snapshot = load_installation_snapshot(db, install.id, CASHBOX_SNAPSHOT_KEY) or {}
    return snapshot.get("report", [])

@router.get("/client/{phone}")
def get_client_by_phone(phone: str, db: Session = Depends(deps.get_yummy_db)):
    from fastapi import HTTPException
    client = ModulesExtractor.search_client_by_phone(db, phone)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return client


@router.get("/clients/by-phone/{phone}")
def get_clients_by_phone(
    phone: str,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    install = get_installation_for_user(db, current_user, installation_id, online_only=False)
    if install and installation_is_online(install):
        try:
            client = YummyIntegrationClient(install.base_url, install.api_key)
            payload = _extract_remote_payload(client.request("GET", f"/api/clientes/lookup?phone={phone}"))
            if isinstance(payload, dict):
                raw_addresses = payload.get("addresses") or []
                addresses = []
                for address_row in raw_addresses:
                    address_value = str(
                        address_row.get("address") if isinstance(address_row, dict) else address_row
                    ).strip()
                    if address_value:
                        addresses.append({
                            "client_id": payload.get("id"),
                            "address": address_value,
                            "name": payload.get("name") or "",
                            "notes": payload.get("notes") or "",
                        })
                main_address = str(payload.get("address") or "").strip()
                if main_address and not any(row["address"].lower() == main_address.lower() for row in addresses):
                    addresses.insert(0, {
                        "client_id": payload.get("id"),
                        "address": main_address,
                        "name": payload.get("name") or "",
                        "notes": payload.get("notes") or "",
                    })
                return {
                    "matches": [payload],
                    "addresses": addresses,
                }
        except Exception:
            pass

    from app.db.session import SessionLocal

    local_db = SessionLocal()
    try:
        clients = ModulesExtractor.search_clients_by_phone(local_db, phone)
    except Exception:
        clients = []
    finally:
        local_db.close()

    if not clients:
        return {
            "matches": [],
            "addresses": [],
        }

    addresses = []
    seen = set()
    for client in clients:
        raw_address = str(client.get("address") or "").strip()
        if not raw_address:
            continue
        key = raw_address.lower()
        if key in seen:
            continue
        seen.add(key)
        addresses.append(
            {
                "client_id": client.get("id"),
                "address": raw_address,
                "name": client.get("name") or "",
                "notes": client.get("notes") or "",
            }
        )

    return {
        "matches": clients,
        "addresses": addresses,
    }

@router.get("/repartidores/history")
def get_global_repartidor_history(
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request("GET", "/api/integration/repartidores/history")
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


@router.get("/repartidores/delivered")
def get_repartidores_delivered(
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request("GET", "/api/integration/repartidores/delivered")
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


@router.get("/repartidores/export/xlsx")
def export_repartidores_xlsx(
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    url = f"{client.base_url}/api/repartidores/export/xlsx"
    response = requests.get(url, headers={"X-Integration-Key": client.api_key}, timeout=30)
    response.raise_for_status()
    content_type = response.headers.get(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    content_disposition = response.headers.get(
        "Content-Disposition",
        "attachment; filename=repartidores.xlsx",
    )
    return Response(
        content=response.content,
        media_type=content_type,
        headers={"Content-Disposition": content_disposition},
    )

@router.get("/dashboard/metrics")
def get_dashboard_metrics(
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    install = get_installation_for_user(db, current_user, installation_id, online_only=False)
    if not install or not installation_is_online(install):
        return {
            "ventas_turno": 0, "pedidos_activos": 0, "pedidos_finalizados": 0,
            "product_sales": [], "stock_levels": []
        }

    client = get_integration_client_for_installation(db, current_user, installation_id)
    try:
        metrics = client.get_metrics() or {}

        stock_rows = client.execute_sql(
            """
            SELECT id, name, COALESCE(stock_quantity, 0) as stock
            FROM productos
            ORDER BY COALESCE(stock_quantity, 0) ASC, name ASC
            """,
            {},
        )
        stock_levels = []
        for row in (stock_rows or {}).get("rows", []):
            stock_levels.append({
                "id": row[0],
                "name": row[1],
                "stock": float(row[2] or 0),
            })

        product_sales = []
        if isinstance(metrics.get("product_sales"), list):
            for row in metrics.get("product_sales") or []:
                product_sales.append({
                    "name": row.get("name") or "",
                    "sold_turno": float(row.get("sold_turno") or 0),
                    "sold_dia": float(row.get("sold_dia") or 0),
                })

        return {
            "ventas_turno": float(metrics.get("ventas_turno") or 0),
            "pedidos_activos": int(metrics.get("pedidos_activos") or 0),
            "pedidos_finalizados": int(metrics.get("pedidos_finalizados") or 0),
            "product_sales": product_sales,
            "stock_levels": stock_levels,
            "dashboard_shift_start": metrics.get("dashboard_shift_start"),
            "dashboard_shift_end": metrics.get("dashboard_shift_end"),
            "dashboard_shift_label": metrics.get("dashboard_shift_label"),
            "dashboard_shift_open": bool(metrics.get("dashboard_shift_open")),
            "dashboard_shift_closed_at": metrics.get("dashboard_shift_closed_at"),
            "dashboard_shift_status": metrics.get("dashboard_shift_status") or "",
            "dashboard_shift_status_label": metrics.get("dashboard_shift_status_label") or "",
            "dashboard_shift_reference_date": metrics.get("dashboard_shift_reference_date") or "",
        }
    except Exception as e:
        print("Error fetching metrics from remote:", e)
        return {
            "ventas_turno": 0, "pedidos_activos": 0, "pedidos_finalizados": 0,
            "product_sales": [], "stock_levels": [],
            "dashboard_shift_start": None,
            "dashboard_shift_end": None,
            "dashboard_shift_label": "general",
            "dashboard_shift_open": False,
            "dashboard_shift_closed_at": None,
            "dashboard_shift_status": "waiting_open",
            "dashboard_shift_status_label": "Esperando nuevo turno",
            "dashboard_shift_reference_date": "",
        }

@router.get("/repartidor/{id}/history")
def get_repartidor_history(id: int, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_repartidor_history(db, id)

@router.get("/schema_dump")
def dump_schema(db: Session = Depends(deps.get_yummy_db)):
    try:
        from app.services.extractor_modules import ModulesExtractor
        res = ModulesExtractor.get_active_pedidos(db)
        return res
    except Exception as e:
        return {"error": str(e)}

@router.get("/cocina/pedidos")
def get_cocina_pedidos(
    installation_id: Optional[str] = Query(default=None),
    kitchen_view: bool = Query(default=False),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    return _fetch_active_orders_for_installation(db, current_user, installation_id, kitchen_view=kitchen_view)


@router.get("/pedidos/export/xlsx")
def export_pedidos_xlsx(
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    orders = _fetch_active_orders_for_installation(db, current_user, installation_id)

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Pedidos Activos"

    headers = [
        "Pedido",
        "Estado",
        "Cliente",
        "Dirección",
        "Tipo",
        "Pago",
        "Total",
        "Creado",
        "Detalle",
        "Notas",
    ]
    sheet.append(headers)
    for cell in sheet[1]:
        cell.font = Font(bold=True)

    for order in orders:
        detail_lines = [_format_order_item_detail(item) for item in (order.get("items", []) or [])]
        sheet.append([
            order.get("id"),
            order.get("state") or order.get("status") or "",
            str(order.get("client_name") or order.get("customer_name") or "").strip(),
            str(order.get("customer_address") or order.get("address") or "").strip(),
            str(order.get("order_type") or "").strip(),
            str(order.get("payment_method") or "").strip(),
            float(order.get("total") or 0),
            str(order.get("created_at") or order.get("order_time") or "").strip(),
            "\n".join(detail_lines),
            str(order.get("notes") or "").strip(),
        ])

    widths = {
        "A": 12,
        "B": 16,
        "C": 26,
        "D": 34,
        "E": 14,
        "F": 16,
        "G": 14,
        "H": 22,
        "I": 70,
        "J": 32,
    }
    for column, width in widths.items():
        sheet.column_dimensions[column].width = width

    for row in sheet.iter_rows(min_row=2):
        sheet.row_dimensions[row[0].row].height = 36
        for cell in row:
            cell.alignment = Alignment(wrap_text=True, vertical="top")

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    filename = f"pedidos_activos_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@router.get("/cocina/config")
def get_cocina_config():
    try:
        client = get_integration_client()
        if not client: return {}
        parsed = client.request("GET", "/api/comandero/config")
        return parsed.get('data', {}) if isinstance(parsed, dict) and 'data' in parsed else parsed
    except Exception:
        return {}

@router.put("/cocina/comandas/{order_id}/{kitchen_key}/state")
def update_cocina_state(order_id: int, kitchen_key: str, data: dict):
    try:
        client = get_integration_client()
        if not client: return {}
        return client.request("PUT", f"/api/comandas/{order_id}/{kitchen_key}/state", payload=data)
    except Exception:
        return {}

from pydantic import BaseModel
from typing import Optional

class CajaMovimientoData(BaseModel):
    movement_type: str
    amount: float
    payment_method: str = "efectivo"
    movement_date: str
    employee_id: Optional[int] = None
    employee_name: Optional[str] = ""
    notes: Optional[str] = ""
    source_type: Optional[str] = ""
    source_id: Optional[int] = None

from fastapi import Request, Depends
from sqlalchemy.orm import Session
from app.api import deps
from app.models.yummy import YummyInstallation

@router.put("/pedidos/{order_id}")
async def update_pedido(
    order_id: int,
    request: Request,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    try:
        data = await request.json()
        install = get_installation_for_user(db, current_user, installation_id, online_only=True)
        if not install:
            raise HTTPException(status_code=404, detail="Local no encontrado o sin conexión.")
        client = YummyIntegrationClient(install.base_url, install.api_key)
        payload = client.request("PUT", f"/api/v1/data/pedidos/{order_id}", payload=data)
        updated = payload.get("data") if isinstance(payload, dict) and "data" in payload else payload
        _fetch_active_orders_for_installation(db, current_user, str(install.id))
        return updated
    except HTTPException:
        raise
    except requests.exceptions.HTTPError as e:
        detail = str(e)
        status_code = 502
        response = getattr(e, "response", None)
        if response is not None:
            status_code = response.status_code
            try:
                detail = response.json().get("error") or response.json().get("detail") or detail
            except ValueError:
                detail = response.text or detail
        raise HTTPException(status_code=status_code, detail=detail)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/pedidos/{order_id}/cancel")
async def cancel_pedido(
    order_id: int,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    try:
        client = get_integration_client_for_installation(db, current_user, installation_id)
        payload = client.request("DELETE", f"/api/pedidos/{order_id}")
        return payload.get("data") if isinstance(payload, dict) and "data" in payload else payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/caja/movimiento")
def add_caja_movimiento(
    data: CajaMovimientoData,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    install = get_installation_for_user(db, current_user, installation_id, online_only=False)
    if not install:
        raise HTTPException(status_code=404, detail="Instalación no encontrada")

    request_payload = data.dict(exclude_none=True)
    if installation_is_online(install):
        client = YummyIntegrationClient(install.base_url, install.api_key)
        try:
            return client.request("POST", "/api/caja/movimientos", payload=request_payload)
        except requests.RequestException:
            return _queue_installation_action(
                db,
                install,
                current_user,
                "ADD_CASH_MOVEMENT",
                request_payload,
                "Movimiento de caja en cola. Se enviará cuando el local vuelva a estar online.",
                extra_response={"success": True, "movement_type": request_payload.get("movement_type")},
                mark_offline=True,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return _queue_installation_action(
        db,
        install,
        current_user,
        "ADD_CASH_MOVEMENT",
        request_payload,
        "Movimiento de caja en cola. Se enviará cuando el local vuelva a estar online.",
        extra_response={"success": True, "movement_type": request_payload.get("movement_type")},
    )


@router.post("/caja/reset-turno")
def close_cash_shift(
    data: CashShiftCloseData,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    install = get_installation_for_user(db, current_user, installation_id, online_only=False)
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request("POST", "/api/integration/caja/reset-turno", payload=data.model_dump(exclude_none=True))
    _refresh_cashbox_snapshot(db, install)
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


@router.get("/caja/shift-summary")
def get_cash_shift_summary(
    shift: str,
    movement_date: str = Query(alias="date"),
    closed_at: Optional[str] = None,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    install = get_installation_for_user(db, current_user, installation_id, online_only=False)
    if not install:
        raise HTTPException(status_code=404, detail="Instalación no encontrada")

    if installation_is_online(install):
        client = get_integration_client_for_installation(db, current_user, installation_id)
        query = f"/api/integration/caja/shift-summary?date={movement_date}&shift={shift}"
        if closed_at:
            query += f"&closed_at={closed_at}"
        payload = client.request("GET", query)
        if isinstance(payload, dict) and "data" in payload:
            return payload["data"]
        return payload

    snapshot = load_installation_snapshot(db, install.id, CASHBOX_SNAPSHOT_KEY) or {}
    summary = _build_shift_summary_from_snapshot(
        snapshot.get("report", []),
        movement_date=movement_date,
        shift=shift,
        closed_at=closed_at,
    )
    if summary:
        return summary
    raise HTTPException(status_code=503, detail="No hay un cierre guardado para reimprimir en modo offline")


@router.post("/caja/shift-delete")
def delete_cash_shift(
    data: CashShiftDeleteData,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    install = get_installation_for_user(db, current_user, installation_id, online_only=False)
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request("POST", "/api/integration/caja/shift/delete", payload=data.model_dump(exclude_none=True))
    _refresh_cashbox_snapshot(db, install)
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload

class UsuarioData(BaseModel):
    username: str
    password: str = ""
    role: str = "cajero"
    active: bool = True

MANAGED_USER_VIEWS = [
    "inicio",
    "dashboard",
    "caja",
    "productos",
    "clientes",
    "empleados",
    "repartidores",
    "entregadosDelivery",
    "auditoria",
    "reportes",
    "backup",
    "licencia",
    "manager",
    "comandero",
]


def default_allowed_views_for_role(role: str) -> list[str]:
    normalized = str(role or "").strip().lower()
    role_map = {
        "admin": list(MANAGED_USER_VIEWS),
        "encargado": list(MANAGED_USER_VIEWS),
        "cajero": ["inicio", "caja", "clientes"],
    }
    return role_map.get(normalized, list(MANAGED_USER_VIEWS))


@router.get("/usuarios")
def get_usuarios(
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request("GET", "/api/integration/auth/users")
    if isinstance(payload, dict):
        return payload.get("data") or []
    return payload if isinstance(payload, list) else []


@router.post("/usuarios")
def create_usuario(
    data: UsuarioData,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request(
        "POST",
        "/api/integration/auth/users",
        payload={
            "username": data.username,
            "password": data.password,
            "role": data.role,
            "active": data.active,
            "allowed_views": default_allowed_views_for_role(data.role),
        },
    )
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


@router.put("/usuarios/{user_id}")
def update_usuario(
    user_id: int,
    data: UsuarioData,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request(
        "PUT",
        f"/api/integration/auth/users/{user_id}",
        payload={
            "username": data.username,
            "role": data.role,
            "active": data.active,
            "allowed_views": default_allowed_views_for_role(data.role),
        },
    )
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


@router.put("/usuarios/{user_id}/password")
def update_usuario_password(
    user_id: int,
    data: dict,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    password = str(data.get("password") or "").strip()
    if not password:
        raise HTTPException(status_code=400, detail="Password is required")
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request(
        "PUT",
        f"/api/integration/auth/users/{user_id}/password",
        payload={"password": password},
    )
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


@router.put("/usuarios/{user_id}/status")
def toggle_usuario_status(
    user_id: int,
    data: dict,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    active = data.get("active")
    if active is None:
        raise HTTPException(status_code=400, detail="Active status is required")

    client = get_integration_client_for_installation(db, current_user, installation_id)
    users_payload = client.request("GET", "/api/integration/auth/users")
    users = users_payload.get("data") if isinstance(users_payload, dict) else users_payload
    target = next((item for item in (users or []) if int(item.get("id") or 0) == user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    payload = client.request(
        "PUT",
        f"/api/integration/auth/users/{user_id}",
        payload={
            "username": target.get("username") or "",
            "role": target.get("role") or "custom",
            "active": bool(active),
            "allowed_views": target.get("allowed_views") or list(MANAGED_USER_VIEWS),
        },
    )
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


@router.delete("/usuarios/{user_id}")
def delete_usuario(
    user_id: int,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request("DELETE", f"/api/integration/auth/users/{user_id}")
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload

@router.get("/audit-logs")
def get_audit_logs(
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    install = get_installation_for_user(db, current_user, installation_id, online_only=False)
    if not install:
        return []

    if installation_is_online(install):
        try:
            client = YummyIntegrationClient(install.base_url, install.api_key)
            remote = deps.RemoteSession(client)
            logs = ModulesExtractor.get_audit_logs(remote)
            if isinstance(logs, list) and len(logs) == 0:
                client.check_health()
            if not isinstance(logs, list):
                raise RuntimeError("Remote audit logs unavailable")
            save_installation_snapshot(
                db,
                install.id,
                AUDIT_LOGS_SNAPSHOT_KEY,
                {"logs": logs},
            )
            return logs
        except Exception:
            pass

    snapshot = load_installation_snapshot(db, install.id, AUDIT_LOGS_SNAPSHOT_KEY) or {}
    return snapshot.get("logs", [])
