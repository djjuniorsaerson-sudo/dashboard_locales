from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import requests
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from app.api import deps

router = APIRouter()

class OrderItem(BaseModel):
    product_id: int
    product_name: str
    quantity: int
    price: float
    base_quantity: Optional[int] = 1
    bundle_quantity: Optional[int] = 1
    stock_factor: Optional[float] = 1.0
    portion_type: Optional[str] = "completo"
    preparation_state: Optional[str] = ""
    notes: Optional[str] = ""
    toppings: Optional[List[Dict[str, Any]]] = []
    guarniciones: Optional[List[Dict[str, Any]]] = []
    extras: Optional[List[Dict[str, Any]]] = []

class OrderCreate(BaseModel):
    customer_name: str
    customer_phone: Optional[str] = ""
    customer_address: Optional[str] = ""
    customer_notes: Optional[str] = ""
    notes: Optional[str] = ""
    order_time: Optional[str] = ""
    order_type: str
    status: Optional[str] = "Pendiente"
    payment_method: str
    payment_detail: Optional[str] = ""
    payment_breakdown: Optional[Dict[str, float]] = None
    allow_duplicate: Optional[bool] = False
    items: List[OrderItem]

@router.post("/create")
def create_order(order: OrderCreate):
    from app.api.v1.data import get_integration_client
    
    client = get_integration_client()
    if not client:
        raise HTTPException(status_code=503, detail="Yummy Local no está conectado")
        
    # Aseguramos el payment_breakdown para mixto
    if order.payment_method == "mixto" and not order.payment_breakdown:
        raise HTTPException(status_code=400, detail="Debe especificar payment_breakdown para pago mixto")

    payload = order.dict()
    
    try:
        response = client.request("POST", "/api/pedidos", payload)
        return response
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No pude conectar con Yummy: {exc}")
