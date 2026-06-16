from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.api import deps
from app.models.product import Product
from app.models.user import User
from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse

router = APIRouter()

@router.get("/{location_id}/products", response_model=List[ProductResponse])
def read_products(
    location_id: UUID,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve products for a specific location.
    """
    products = db.query(Product).filter(Product.location_id == location_id).offset(skip).limit(limit).all()
    return products

@router.post("/{location_id}/products", response_model=ProductResponse)
def create_product(
    *,
    location_id: UUID,
    db: Session = Depends(deps.get_db),
    product_in: ProductCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new product.
    """
    # Here you'd verify if current_user.organization_id owns location_id
    product = Product(
        location_id=location_id,
        name=product_in.name,
        description=product_in.description,
        price=product_in.price,
        stock=product_in.stock,
        category_id=product_in.category_id,
        is_active=product_in.is_active,
        metadata_info=product_in.metadata_info
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product
