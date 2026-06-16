from pydantic import BaseModel
from typing import Optional, Any, List
from uuid import UUID
from datetime import datetime

class SyncEventItem(BaseModel):
    entity_type: str
    entity_id: UUID
    action: str
    payload: Optional[dict[str, Any]] = None
    local_timestamp: datetime

class SyncPushRequest(BaseModel):
    events: List[SyncEventItem]

class SyncPushResponse(BaseModel):
    processed: int
    failed: int
    status: str

class SyncPullResponse(BaseModel):
    server_time: datetime
    events: List[SyncEventItem]
