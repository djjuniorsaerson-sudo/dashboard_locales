import uuid
from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.db.base_class import Base

class Employee(Base):
    __tablename__ = "employees"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    name = Column(String, index=True, nullable=False)
    role = Column(String, nullable=True) # Cajero, Cocinero, Encargado
    pin_code = Column(String, nullable=True) # PIN para el punto de venta local
    salary_info = Column(JSONB, nullable=True) # Adelantos, vales, etc.
