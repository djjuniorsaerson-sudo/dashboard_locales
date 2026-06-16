from pydantic import BaseModel
from typing import Optional, Any
from uuid import UUID

class ProductBase(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    stock: Optional[int] = 0
    category_id: Optional[str] = None
    is_active: Optional[bool] = True
    metadata_info: Optional[dict[str, Any]] = None

class ProductCreate(ProductBase):
    pass

class ProductUpdate(ProductBase):
    name: Optional[str] = None
    price: Optional[float] = None

class ProductResponse(ProductBase):
    id: UUID
    location_id: UUID

    class Config:
        from_attributes = True
