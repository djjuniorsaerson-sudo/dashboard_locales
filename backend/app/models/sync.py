import uuid
from sqlalchemy import Column, String, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from datetime import datetime
from app.db.base_class import Base

class SyncEvent(Base):
    __tablename__ = "sync_events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False, index=True)
    
    # PRODUCT, CUSTOMER, ORDER, EMPLOYEE, DRIVER
    entity_type = Column(String, index=True, nullable=False) 
    
    # The actual UUID of the entity being synced
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    
    # CREATE, UPDATE, DELETE
    action = Column(String, nullable=False) 
    
    # The full JSON representation of the entity after the action (or null if DELETE)
    payload = Column(JSONB, nullable=True) 
    
    # Server timestamp. "Last Write Wins" resolution uses this.
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Whether this event originated from the Central panel (False) or was pushed by the local agent (True)
    # This helps avoid sending back the same events to the agent that pushed them.
    from_local_agent = Column(String, default="FALSE")
