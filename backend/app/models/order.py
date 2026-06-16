import uuid
from sqlalchemy import Column, String, Float, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from datetime import datetime
from app.db.base_class import Base

class Order(Base):
    __tablename__ = "orders"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=False)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=True)
    
    # Status flow: PENDING -> PREPARING -> READY -> DELIVERING -> COMPLETED
    status = Column(String, default="PENDING", index=True)
    total_amount = Column(Float, nullable=False, default=0.0)
    payment_method = Column(String, nullable=True) # CASH, CARD, TRANSFER
    
    # JSONB for flexible item storage (list of product IDs, quantities, modifiers, etc)
    items = Column(JSONB, nullable=False)
    
    # Priority for the kitchen (e.g., HIGH, NORMAL)
    priority = Column(String, default="NORMAL")
    created_at = Column(DateTime, default=datetime.utcnow)
