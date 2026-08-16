from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.api import deps
from app.services.extractor_modules import ModulesExtractor
from app.services.yummy_client import YummyIntegrationClient
from app.models.user import User
from app.models.yummy import YummyInstallation, YummySnapshot
import requests

router = APIRouter()

from pydantic import BaseModel
from typing import Optional

def get_integration_client():
    from app.db.session import SessionLocal
    from app.models.yummy import YummyInstallation
    from app.services.yummy_client import YummyIntegrationClient
    
    db = SessionLocal()
    try:
        install = db.query(YummyInstallation).filter(
            YummyInstallation.connection_status == "ONLINE"
        ).order_by(YummyInstallation.last_health_check.desc()).first()
        if install:
            return YummyIntegrationClient(install.base_url, install.api_key)
        return None
    finally:
        db.close()

class ProductData(BaseModel):
    name: str
    price: float
    stock: int

class StockData(BaseModel):
    stock: int

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


EMPLOYEES_SNAPSHOT_KEY = "employees_snapshot_v1"


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
    if online_only:
        query = query.filter(YummyInstallation.connection_status == "ONLINE")
        return query.order_by(YummyInstallation.last_health_check.desc()).first()
    return query.order_by(YummyInstallation.last_health_check.desc().nullslast(), YummyInstallation.created_at.desc()).first()


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
        .order_by(YummySnapshot.created_at.desc())
        .all()
    )
    for snapshot in row:
        data = snapshot.snapshot_data or {}
        if data.get("snapshot_key") == snapshot_key:
            return data.get("payload") or {}
    return None


def get_integration_client_for_installation(
    db: Session,
    current_user: User,
    installation_id: Optional[str] = None,
):
    from app.services.yummy_client import YummyIntegrationClient

    query = db.query(YummyInstallation).filter(
        YummyInstallation.organization_id == current_user.organization_id,
        YummyInstallation.connection_status == "ONLINE",
    )
    if installation_id:
        query = query.filter(YummyInstallation.id == installation_id)
    install = query.order_by(YummyInstallation.last_health_check.desc()).first()
    if not install:
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
def update_product_stock(product_id: int, data: StockData, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.update_product_stock(db, product_id, data.stock)

@router.get("/clients")
def get_clients(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_clients(db)

@router.post("/clients")
def create_client(data: ClientData, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.create_client(db, data.dict())

@router.put("/clients/{client_id}")
def update_client(client_id: int, data: ClientData, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.update_client(db, client_id, data.dict())

@router.delete("/clients/{client_id}")
def delete_client(client_id: int, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.delete_client(db, client_id)

@router.get("/employees")
def get_employees(
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    install = get_installation_for_user(db, current_user, installation_id, online_only=False)
    if not install:
        return []

    if install.connection_status == "ONLINE":
        try:
            client = YummyIntegrationClient(install.base_url, install.api_key)
            remote = deps.RemoteSession(client)
            employees = ModulesExtractor.get_employees(remote)
            novedades = ModulesExtractor.get_empleado_novedades(remote)
            save_installation_snapshot(
                db,
                install.id,
                EMPLOYEES_SNAPSHOT_KEY,
                {"employees": employees, "novedades": novedades},
            )
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

    if install.connection_status == "ONLINE":
        try:
            client = YummyIntegrationClient(install.base_url, install.api_key)
            remote = deps.RemoteSession(client)
            employees = ModulesExtractor.get_employees(remote)
            novedades = ModulesExtractor.get_empleado_novedades(remote)
            save_installation_snapshot(
                db,
                install.id,
                EMPLOYEES_SNAPSHOT_KEY,
                {"employees": employees, "novedades": novedades},
            )
            return novedades
        except Exception:
            pass

    snapshot = load_installation_snapshot(db, install.id, EMPLOYEES_SNAPSHOT_KEY) or {}
    return snapshot.get("novedades", [])

@router.post("/employees/{employee_id}/novedad")
def add_empleado_novedad(employee_id: int, data: NovedadData):
    client = get_integration_client()
    if not client:
        raise HTTPException(status_code=503, detail="Yummy is not ONLINE")
    payload = client.request("POST", f"/api/integration/employees/{employee_id}/novedades", payload=data.dict())
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
def get_repartidores(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_repartidores(db)

@router.get("/caja/report")
def get_caja_report(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_caja_report(db)

@router.get("/client/{phone}")
def get_client_by_phone(phone: str, db: Session = Depends(deps.get_yummy_db)):
    from fastapi import HTTPException
    client = ModulesExtractor.search_client_by_phone(db, phone)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return client

@router.get("/repartidores/history")
def get_global_repartidor_history(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_global_repartidor_history(db)


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
def get_dashboard_metrics(db: Session = Depends(deps.get_db)):
    from app.models.yummy import YummyInstallation
    from app.services.yummy_client import YummyIntegrationClient
    
    install = db.query(YummyInstallation).filter(YummyInstallation.connection_status == "ONLINE").first()
    if not install:
        return {
            "ventas_turno": 0, "pedidos_activos": 0, "pedidos_finalizados": 0,
            "product_sales": [], "stock_levels": []
        }
        
    client = YummyIntegrationClient(install.base_url, install.api_key)
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

        product_sales_rows = client.execute_sql(
            """
            SELECT
                dp.product_name,
                COALESCE(SUM(dp.quantity), 0) AS sold
            FROM ventas v
            JOIN detalle_pedidos dp ON dp.order_id = v.order_id
            WHERE DATE(v.created_at) = CURRENT_DATE
            GROUP BY dp.product_name
            ORDER BY sold DESC, dp.product_name ASC
            LIMIT 5
            """,
            [],
        )
        product_sales = []
        for row in (product_sales_rows or {}).get("rows", []):
            sold = float(row[1] or 0)
            product_sales.append({
                "name": row[0] or "",
                "sold_turno": sold,
                "sold_dia": sold,
            })

        return {
            "ventas_turno": float(metrics.get("ventas_turno") or 0),
            "pedidos_activos": int(metrics.get("pedidos_activos") or 0),
            "pedidos_finalizados": int(metrics.get("pedidos_finalizados") or 0),
            "product_sales": product_sales,
            "stock_levels": stock_levels,
        }
    except Exception as e:
        print("Error fetching metrics from remote:", e)
        return {
            "ventas_turno": 0, "pedidos_activos": 0, "pedidos_finalizados": 0,
            "product_sales": [], "stock_levels": []
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
def get_cocina_pedidos():
    try:
        client = get_integration_client()
        if not client:
            return []
        parsed = client.request("GET", "/api/pedidos")
        return parsed.get("data", []) if isinstance(parsed, dict) else (parsed if isinstance(parsed, list) else [])
    except Exception as e:
        print("Error fetching pedidos:", e)
        return []

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
async def update_pedido(order_id: int, request: Request):
    try:
        data = await request.json()
        client = get_integration_client()
        if not client: return {}
        return client.request("PUT", f"/api/v1/data/pedidos/{order_id}", payload=data)
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/pedidos/{order_id}/cancel")
async def cancel_pedido(order_id: int):
    try:
        client = get_integration_client()
        if not client: return {}
        return client.request("POST", f"/api/v1/data/pedidos/{order_id}/cancel")
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/caja/movimiento")
def add_caja_movimiento(data: CajaMovimientoData):
    try:
        client = get_integration_client()
        if not client: return {}
        return client.request("POST", "/api/caja/movimientos", payload=data.dict(exclude_none=True))
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/caja/reset-turno")
def close_cash_shift(
    data: CashShiftCloseData,
    installation_id: Optional[str] = Query(default=None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    client = get_integration_client_for_installation(db, current_user, installation_id)
    payload = client.request("POST", "/api/integration/caja/reset-turno", payload=data.model_dump(exclude_none=True))
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
    client = get_integration_client_for_installation(db, current_user, installation_id)
    query = f"/api/integration/caja/shift-summary?date={movement_date}&shift={shift}"
    if closed_at:
        query += f"&closed_at={closed_at}"
    payload = client.request("GET", query)
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload

class UsuarioData(BaseModel):
    username: str
    password: str = ""
    role: str = "cajero"
    active: bool = True

@router.get("/usuarios")
def get_usuarios(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_usuarios(db)

@router.post("/usuarios")
def create_usuario(data: UsuarioData, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.create_usuario(db, data.dict())

@router.put("/usuarios/{user_id}/password")
def update_usuario_password(user_id: int, data: dict, db: Session = Depends(deps.get_yummy_db)):
    password = data.get("password")
    if not password:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Password is required")
    return ModulesExtractor.update_usuario_password(db, user_id, password)

@router.put("/usuarios/{user_id}/status")
def toggle_usuario_status(user_id: int, data: dict, db: Session = Depends(deps.get_yummy_db)):
    active = data.get("active")
    if active is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Active status is required")
    return ModulesExtractor.toggle_usuario_status(db, user_id, bool(active))

@router.get("/audit-logs")
def get_audit_logs(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_audit_logs(db)
