import uuid
from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.db.base_class import Base

class Driver(Base):
    __tablename__ = "drivers"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    name = Column(String, index=True, nullable=False)
    phone = Column(String, nullable=True)
    status = Column(String, default="AVAILABLE") # AVAILABLE, BUSY, OFFLINE
    vehicle_info = Column(String, nullable=True)
