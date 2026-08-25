from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional
from uuid import UUID

import requests
import secrets
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, object_session

from app.api import deps
from app.core.security import get_password_hash
from app.models.catalog import SyncedCategory, SyncedProduct
from app.models.connection_request import ConnectionRequest, ConnectionStatus
from app.models.remote_action import RemoteAction, RemoteActionStatus
from app.models.user import User
from app.models.yummy import YummyInstallation, YummySnapshot
from app.services.yummy_client import YummyIntegrationClient

router = APIRouter()
poll_token_header = APIKeyHeader(name="X-Poll-Token", auto_error=True)

HEARTBEAT_TIMEOUT_SECONDS = 120


class YummyManualCreate(BaseModel):
    local_id: str
    local_name: str
    base_url: str
    api_key: str
    sync_mode: str = "manual"
    system_type: str = "yummy"
    connector_slug: str = "connector-yummy"
    device_name: Optional[str] = None


class ConnectionRequestCreate(BaseModel):
    local_id: str
    local_name: str
    base_url: str
    api_key: str = "__MANUAL__"
    version: str = "1.0.0"
    system_type: str = "yummy"
    connector_slug: str = "connector-yummy"
    device_name: Optional[str] = None


class HeartbeatPayload(BaseModel):
    version: str = "1.0.0"
    device_name: Optional[str] = None
    base_url: Optional[str] = None
    tailscale_ip: Optional[str] = None
    status: Optional[str] = "ONLINE"
    capabilities: List[str] = Field(default_factory=list)


class CatalogCategoryPayload(BaseModel):
    external_id: str
    name: str
    is_active: bool = True
    raw_payload: Optional[dict] = None


class CatalogProductPayload(BaseModel):
    external_id: str
    name: str
    description: Optional[str] = None
    price: float = 0
    stock: float = 0
    category_external_id: Optional[str] = None
    is_active: bool = True
    raw_payload: Optional[dict] = None


class CatalogSyncPayload(BaseModel):
    categories: List[CatalogCategoryPayload] = Field(default_factory=list)
    products: List[CatalogProductPayload] = Field(default_factory=list)


class RemoteActionResultPayload(BaseModel):
    result_payload: Optional[dict] = None
    error_message: Optional[str] = None


class CommandPayload(BaseModel):
    command: str
    data: dict


def compute_installation_status(install: YummyInstallation) -> str:
    if install.connection_status == "REVOKED":
        return "REVOKED"
    if not install.last_health_check:
        return install.connection_status or "PENDING"
    if (datetime.utcnow() - install.last_health_check).total_seconds() > HEARTBEAT_TIMEOUT_SECONDS:
        return "OFFLINE"
    return "ONLINE"


def serialize_installation(install: YummyInstallation) -> dict[str, Any]:
    return {
        "id": str(install.id),
        "local_id": install.local_id,
        "local_name": install.name,
        "system_type": install.system_type,
        "connector_slug": install.connector_slug,
        "device_name": install.device_name,
        "connection_status": compute_installation_status(install),
        "last_health_check": install.last_health_check,
        "last_sync_at": install.last_sync_at,
        "last_seen_ip": install.last_seen_ip,
        "created_at": install.created_at,
    }


def get_install_secure(db: Session, installation_id: UUID, org_id: UUID) -> YummyInstallation:
    install = db.query(YummyInstallation).filter(
        YummyInstallation.id == installation_id,
        YummyInstallation.organization_id == org_id,
    ).first()
    if not install:
        raise HTTPException(status_code=404, detail="Installation not found or access denied")
    return install


@router.post("/connection-requests/", response_model=Any)
def create_connection_request(
    req_in: ConnectionRequestCreate,
    db: Session = Depends(deps.get_db),
) -> Any:
    existing_install = db.query(YummyInstallation).filter(YummyInstallation.local_id == req_in.local_id).first()
    if existing_install and existing_install.connection_status != "REVOKED":
        raise HTTPException(status_code=409, detail="Esta terminal ya está vinculada a una organización.")

    existing_requests = db.query(ConnectionRequest).filter(
        ConnectionRequest.local_id == req_in.local_id,
        ConnectionRequest.status == ConnectionStatus.PENDING,
    ).all()
    for request in existing_requests:
        request.status = ConnectionStatus.EXPIRED

    poll_token = secrets.token_urlsafe(32)
    new_req = ConnectionRequest(
        local_id=req_in.local_id,
        local_name=req_in.local_name,
        system_type=req_in.system_type,
        connector_slug=req_in.connector_slug,
        device_name=req_in.device_name or req_in.local_name,
        base_url=req_in.base_url,
        api_key=req_in.api_key,
        version=req_in.version,
        status=ConnectionStatus.PENDING,
        poll_token_hash=get_password_hash(poll_token),
    )
    db.add(new_req)
    db.commit()
    db.refresh(new_req)

    return {
        "request_id": str(new_req.id),
        "poll_token": poll_token,
        "status": new_req.status.value,
    }


@router.get("/connection-requests/{request_id}/status", response_model=Any)
def check_connection_request_status(
    request_id: UUID,
    x_poll_token: str = Depends(poll_token_header),
    db: Session = Depends(deps.get_db),
) -> Any:
    request = db.query(ConnectionRequest).filter(ConnectionRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    if not deps.verify_password(x_poll_token, request.poll_token_hash):
        raise HTTPException(status_code=403, detail="Invalid poll token")

    if request.status == ConnectionStatus.PENDING and (
        datetime.now(timezone.utc) - request.requested_at
    ).total_seconds() > 900:
        request.status = ConnectionStatus.EXPIRED
        db.commit()

    installation = None
    if request.approved_installation_id:
        installation = db.query(YummyInstallation).filter(
            YummyInstallation.id == request.approved_installation_id
        ).first()

    return {
        "status": request.status.value,
        "resolved_at": request.resolved_at,
        "installation_id": request.approved_installation_id,
        "connector_token": request.approved_connector_token,
        "api_key": installation.api_key if installation else None,
        "system_type": request.system_type,
        "connector_slug": request.connector_slug,
    }


@router.get("/connection-requests/", response_model=Any)
def list_pending_requests(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    threshold = datetime.now(timezone.utc) - timedelta(minutes=15)
    requests = db.query(ConnectionRequest).filter(
        ConnectionRequest.status == ConnectionStatus.PENDING,
        ConnectionRequest.requested_at > threshold,
    ).all()

    return [
        {
            "id": str(request.id),
            "local_name": request.local_name,
            "local_id": request.local_id,
            "system_type": request.system_type,
            "connector_slug": request.connector_slug,
            "device_name": request.device_name,
            "version": request.version,
            "requested_at": request.requested_at,
            "status": request.status.value,
        }
        for request in requests
    ]


@router.post("/connection-requests/{request_id}/accept", response_model=Any)
def accept_connection_request(
    request_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="User does not belong to an organization")

    request = db.query(ConnectionRequest).filter(ConnectionRequest.id == request_id).first()
    if not request or request.status != ConnectionStatus.PENDING:
        raise HTTPException(status_code=404, detail="Pending request not found")

    if db.query(YummyInstallation).filter(YummyInstallation.local_id == request.local_id).first():
        raise HTTPException(status_code=409, detail="This local_id is already connected to another organization")

    connector_token = secrets.token_urlsafe(32)
    integration_api_key = request.api_key if request.api_key and request.api_key != "__AUTO_CONNECT_PENDING__" else secrets.token_urlsafe(32)
    installation = YummyInstallation(
        organization_id=org_id,
        local_id=request.local_id,
        name=request.local_name,
        system_type=request.system_type,
        connector_slug=request.connector_slug,
        device_name=request.device_name or request.local_name,
        base_url=request.base_url,
        api_key=integration_api_key,
        connector_token_hash=get_password_hash(connector_token),
        sync_mode="automatic",
        connection_status="PENDING",
        paired_at=datetime.utcnow(),
    )
    db.add(installation)
    db.flush()

    request.status = ConnectionStatus.ACCEPTED
    request.resolved_at = datetime.now(timezone.utc)
    request.accepted_organization_id = str(org_id)
    request.approved_installation_id = str(installation.id)
    request.approved_connector_token = connector_token

    db.commit()
    return {"status": "accepted", "installation_id": str(installation.id)}


@router.post("/connection-requests/{request_id}/reject", response_model=Any)
def reject_connection_request(
    request_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    request = db.query(ConnectionRequest).filter(ConnectionRequest.id == request_id).first()
    if not request or request.status != ConnectionStatus.PENDING:
        raise HTTPException(status_code=404, detail="Pending request not found")

    request.status = ConnectionStatus.REJECTED
    request.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "rejected"}


@router.post("/", response_model=Any)
def register_installation(
    install_in: YummyManualCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="User does not belong to an organization")

    connector_token = secrets.token_urlsafe(32)
    install = YummyInstallation(
        organization_id=org_id,
        local_id=install_in.local_id,
        name=install_in.local_name,
        system_type=install_in.system_type,
        connector_slug=install_in.connector_slug,
        device_name=install_in.device_name or install_in.local_name,
        base_url=install_in.base_url,
        api_key=install_in.api_key,
        connector_token_hash=get_password_hash(connector_token),
        sync_mode=install_in.sync_mode,
        connection_status="PENDING",
        paired_at=datetime.utcnow(),
    )
    db.add(install)
    db.commit()
    db.refresh(install)
    return {**serialize_installation(install), "connector_token": connector_token}


@router.get("/", response_model=List[Any])
def list_installations(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    org_id = current_user.organization_id
    if not org_id:
        return []
    installs = db.query(YummyInstallation).filter(YummyInstallation.organization_id == org_id).all()
    return [serialize_installation(install) for install in installs]


@router.delete("/{installation_id}")
def delete_installation(
    installation_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    install = get_install_secure(db, installation_id, current_user.organization_id)
    db.query(SyncedCategory).filter(SyncedCategory.installation_id == installation_id).delete()
    db.query(SyncedProduct).filter(SyncedProduct.installation_id == installation_id).delete()
    db.query(RemoteAction).filter(RemoteAction.installation_id == installation_id).delete()
    db.query(YummySnapshot).filter(YummySnapshot.installation_id == installation_id).delete()
    db.delete(install)
    db.commit()
    return {"status": "success", "message": "Installation deleted"}


@router.post("/{installation_id}/test-connection")
def test_connection(
    installation_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    install = get_install_secure(db, installation_id, current_user.organization_id)
    client = YummyIntegrationClient(install.base_url, install.api_key)
    try:
        health_data = client.check_health()
        status_data = client.get_status()
        install.connection_status = "ONLINE"
        install.last_health_check = datetime.utcnow()
        db.commit()
        return {"status": "success", "health": health_data, "connector_status": status_data}
    except Exception as exc:
        install.connection_status = "ERROR"
        db.commit()
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{installation_id}/diagnostics")
def run_diagnostics(
    installation_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    install = get_install_secure(db, installation_id, current_user.organization_id)
    url = f"{install.base_url.rstrip('/')}/health"
    start = datetime.utcnow()
    try:
        response = requests.get(url, timeout=7)
        elapsed_ms = int((datetime.utcnow() - start).total_seconds() * 1000)
        return {
            "reachable": True,
            "url": url,
            "status_code": response.status_code,
            "response_time_ms": elapsed_ms,
            "response_json": response.json() if "application/json" in response.headers.get("Content-Type", "") else response.text,
        }
    except requests.exceptions.Timeout:
        return {"reachable": False, "error_type": "timeout", "message": "El conector no respondió dentro del tiempo permitido (7s)", "url": url}
    except requests.exceptions.RequestException as exc:
        return {"reachable": False, "error_type": "connection_error", "message": str(exc), "url": url}


@router.get("/{installation_id}/catalog")
def get_synced_catalog(
    installation_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    install = get_install_secure(db, installation_id, current_user.organization_id)
    categories = db.query(SyncedCategory).filter(SyncedCategory.installation_id == install.id).order_by(SyncedCategory.name.asc()).all()
    products = db.query(SyncedProduct).filter(SyncedProduct.installation_id == install.id).order_by(SyncedProduct.name.asc()).all()
    return {
        "installation": serialize_installation(install),
        "categories": [
            {
                "id": str(category.id),
                "external_id": category.external_id,
                "name": category.name,
                "is_active": category.is_active,
            }
            for category in categories
        ],
        "products": [
            {
                "id": str(product.id),
                "external_id": product.external_id,
                "category_external_id": product.category_external_id,
                "name": product.name,
                "description": product.description,
                "price": float(product.price or 0),
                "stock": float(product.stock or 0),
                "active": product.is_active,
                "toppings": (product.raw_payload or {}).get("toppings", []) or [],
                "guarniciones": (product.raw_payload or {}).get("guarniciones", []) or [],
                "extras": (product.raw_payload or {}).get("extras", []) or [],
            }
            for product in products
        ],
    }


@router.post("/connector/installations/{installation_id}/heartbeat")
def connector_heartbeat(
    installation: YummyInstallation = Depends(deps.get_connector_installation),
    payload: HeartbeatPayload = None,
) -> Any:
    db = object_session(installation)
    heartbeat = payload or HeartbeatPayload()
    installation.last_health_check = datetime.utcnow()
    installation.connection_status = "ONLINE"
    installation.device_name = heartbeat.device_name or installation.device_name
    installation.base_url = heartbeat.base_url or installation.base_url
    installation.last_seen_ip = heartbeat.tailscale_ip or installation.last_seen_ip
    installation.heartbeat_payload = heartbeat.model_dump()
    db.add(installation)
    db.commit()
    return {"status": "ok", "server_time": datetime.utcnow()}


@router.post("/connector/installations/{installation_id}/catalog-sync")
def connector_catalog_sync(
    payload: CatalogSyncPayload,
    installation: YummyInstallation = Depends(deps.get_connector_installation),
) -> Any:
    db = object_session(installation)
    db.query(SyncedCategory).filter(SyncedCategory.installation_id == installation.id).delete()
    db.query(SyncedProduct).filter(SyncedProduct.installation_id == installation.id).delete()

    for category in payload.categories:
        db.add(
            SyncedCategory(
                installation_id=installation.id,
                external_id=category.external_id,
                name=category.name,
                is_active=category.is_active,
                raw_payload=category.raw_payload,
            )
        )

    for product in payload.products:
        db.add(
            SyncedProduct(
                installation_id=installation.id,
                external_id=product.external_id,
                category_external_id=product.category_external_id,
                name=product.name,
                description=product.description,
                price=str(product.price),
                stock=str(product.stock),
                is_active=product.is_active,
                raw_payload=product.raw_payload,
            )
        )

    installation.last_sync_at = datetime.utcnow()
    installation.connection_status = "ONLINE"
    db.add(installation)
    db.commit()
    return {
        "status": "success",
        "categories": len(payload.categories),
        "products": len(payload.products),
        "synced_at": installation.last_sync_at,
    }


@router.get("/connector/installations/{installation_id}/remote-actions")
def connector_pending_remote_actions(
    installation: YummyInstallation = Depends(deps.get_connector_installation),
) -> Any:
    db = object_session(installation)
    actions = db.query(RemoteAction).filter(
        RemoteAction.installation_id == installation.id,
        RemoteAction.status.in_([RemoteActionStatus.PENDING, RemoteActionStatus.PROCESSING]),
    ).order_by(RemoteAction.created_at.asc()).all()

    for action in actions:
        if action.status == RemoteActionStatus.PENDING:
            action.status = RemoteActionStatus.PROCESSING
            db.add(action)
    db.commit()

    return {
        "actions": [
            {
                "id": str(action.id),
                "action_type": action.action_type,
                "payload": action.payload,
                "created_at": action.created_at,
            }
            for action in actions
        ]
    }


@router.post("/connector/installations/{installation_id}/remote-actions/{action_id}/complete")
def connector_complete_remote_action(
    action_id: UUID,
    payload: RemoteActionResultPayload,
    installation: YummyInstallation = Depends(deps.get_connector_installation),
) -> Any:
    db = object_session(installation)
    action = db.query(RemoteAction).filter(
        RemoteAction.id == action_id,
        RemoteAction.installation_id == installation.id,
    ).first()
    if not action:
        raise HTTPException(status_code=404, detail="Remote action not found")

    action.status = RemoteActionStatus.COMPLETED
    action.result_payload = payload.result_payload
    action.error_message = None
    db.add(action)
    db.commit()
    return {"status": "completed"}


@router.post("/connector/installations/{installation_id}/remote-actions/{action_id}/failed")
def connector_fail_remote_action(
    action_id: UUID,
    payload: RemoteActionResultPayload,
    installation: YummyInstallation = Depends(deps.get_connector_installation),
) -> Any:
    db = object_session(installation)
    action = db.query(RemoteAction).filter(
        RemoteAction.id == action_id,
        RemoteAction.installation_id == installation.id,
    ).first()
    if not action:
        raise HTTPException(status_code=404, detail="Remote action not found")

    action.status = RemoteActionStatus.FAILED
    action.result_payload = payload.result_payload
    action.error_message = payload.error_message or "Connector execution failed"
    db.add(action)
    db.commit()
    return {"status": "failed"}
