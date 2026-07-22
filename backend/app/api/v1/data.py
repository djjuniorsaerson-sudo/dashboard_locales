from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api import deps
from app.services.extractor_modules import ModulesExtractor

router = APIRouter()

from pydantic import BaseModel
from typing import Optional

def get_integration_client():
    from app.db.session import SessionLocal
    from app.models.yummy import YummyInstallation
    from app.services.yummy_client import YummyIntegrationClient
    
    db = SessionLocal()
    try:
        install = db.query(YummyInstallation).filter(
            YummyInstallation.connection_status == "ONLINE"
        ).order_by(YummyInstallation.last_health_check.desc()).first()
        if install:
            return YummyIntegrationClient(install.base_url, install.api_key)
        return None
    finally:
        db.close()

class ProductData(BaseModel):
    name: str
    price: float
    stock: int

class StockData(BaseModel):
    stock: int

class NovedadData(BaseModel):
    event_type: str
    amount: float
    notes: str

class ClientData(BaseModel):
    name: str
    phone: str = ""
    address: str = ""
    notes: str = ""

@router.get("/products")
def get_products(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_products(db)

@router.post("/products")
def create_product(data: ProductData, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.create_product(db, data.dict())

@router.put("/products/{product_id}")
def update_product(product_id: int, data: ProductData, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.update_product(db, product_id, data.dict())

@router.delete("/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.delete_product(db, product_id)

class ReorderData(BaseModel):
    ordered_ids: list[int]

@router.post("/products/reorder")
def reorder_products(data: ReorderData, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.reorder_products(db, data.ordered_ids)

@router.patch("/products/{product_id}/stock")
def update_product_stock(product_id: int, data: StockData, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.update_product_stock(db, product_id, data.stock)

@router.get("/clients")
def get_clients(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_clients(db)

@router.post("/clients")
def create_client(data: ClientData, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.create_client(db, data.dict())

@router.put("/clients/{client_id}")
def update_client(client_id: int, data: ClientData, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.update_client(db, client_id, data.dict())

@router.delete("/clients/{client_id}")
def delete_client(client_id: int, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.delete_client(db, client_id)

@router.get("/employees")
def get_employees(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_employees(db)

@router.get("/employees/novedades")
def get_empleado_novedades(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_empleado_novedades(db)

@router.post("/employees/{employee_id}/novedad")
def add_empleado_novedad(employee_id: int, data: NovedadData, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.add_empleado_novedad(db, employee_id, data.dict())

@router.get("/caja")
def get_caja(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_caja_movimientos(db)

@router.get("/repartidores")
def get_repartidores(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_repartidores(db)

@router.get("/caja/report")
def get_caja_report(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_caja_report(db)

@router.get("/client/{phone}")
def get_client_by_phone(phone: str, db: Session = Depends(deps.get_yummy_db)):
    from fastapi import HTTPException
    client = ModulesExtractor.search_client_by_phone(db, phone)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return client

@router.get("/repartidores/history")
def get_global_repartidor_history(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_global_repartidor_history(db)

@router.get("/dashboard/metrics")
def get_dashboard_metrics(db: Session = Depends(deps.get_db)):
    from app.models.yummy import YummyInstallation
    from app.services.yummy_client import YummyIntegrationClient
    
    install = db.query(YummyInstallation).filter(YummyInstallation.connection_status == "ONLINE").first()
    if not install:
        return {
            "ventas_turno": 0, "pedidos_activos": 0, "pedidos_finalizados": 0,
            "product_sales": [], "stock_levels": []
        }
        
    client = YummyIntegrationClient(install.base_url, install.api_key)
    try:
        # El endpoint remoto debe devolver el estado del dashboard local
        metrics_data = client.get_metrics()
        return metrics_data
    except Exception as e:
        print("Error fetching metrics from remote:", e)
        return {
            "ventas_turno": 0, "pedidos_activos": 0, "pedidos_finalizados": 0,
            "product_sales": [], "stock_levels": []
        }

@router.get("/repartidor/{id}/history")
def get_repartidor_history(id: int, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_repartidor_history(db, id)

@router.get("/schema_dump")
def dump_schema(db: Session = Depends(deps.get_yummy_db)):
    try:
        from app.services.extractor_modules import ModulesExtractor
        res = ModulesExtractor.get_active_pedidos(db)
        return res
    except Exception as e:
        return {"error": str(e)}

@router.get("/cocina/pedidos")
def get_cocina_pedidos(db: Session = Depends(deps.get_yummy_db)):
    try:
        from app.services.extractor_modules import ModulesExtractor
        return ModulesExtractor.get_active_pedidos(db)
    except Exception as e:
        print("Error fetching pedidos:", e)
        return []

@router.get("/cocina/config")
def get_cocina_config():
    try:
        client = get_integration_client()
        if not client: return {}
        parsed = client.request("GET", "/api/comandero/config")
        return parsed.get('data', {}) if isinstance(parsed, dict) and 'data' in parsed else parsed
    except Exception:
        return {}

@router.put("/cocina/comandas/{order_id}/{kitchen_key}/state")
def update_cocina_state(order_id: int, kitchen_key: str, data: dict):
    try:
        client = get_integration_client()
        if not client: return {}
        return client.request("PUT", f"/api/comandas/{order_id}/{kitchen_key}/state", payload=data)
    except Exception:
        return {}

from pydantic import BaseModel
from typing import Optional

class CajaMovimientoData(BaseModel):
    movement_type: str
    amount: float
    payment_method: str = "efectivo"
    movement_date: str
    employee_id: Optional[int] = None
    employee_name: Optional[str] = ""
    notes: Optional[str] = ""
    source_type: Optional[str] = ""
    source_id: Optional[int] = None

from fastapi import Request, Depends
from sqlalchemy.orm import Session
from app.api import deps
from app.models.yummy import YummyInstallation

@router.put("/pedidos/{order_id}")
async def update_pedido(order_id: int, request: Request):
    try:
        data = await request.json()
        client = get_integration_client()
        if not client: return {}
        return client.request("PUT", f"/api/v1/data/pedidos/{order_id}", payload=data)
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/pedidos/{order_id}/cancel")
async def cancel_pedido(order_id: int):
    try:
        client = get_integration_client()
        if not client: return {}
        return client.request("POST", f"/api/v1/data/pedidos/{order_id}/cancel")
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/caja/movimiento")
def add_caja_movimiento(data: CajaMovimientoData):
    try:
        client = get_integration_client()
        if not client: return {}
        return client.request("POST", "/api/caja/movimientos", payload=data.dict(exclude_none=True))
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))

class UsuarioData(BaseModel):
    username: str
    password: str = ""
    role: str = "cajero"
    active: bool = True

@router.get("/usuarios")
def get_usuarios(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_usuarios(db)

@router.post("/usuarios")
def create_usuario(data: UsuarioData, db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.create_usuario(db, data.dict())

@router.put("/usuarios/{user_id}/password")
def update_usuario_password(user_id: int, data: dict, db: Session = Depends(deps.get_yummy_db)):
    password = data.get("password")
    if not password:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Password is required")
    return ModulesExtractor.update_usuario_password(db, user_id, password)

@router.put("/usuarios/{user_id}/status")
def toggle_usuario_status(user_id: int, data: dict, db: Session = Depends(deps.get_yummy_db)):
    active = data.get("active")
    if active is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Active status is required")
    return ModulesExtractor.toggle_usuario_status(db, user_id, bool(active))

@router.get("/audit-logs")
def get_audit_logs(db: Session = Depends(deps.get_yummy_db)):
    return ModulesExtractor.get_audit_logs(db)
