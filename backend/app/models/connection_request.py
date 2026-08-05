import enum
import uuid
from sqlalchemy import Column, String, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
from app.db.base_class import Base

class ConnectionStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"

class ConnectionRequest(Base):
    __tablename__ = "connection_requests"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    local_id = Column(String, index=True, nullable=False)
    local_name = Column(String, nullable=False)
    api_key = Column(String, nullable=False)
    base_url = Column(String, nullable=False)
    version = Column(String, nullable=False, default="1.0.0")
    status = Column(Enum(ConnectionStatus), default=ConnectionStatus.PENDING, nullable=False)
    poll_token_hash = Column(String, nullable=False)
    
    requested_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    accepted_organization_id = Column(String, index=True, nullable=True)
