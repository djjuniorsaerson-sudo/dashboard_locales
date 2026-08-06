import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from datetime import datetime
from app.db.base_class import Base

class YummyInstallation(Base):
    __tablename__ = "yummy_installations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    
    local_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    system_type = Column(String, nullable=False, default="yummy")
    connector_slug = Column(String, nullable=False, default="connector-yummy")
    device_name = Column(String, nullable=True)
    base_url = Column(String, nullable=False)
    api_key = Column(String, nullable=False)
    connector_token_hash = Column(String, nullable=True)
    sync_mode = Column(String, default="manual") # manual | automatic
    integration_enabled = Column(Boolean, default=True)
    
    connection_status = Column(String, default="PENDING") # ONLINE, OFFLINE, ERROR, PENDING
    last_health_check = Column(DateTime, nullable=True)
    last_sync_at = Column(DateTime, nullable=True)
    last_seen_ip = Column(String, nullable=True)
    heartbeat_payload = Column(JSONB, nullable=True)
    paired_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class YummySnapshot(Base):
    __tablename__ = "yummy_snapshots"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    installation_id = Column(UUID(as_uuid=True), ForeignKey("yummy_installations.id"), nullable=False)
    
    snapshot_data = Column(JSONB, nullable=False)
    status = Column(String, default="SUCCESS")
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
