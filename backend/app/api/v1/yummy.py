from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime, timezone, timedelta
import secrets
import string
import requests
import time

from app.api import deps
from app.models.yummy import YummyInstallation, YummySnapshot
from app.models.connection_request import ConnectionRequest, ConnectionStatus
from app.models.user import User
from app.services.yummy_client import YummyIntegrationClient
from pydantic import BaseModel
import bcrypt

router = APIRouter()

class YummyManualCreate(BaseModel):
    local_id: str
    local_name: str
    base_url: str
    api_key: str
    sync_mode: str = "manual"

class ConnectionRequestCreate(BaseModel):
    local_id: str
    local_name: str
    base_url: str
    api_key: str
    version: str = "1.0.0"

class CommandPayload(BaseModel):
    command: str
    data: dict

def get_install_secure(db: Session, id: UUID, org_id: UUID) -> YummyInstallation:
    install = db.query(YummyInstallation).filter(
        YummyInstallation.id == id,
        YummyInstallation.organization_id == org_id
    ).first()
    if not install:
        raise HTTPException(status_code=404, detail="Installation not found or access denied")
    return install

@router.post("/connection-requests/", response_model=Any)
def create_connection_request(
    req_in: ConnectionRequestCreate,
    db: Session = Depends(deps.get_db),
) -> Any:
    # 1. Check if local_id is already linked to an organization
    existing_install = db.query(YummyInstallation).filter(YummyInstallation.local_id == req_in.local_id).first()
    if existing_install:
        raise HTTPException(status_code=409, detail="Esta terminal ya está vinculada a una organización.")
        
    # 2. Check if there is an existing PENDING request and invalidate it
    existing_requests = db.query(ConnectionRequest).filter(
        ConnectionRequest.local_id == req_in.local_id,
        ConnectionRequest.status == ConnectionStatus.PENDING
    ).all()
    for req in existing_requests:
        req.status = ConnectionStatus.EXPIRED
        
    # 3. Create poll_token
    poll_token = secrets.token_urlsafe(32)
    poll_token_hash = bcrypt.hashpw(poll_token.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    # 4. Save new request
    new_req = ConnectionRequest(
        local_id=req_in.local_id,
        local_name=req_in.local_name,
        base_url=req_in.base_url,
        api_key=req_in.api_key,
        version=req_in.version,
        status=ConnectionStatus.PENDING,
        poll_token_hash=poll_token_hash
    )
    db.add(new_req)
    db.commit()
    db.refresh(new_req)
    
    return {
        "request_id": str(new_req.id),
        "poll_token": poll_token,
        "status": new_req.status.value
    }

@router.get("/connection-requests/{request_id}/status", response_model=Any)
def check_connection_request_status(
    request_id: UUID,
    db: Session = Depends(deps.get_db),
    poll_token: str = Depends(deps.get_api_key_header) # Reusing API key header logic or we can use custom
) -> Any:
    from fastapi import Header
    pass # Replaced by the next chunk logic since depends is tricky here.

@router.get("/connection-requests/{request_id}/status", response_model=Any)
def check_connection_request_status(
    request_id: UUID,
    x_poll_token: str = Depends(deps.APIKeyHeader(name="X-Poll-Token", auto_error=True)),
    db: Session = Depends(deps.get_db)
) -> Any:
    from fastapi.security.api_key import APIKeyHeader
    req = db.query(ConnectionRequest).filter(ConnectionRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
        
    if not bcrypt.checkpw(x_poll_token.encode('utf-8'), req.poll_token_hash.encode('utf-8')):
        raise HTTPException(status_code=403, detail="Invalid poll token")
        
    # Handle expiration logic on read
    if req.status == ConnectionStatus.PENDING and (datetime.now(timezone.utc) - req.requested_at).total_seconds() > 900:
        req.status = ConnectionStatus.EXPIRED
        db.commit()
        
    return {
        "status": req.status.value,
        "resolved_at": req.resolved_at,
        "accepted_organization_id": req.accepted_organization_id
    }

@router.get("/connection-requests/", response_model=Any)
def list_pending_requests(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    # Only pending, non-expired requests
    threshold = datetime.now(timezone.utc) - timedelta(minutes=15)
    requests = db.query(ConnectionRequest).filter(
        ConnectionRequest.status == ConnectionStatus.PENDING,
        ConnectionRequest.requested_at > threshold
    ).all()
    
    return [{
        "id": r.id,
        "local_name": r.local_name,
        "local_id": r.local_id,
        "base_url": r.base_url,
        "version": r.version,
        "requested_at": r.requested_at,
        "status": r.status.value
    } for r in requests]

@router.post("/connection-requests/{request_id}/accept", response_model=Any)
def accept_connection_request(
    request_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="User does not belong to an organization")
        
    req = db.query(ConnectionRequest).filter(ConnectionRequest.id == request_id).first()
    if not req or req.status != ConnectionStatus.PENDING:
        raise HTTPException(status_code=404, detail="Pending request not found")
        
    # Double check local_id isn't taken
    if db.query(YummyInstallation).filter(YummyInstallation.local_id == req.local_id).first():
        raise HTTPException(status_code=409, detail="This local_id is already connected to another organization")
        
    req.status = ConnectionStatus.ACCEPTED
    req.resolved_at = datetime.now(timezone.utc)
    req.accepted_organization_id = org_id
    
    install = YummyInstallation(
        organization_id=org_id,
        local_id=req.local_id,
        name=req.local_name,
        base_url=req.base_url,
        api_key=req.api_key,
        sync_mode="manual",
        connection_status="ONLINE"
    )
    db.add(install)
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Transaction failed")
        
    return {"status": "accepted"}

@router.post("/connection-requests/{request_id}/reject", response_model=Any)
def reject_connection_request(
    request_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    req = db.query(ConnectionRequest).filter(ConnectionRequest.id == request_id).first()
    if not req or req.status != ConnectionStatus.PENDING:
        raise HTTPException(status_code=404, detail="Pending request not found")
        
    req.status = ConnectionStatus.REJECTED
    req.resolved_at = datetime.now(timezone.utc)
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
        
    install = YummyInstallation(
        organization_id=org_id,
        local_id=install_in.local_id,
        name=install_in.local_name,
        base_url=install_in.base_url,
        api_key=install_in.api_key,
        sync_mode=install_in.sync_mode,
        connection_status="PENDING"
    )
    db.add(install)
    db.commit()
    db.refresh(install)
    return {
        "id": install.id, 
        "local_id": install.local_id,
        "local_name": install.name, 
        "base_url": install.base_url,
        "sync_mode": install.sync_mode,
        "connection_status": install.connection_status,
        "last_health_check": install.last_health_check,
        "last_sync_at": install.last_sync_at
    }

@router.get("/", response_model=List[Any])
def list_installations(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    org_id = current_user.organization_id
    if not org_id:
        return []
    installs = db.query(YummyInstallation).filter(YummyInstallation.organization_id == org_id).all()
    return [{
        "id": i.id, 
        "local_id": i.local_id,
        "local_name": i.name, 
        "base_url": i.base_url, 
        "sync_mode": i.sync_mode,
        "connection_status": i.connection_status,
        "last_health_check": i.last_health_check,
        "last_sync_at": i.last_sync_at
    } for i in installs]

@router.delete("/{id}")
def delete_installation(
    id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    try:
        install = get_install_secure(db, id, current_user.organization_id)
        db.query(YummySnapshot).filter(YummySnapshot.installation_id == id).delete()
        
        db.delete(install)
        db.commit()
        return {"status": "success", "message": "Installation deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{id}/test-connection")
def test_connection(
    id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    install = get_install_secure(db, id, current_user.organization_id)
    client = YummyIntegrationClient(install.base_url, install.api_key)
    try:
        health_data = client.check_health()
        status_data = client.get_status()
        
        install.connection_status = "ONLINE"
        install.last_health_check = datetime.utcnow()
        db.commit()
        return {"status": "success", "health": health_data, "yummy_status": status_data}
    except Exception as e:
        install.connection_status = "ERROR"
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{id}/diagnostics")
def run_diagnostics(
    id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    install = get_install_secure(db, id, current_user.organization_id)
    url = f"{install.base_url.rstrip('/')}/health"
    start = time.time()
    try:
        resp = requests.get(url, timeout=7)
        elapsed_ms = int((time.time() - start) * 1000)
        return {
            "reachable": True,
            "url": url,
            "status_code": resp.status_code,
            "response_time_ms": elapsed_ms,
            "response_json": resp.json() if "application/json" in resp.headers.get("Content-Type", "") else resp.text
        }
    except requests.exceptions.Timeout:
        return {"reachable": False, "error_type": "timeout", "message": "El conector no respondió dentro del tiempo permitido (7s)", "url": url}
    except requests.exceptions.RequestException as e:
        return {"reachable": False, "error_type": "connection_error", "message": str(e), "url": url}

@router.post("/{id}/sync-snapshot")
def sync_snapshot(
    id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    install = get_install_secure(db, id, current_user.organization_id)
    client = YummyIntegrationClient(install.base_url, install.api_key)
    try:
        snapshot_data = client.get_export()
        
        snapshot = YummySnapshot(
            installation_id=install.id,
            snapshot_data=snapshot_data,
            status="SUCCESS"
        )
        db.add(snapshot)
        
        install.last_sync_at = datetime.utcnow()
        install.connection_status = "ONLINE"
        db.commit()
        return {"status": "success", "snapshot_id": snapshot.id}
    except Exception as e:
        snapshot = YummySnapshot(
            installation_id=install.id,
            snapshot_data={},
            status="ERROR",
            error_message=str(e)
        )
        db.add(snapshot)
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{id}/events")
def get_events(
    id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    install = get_install_secure(db, id, current_user.organization_id)
    client = YummyIntegrationClient(install.base_url, install.api_key)
    try:
        events = client.get_events()
        return {"events": events}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{id}/commands")
def send_command(
    id: UUID,
    payload: CommandPayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    install = get_install_secure(db, id, current_user.organization_id)
    client = YummyIntegrationClient(install.base_url, install.api_key)
    try:
        result = client.send_command(payload.dict())
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{id}/audit")
def get_audit(
    id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    install = get_install_secure(db, id, current_user.organization_id)
    client = YummyIntegrationClient(install.base_url, install.api_key)
    try:
        audit_logs = client.get_audit()
        return {"audit": audit_logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))