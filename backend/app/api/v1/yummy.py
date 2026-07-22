from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime

from app.api import deps
from app.models.yummy import YummyInstallation, YummySnapshot
from app.models.user import User
from app.services.yummy_client import YummyIntegrationClient
from pydantic import BaseModel

router = APIRouter()

class YummyInstallCreate(BaseModel):
    local_id: str
    local_name: str
    base_url: str
    api_key: str
    sync_mode: str = "manual"

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

@router.post("/", response_model=Any)
def register_installation(
    install_in: YummyInstallCreate,
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
        # Delete related snapshots first to avoid foreign key constraints
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
        status_data = client.get_status() # As requested by user
        
        install.connection_status = "ONLINE"
        install.last_health_check = datetime.utcnow()
        db.commit()
        return {"status": "success", "health": health_data, "yummy_status": status_data}
    except Exception as e:
        install.connection_status = "ERROR"
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))

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
        
        # Persist the snapshot in DB
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
        # Record failed snapshot attempt
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
