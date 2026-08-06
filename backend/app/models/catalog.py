import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base_class import Base


class SyncedCategory(Base):
    __tablename__ = "synced_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    installation_id = Column(UUID(as_uuid=True), ForeignKey("yummy_installations.id"), nullable=False, index=True)
    external_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    raw_payload = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class SyncedProduct(Base):
    __tablename__ = "synced_products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    installation_id = Column(UUID(as_uuid=True), ForeignKey("yummy_installations.id"), nullable=False, index=True)
    external_id = Column(String, nullable=False, index=True)
    category_external_id = Column(String, nullable=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    price = Column(String, nullable=False, default="0")
    stock = Column(String, nullable=False, default="0")
    is_active = Column(Boolean, default=True, nullable=False)
    raw_payload = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
