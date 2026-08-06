from datetime import datetime
import secrets
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_password_hash, verify_password
from app.db.session import SessionLocal
from app.models.catalog import SyncedCategory, SyncedProduct
from app.models.connection_request import ConnectionRequest, ConnectionStatus
from app.models.yummy import YummyInstallation

router = APIRouter()


class SyncConnectPayload(BaseModel):
    local_id: str
    local_name: str
    base_url: str
    version: str = "1.0.0"
    system_type: str = "yummy"
    connector_slug: str = "connector-yummy"
    device_name: Optional[str] = None


class SyncHeartbeatPayload(BaseModel):
    version: str = "1.0.0"
    local_id: str
    db_status: Optional[str] = "ok"
    timestamp: Optional[str] = None


class SyncRecordPayload(BaseModel):
    local_record_id: int | str
    data: dict[str, Any]
    row_hash: Optional[str] = None


class SyncBatchPayload(BaseModel):
    batch_id: str
    module_name: str
    initial_cursor: Optional[str] = None
    final_cursor: Optional[str] = None
    session_id: Optional[str] = None
    is_reconciliation: Optional[bool] = False
    action: Optional[str] = None
    records: list[SyncRecordPayload] = []


class SyncRevokePayload(BaseModel):
    local_id: str


def get_db() -> Session:
    return SessionLocal()


def get_installation_by_sync_api_key(db: Session, api_key: str) -> YummyInstallation:
    installation = db.query(YummyInstallation).filter(YummyInstallation.api_key == api_key).first()
    if not installation:
        raise HTTPException(status_code=404, detail="Installation not found")
    return installation


@router.get("/health")
def sync_health() -> Any:
    return {"status": "ok", "service": "sync"}


@router.post("/connect")
def sync_connect(payload: SyncConnectPayload) -> Any:
    db = get_db()
    try:
        existing_install = db.query(YummyInstallation).filter(
            YummyInstallation.local_id == payload.local_id,
            YummyInstallation.connection_status != "REVOKED",
        ).first()
        if existing_install:
            raise HTTPException(status_code=409, detail="This local is already linked")

        existing_requests = db.query(ConnectionRequest).filter(
            ConnectionRequest.local_id == payload.local_id,
            ConnectionRequest.status == ConnectionStatus.PENDING,
        ).all()
        for current in existing_requests:
            current.status = ConnectionStatus.EXPIRED

        poll_token = secrets.token_urlsafe(32)
        new_request = ConnectionRequest(
            local_id=payload.local_id,
            local_name=payload.local_name,
            system_type=payload.system_type,
            connector_slug=payload.connector_slug,
            device_name=payload.device_name or payload.local_name,
            base_url=payload.base_url,
            api_key="__AUTO_CONNECT_PENDING__",
            version=payload.version,
            status=ConnectionStatus.PENDING,
            poll_token_hash=get_password_hash(poll_token),
        )
        db.add(new_request)
        db.commit()
        db.refresh(new_request)
        return {
            "request_id": str(new_request.id),
            "poll_token": poll_token,
            "status": new_request.status.value,
        }
    finally:
        db.close()


@router.get("/connect/{request_id}/status")
def sync_connect_status(
    request_id: UUID,
    x_poll_token: str = Header(..., alias="X-Poll-Token"),
) -> Any:
    db = get_db()
    try:
        request = db.query(ConnectionRequest).filter(ConnectionRequest.id == request_id).first()
        if not request:
            raise HTTPException(status_code=404, detail="Request not found")
        if not verify_password(x_poll_token, request.poll_token_hash):
            raise HTTPException(status_code=403, detail="Invalid poll token")

        payload = {
            "status": request.status.value,
            "request_id": str(request.id),
        }
        if request.status == ConnectionStatus.ACCEPTED:
            payload["api_key"] = request.approved_connector_token
            payload["installation_id"] = request.approved_installation_id
        return payload
    finally:
        db.close()


@router.post("/connect/{request_id}/ack")
def sync_connect_ack(
    request_id: UUID,
    x_poll_token: str = Header(..., alias="X-Poll-Token"),
) -> Any:
    db = get_db()
    try:
        request = db.query(ConnectionRequest).filter(ConnectionRequest.id == request_id).first()
        if not request:
            raise HTTPException(status_code=404, detail="Request not found")
        if not verify_password(x_poll_token, request.poll_token_hash):
            raise HTTPException(status_code=403, detail="Invalid poll token")
        if request.status != ConnectionStatus.ACCEPTED or not request.approved_installation_id:
            return {"status": request.status.value}

        installation = db.query(YummyInstallation).filter(
            YummyInstallation.id == request.approved_installation_id
        ).first()
        if installation:
            installation.connection_status = "LINKED"
            installation.paired_at = installation.paired_at or datetime.utcnow()
            db.add(installation)
            db.commit()
        return {"status": "ACKNOWLEDGED"}
    finally:
        db.close()


@router.post("/connect/{request_id}/cancel")
def sync_connect_cancel(
    request_id: UUID,
    x_poll_token: str = Header(..., alias="X-Poll-Token"),
) -> Any:
    db = get_db()
    try:
        request = db.query(ConnectionRequest).filter(ConnectionRequest.id == request_id).first()
        if not request:
            raise HTTPException(status_code=404, detail="Request not found")
        if not verify_password(x_poll_token, request.poll_token_hash):
            raise HTTPException(status_code=403, detail="Invalid poll token")
        if request.status == ConnectionStatus.PENDING:
            request.status = ConnectionStatus.EXPIRED
            request.resolved_at = datetime.utcnow()
            db.add(request)
            db.commit()
        return {"status": "CANCELLED"}
    finally:
        db.close()


@router.post("/revoke")
def sync_revoke(
    payload: SyncRevokePayload,
    x_api_key: str = Header(..., alias="X-API-Key"),
) -> Any:
    db = get_db()
    try:
        installation = db.query(YummyInstallation).filter(
            YummyInstallation.local_id == payload.local_id,
            YummyInstallation.api_key == x_api_key,
        ).first()
        if not installation:
            raise HTTPException(status_code=404, detail="Installation not found")
        installation.connection_status = "REVOKED"
        db.add(installation)
        db.commit()
        return {"status": "REVOKED"}
    finally:
        db.close()


@router.post("/heartbeat")
def sync_heartbeat(
    payload: SyncHeartbeatPayload,
    x_api_key: str = Header(..., alias="X-API-Key"),
) -> Any:
    db = get_db()
    try:
        installation = get_installation_by_sync_api_key(db, x_api_key)
        if installation.local_id != payload.local_id:
            raise HTTPException(status_code=403, detail="Local mismatch")
        installation.connection_status = "ONLINE"
        installation.last_health_check = datetime.utcnow()
        installation.heartbeat_payload = payload.model_dump()
        db.add(installation)
        db.commit()
        return {"status": "ok", "server_time": datetime.utcnow().isoformat()}
    finally:
        db.close()


@router.post("/categories")
def sync_categories(
    payload: SyncBatchPayload,
    x_api_key: str = Header(..., alias="X-API-Key"),
) -> Any:
    db = get_db()
    try:
        installation = get_installation_by_sync_api_key(db, x_api_key)
        for record in payload.records:
            external_id = str(record.local_record_id)
            data = record.data or {}
            category = db.query(SyncedCategory).filter(
                SyncedCategory.installation_id == installation.id,
                SyncedCategory.external_id == external_id,
            ).first()
            if not category:
                category = SyncedCategory(
                    installation_id=installation.id,
                    external_id=external_id,
                )
            category.name = str(data.get("name", "")).strip() or f"Categoria {external_id}"
            category.is_active = True
            category.raw_payload = data
            db.add(category)

        installation.last_sync_at = datetime.utcnow()
        installation.connection_status = "ONLINE"
        db.add(installation)
        db.commit()
        return {"status": "ok", "batch_id": payload.batch_id, "records": len(payload.records)}
    finally:
        db.close()


@router.post("/products")
def sync_products(
    payload: SyncBatchPayload,
    x_api_key: str = Header(..., alias="X-API-Key"),
) -> Any:
    db = get_db()
    try:
        installation = get_installation_by_sync_api_key(db, x_api_key)
        for record in payload.records:
            external_id = str(record.local_record_id)
            data = record.data or {}
            product = db.query(SyncedProduct).filter(
                SyncedProduct.installation_id == installation.id,
                SyncedProduct.external_id == external_id,
            ).first()
            if not product:
                product = SyncedProduct(
                    installation_id=installation.id,
                    external_id=external_id,
                )
            product.category_external_id = str(data.get("category_id")) if data.get("category_id") is not None else None
            product.name = str(data.get("name", "")).strip() or f"Producto {external_id}"
            product.description = str(data.get("description", "") or "").strip() or None
            product.price = str(data.get("price", 0) or 0)
            product.stock = str(data.get("stock_quantity", 0) or 0)
            product.is_active = True
            product.raw_payload = data
            db.add(product)

        installation.last_sync_at = datetime.utcnow()
        installation.connection_status = "ONLINE"
        db.add(installation)
        db.commit()
        return {"status": "ok", "batch_id": payload.batch_id, "records": len(payload.records)}
    finally:
        db.close()


@router.post("/categories/reconcile")
@router.post("/products/reconcile")
def sync_reconcile(
    payload: SyncBatchPayload,
    x_api_key: str = Header(..., alias="X-API-Key"),
) -> Any:
    db = get_db()
    try:
        installation = get_installation_by_sync_api_key(db, x_api_key)
        installation.last_sync_at = datetime.utcnow()
        installation.connection_status = "ONLINE"
        db.add(installation)
        db.commit()
        return {"status": "ok", "action": payload.action or "reconcile"}
    finally:
        db.close()
