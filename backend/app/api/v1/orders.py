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
    # Enviar el pedido a la API local de Yummy
    YUMMY_BASE_URL = "http://127.0.0.1:8080"
    
    # Aseguramos el payment_breakdown para mixto
    if order.payment_method == "mixto" and not order.payment_breakdown:
        raise HTTPException(status_code=400, detail="Debe especificar payment_breakdown para pago mixto")

    payload = order.dict()
    
    try:
        response = requests.post(
            f"{YUMMY_BASE_URL}/api/pedidos",
            json=payload,
            timeout=20
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"No pude conectar con Yummy en {YUMMY_BASE_URL}: {exc}")

    if response.status_code >= 400:
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=detail)

    return response.json()
