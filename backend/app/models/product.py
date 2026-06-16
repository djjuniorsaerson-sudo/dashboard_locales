import uuid
from sqlalchemy import Column, String, Float, Boolean, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.db.base_class import Base

class Product(Base):
    __tablename__ = "products"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    price = Column(Float, nullable=False)
    stock = Column(Integer, default=0)
    category_id = Column(String, nullable=True) # Puede ser una FK a otra tabla 'categories'
    is_active = Column(Boolean, default=True)
    metadata_info = Column(JSONB, nullable=True) # Características multi-rubro (ej: talles, cocción)
