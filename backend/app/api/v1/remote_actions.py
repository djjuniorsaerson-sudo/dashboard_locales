from typing import Any, Optional
from uuid import UUID, uuid4

import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api import deps
from app.models.remote_action import RemoteAction, RemoteActionStatus
from app.models.user import User
from app.models.yummy import YummyInstallation

router = APIRouter()
RETRYABLE_REMOTE_ACTION_TYPES = {"CREATE_ORDER", "ADJUST_STOCK", "ADD_CASH_MOVEMENT"}
MAX_REMOTE_ACTION_RETRIES = 5


class CreateOrderPayload(BaseModel):
    customer_name: str
    customer_phone: Optional[str] = ""
    customer_address: Optional[str] = ""
    order_type: str
    payment_method: str
    allow_duplicate: bool = False
    payment_breakdown: Optional[dict] = None
    items: list[dict]


def get_installation_for_user(db: Session, installation_id: UUID, current_user: User) -> YummyInstallation:
    installation = db.query(YummyInstallation).filter(
        YummyInstallation.id == installation_id,
        YummyInstallation.organization_id == current_user.organization_id,
    ).first()
    if not installation:
        raise HTTPException(status_code=404, detail="Installation not found")
    return installation


def get_remote_action_retry_count(action: RemoteAction) -> int:
    payload = action.result_payload if isinstance(action.result_payload, dict) else {}
    try:
        return int(payload.get("_retry_count") or 0)
    except (TypeError, ValueError):
        return 0


def set_remote_action_retry_meta(action: RemoteAction, retry_count: int, queued: bool = False) -> None:
    payload = dict(action.result_payload or {})
    payload["_retry_count"] = max(0, int(retry_count))
    payload["_queued"] = bool(queued)
    action.result_payload = payload


def action_payload_summary(action: RemoteAction) -> str:
    payload = action.payload if isinstance(action.payload, dict) else {}
    action_type = str(action.action_type or "").strip().upper()
    if action_type == "CREATE_ORDER":
        customer_name = str(payload.get("customer_name") or "").strip() or "Cliente"
        item_count = len(payload.get("items") or [])
        return f"Pedido para {customer_name} · {item_count} item(s)"
    if action_type == "ADJUST_STOCK":
        product_id = payload.get("product_id")
        target_stock = payload.get("target_stock")
        return f"Stock producto #{product_id} -> {target_stock}"
    if action_type == "ADD_CASH_MOVEMENT":
        movement_type = str(payload.get("movement_type") or "").strip() or "movimiento"
        amount = payload.get("amount")
        return f"Caja {movement_type} · ${amount}"
    return action_type or "Acción remota"


def queue_action_for_retry(action: RemoteAction, error_message: str) -> None:
    retry_count = get_remote_action_retry_count(action) + 1
    set_remote_action_retry_meta(action, retry_count, queued=True)
    if retry_count > MAX_REMOTE_ACTION_RETRIES:
        action.status = RemoteActionStatus.FAILED
        action.error_message = f"Reintentos agotados: {error_message}"
        return
    action.status = RemoteActionStatus.PENDING
    action.error_message = error_message


def remote_actor_payload(payload: dict[str, Any], current_user: User) -> dict[str, Any]:
    actor_email = str(getattr(current_user, "email", "") or "").strip()
    actor_role = str(getattr(current_user, "role", "") or "").strip()
    enriched_payload = dict(payload)
    if actor_email:
        enriched_payload.setdefault("_panel_actor_username", actor_email)
        enriched_payload.setdefault("_panel_actor_email", actor_email)
    if actor_role:
        enriched_payload.setdefault("_panel_actor_role", actor_role)
    return enriched_payload


def remote_actor_headers(current_user: User) -> dict[str, str]:
    actor_email = str(getattr(current_user, "email", "") or "").strip()
    actor_role = str(getattr(current_user, "role", "") or "").strip()
    headers = {
        "Content-Type": "application/json",
        "X-Terminal-Profile": "panel",
    }
    if actor_email:
        headers["X-Actor-Username"] = actor_email
    if actor_role:
        headers["X-Actor-Role"] = actor_role
    return headers


def preflight_duplicate_order(installation: YummyInstallation, payload: CreateOrderPayload) -> None:
    if payload.allow_duplicate:
        return
    phone = str(payload.customer_phone or "").strip()
    address = str(payload.customer_address or "").strip()
    if not phone and not address:
        return
    try:
        response = requests.get(
            f"{installation.base_url.rstrip('/')}/api/integration/orders/duplicate",
            params={"customer_phone": phone, "customer_address": address},
            headers={"X-Integration-Key": installation.api_key},
            timeout=5,
        )
        response.raise_for_status()
        response_payload = response.json()
        result = response_payload.get("data", response_payload) if isinstance(response_payload, dict) else {}
        if isinstance(result, dict) and result.get("duplicate"):
            matched_by = str(result.get("matched_by") or "cliente").strip()
            label = "teléfono" if matched_by == "telefono" else "domicilio"
            raise HTTPException(
                status_code=409,
                detail={
                    "message": f"Ya existe un pedido activo con el mismo {label}. ¿Querés crear este pedido igual?",
                    "existing_order": result.get("order"),
                    "matched_by": matched_by,
                },
            )
    except HTTPException:
        raise
    except (requests.RequestException, ValueError):
        return


@router.post("/installations/{installation_id}/create-order")
def enqueue_create_order(
    installation_id: UUID,
    payload: CreateOrderPayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    installation = get_installation_for_user(db, installation_id, current_user)
    preflight_duplicate_order(installation, payload)
    action_payload = remote_actor_payload(payload.model_dump(), current_user)
    action_id = uuid4()
    action_payload["_operation_id"] = str(action_id)
    action = RemoteAction(
        id=action_id,
        installation_id=installation.id,
        created_by_user_id=current_user.id,
        action_type="CREATE_ORDER",
        status=RemoteActionStatus.PENDING,
        payload=action_payload,
    )
    db.add(action)
    db.commit()

    try:
        response = requests.post(
            f"{installation.base_url.rstrip('/')}/api/pedidos",
            json=action_payload,
            headers=remote_actor_headers(current_user),
            timeout=15,
        )
        response_data = response.json()
        if response.status_code >= 500:
            raise requests.RequestException(f"Error temporal de Yummy (HTTP {response.status_code})")
        if response.status_code >= 400:
            detail = (response_data.get("error") or response_data.get("message")) if isinstance(response_data, dict) else response.text
            if response.status_code == 409:
                raise HTTPException(status_code=409, detail=detail)
            raise HTTPException(status_code=502, detail=detail)

        if not isinstance(response_data, dict) or response_data.get("ok") is not True:
            raise requests.RequestException("Yummy no confirmó el pedido")
        db.refresh(action, with_for_update=True)
        action.status = RemoteActionStatus.COMPLETED
        action.result_payload = response_data
        action.error_message = None
        db.add(action)
        db.commit()
        db.refresh(action)
        return {
            "id": str(action.id),
            "status": action.status.value,
            "installation_id": str(installation.id),
            "result": response_data,
        }
    except HTTPException as exc:
        db.refresh(action, with_for_update=True)
        if action.status == RemoteActionStatus.COMPLETED:
            db.commit()
            saved = action.result_payload or {}
            return {"id": str(action.id), "status": "COMPLETED", "installation_id": str(installation.id), "result": saved.get("body", saved)}
        action.status = RemoteActionStatus.FAILED
        action.error_message = str(exc.detail)
        db.add(action)
        db.commit()
        raise exc
    except requests.RequestException as exc:
        db.refresh(action, with_for_update=True)
        if action.status == RemoteActionStatus.COMPLETED:
            db.commit()
            saved = action.result_payload or {}
            return {"id": str(action.id), "status": "COMPLETED", "installation_id": str(installation.id), "result": saved.get("body", saved)}
        queue_action_for_retry(action, f"Connector unreachable: {exc}")
        installation.connection_status = "OFFLINE"
        db.add(installation)
        db.add(action)
        db.commit()
        return JSONResponse(
            status_code=202,
            content={
                "id": str(action.id),
                "status": "QUEUED",
                "installation_id": str(installation.id),
                "queued": True,
                "message": "Pedido en cola. Se reintentará cuando el local vuelva a estar online.",
                "retry_count": get_remote_action_retry_count(action),
            },
        )


@router.get("/installations/{installation_id}")
def list_remote_actions(
    installation_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    installation = get_installation_for_user(db, installation_id, current_user)
    rows = db.query(RemoteAction, User.email).outerjoin(
        User,
        User.id == RemoteAction.created_by_user_id,
    ).filter(
        RemoteAction.installation_id == installation.id,
    ).order_by(RemoteAction.created_at.desc()).limit(50).all()
    return [
        {
            "id": str(action.id),
            "action_type": action.action_type,
            "status": action.status.value,
            "error_message": action.error_message,
            "created_at": action.created_at,
            "updated_at": action.updated_at,
            "created_by": email,
            "retry_count": get_remote_action_retry_count(action),
            "queued": bool((action.result_payload or {}).get("_queued")),
            "is_retryable": str(action.action_type or "").strip().upper() in RETRYABLE_REMOTE_ACTION_TYPES,
            "summary": action_payload_summary(action),
        }
        for action, email in rows
    ]
