from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime

from app.api import deps
from app.models.sync import SyncEvent
from app.models.user import User
from app.schemas.sync import SyncPushRequest, SyncPushResponse, SyncPullResponse

router = APIRouter()

@router.post("/{location_id}/sync/push", response_model=SyncPushResponse)
def push_changes(
    location_id: UUID,
    payload: SyncPushRequest,
    db: Session = Depends(deps.get_db),
    # In a real environment, you'd use a special Agent Token, but we reuse user for now
    current_user: User = Depends(deps.get_current_user), 
) -> Any:
    """
    Called by the Local Agent to push local mutations (CREATE, UPDATE, DELETE) to the Central Server.
    """
    processed = 0
    
    for event in payload.events:
        # 1. Log the sync event to audit/history
        new_event = SyncEvent(
            location_id=location_id,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            action=event.action,
            payload=event.payload,
            timestamp=datetime.utcnow(),
            from_local_agent="TRUE"
        )
        db.add(new_event)
        
        # 2. In a real implementation, here we would upsert into the actual table 
        # (e.g., if entity_type == 'PRODUCT', insert/update into 'products' table)
        # For now, we just record the sync event.
        
        processed += 1

    db.commit()
    return {"processed": processed, "failed": 0, "status": "SUCCESS"}


@router.get("/{location_id}/sync/pull", response_model=SyncPullResponse)
def pull_changes(
    location_id: UUID,
    last_sync: datetime,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Called by the Local Agent to pull any changes that occurred on the Central Server since `last_sync`.
    """
    # Fetch events that happened AFTER the last_sync timestamp, AND were not pushed by the local agent itself.
    events = db.query(SyncEvent).filter(
        SyncEvent.location_id == location_id,
        SyncEvent.timestamp > last_sync,
        SyncEvent.from_local_agent == "FALSE"
    ).order_by(SyncEvent.timestamp.asc()).all()
    
    # Map to schema
    response_events = []
    for e in events:
        response_events.append({
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "action": e.action,
            "payload": e.payload,
            "local_timestamp": e.timestamp
        })
        
    return {
        "server_time": datetime.utcnow(),
        "events": response_events
    }
