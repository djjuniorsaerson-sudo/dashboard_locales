from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api import deps
from app.services.extractor_modules import ModulesExtractor

router = APIRouter()

from pydantic import BaseModel

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
def get_products(db: Session = Depends(deps.get_db)):
    return ModulesExtractor.get_products(db)

@router.post("/products")
def create_product(data: ProductData, db: Session = Depends(deps.get_db)):
    return ModulesExtractor.create_product(db, data.dict())

@router.put("/products/{product_id}")
def update_product(product_id: int, data: ProductData, db: Session = Depends(deps.get_db)):
    return ModulesExtractor.update_product(db, product_id, data.dict())

@router.delete("/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(deps.get_db)):
    return ModulesExtractor.delete_product(db, product_id)

class ReorderData(BaseModel):
    ordered_ids: list[int]

@router.post("/products/reorder")
def reorder_products(data: ReorderData, db: Session = Depends(deps.get_db)):
    return ModulesExtractor.reorder_products(db, data.ordered_ids)

@router.patch("/products/{product_id}/stock")
def update_product_stock(product_id: int, data: StockData, db: Session = Depends(deps.get_db)):
    return ModulesExtractor.update_product_stock(db, product_id, data.stock)

@router.get("/clients")
def get_clients(db: Session = Depends(deps.get_db)):
    return ModulesExtractor.get_clients(db)

@router.post("/clients")
def create_client(data: ClientData, db: Session = Depends(deps.get_db)):
    return ModulesExtractor.create_client(db, data.dict())

@router.put("/clients/{client_id}")
def update_client(client_id: int, data: ClientData, db: Session = Depends(deps.get_db)):
    return ModulesExtractor.update_client(db, client_id, data.dict())

@router.delete("/clients/{client_id}")
def delete_client(client_id: int, db: Session = Depends(deps.get_db)):
    return ModulesExtractor.delete_client(db, client_id)

@router.get("/employees")
def get_employees(db: Session = Depends(deps.get_db)):
    return ModulesExtractor.get_employees(db)

@router.get("/employees/novedades")
def get_empleado_novedades(db: Session = Depends(deps.get_db)):
    return ModulesExtractor.get_empleado_novedades(db)

@router.post("/employees/{employee_id}/novedad")
def add_empleado_novedad(employee_id: int, data: NovedadData, db: Session = Depends(deps.get_db)):
    return ModulesExtractor.add_empleado_novedad(db, employee_id, data.dict())

@router.get("/caja")
def get_caja(db: Session = Depends(deps.get_db)):
    return ModulesExtractor.get_caja_movimientos(db)

@router.get("/repartidores")
def get_repartidores(db: Session = Depends(deps.get_db)):
    return ModulesExtractor.get_repartidores(db)

@router.get("/caja/report")
def get_caja_report(db: Session = Depends(deps.get_db)):
    return ModulesExtractor.get_caja_report(db)

@router.get("/client/{phone}")
def get_client_by_phone(phone: str, db: Session = Depends(deps.get_db)):
    from fastapi import HTTPException
    client = ModulesExtractor.search_client_by_phone(db, phone)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return client

@router.get("/repartidores/history")
def get_global_repartidor_history(db: Session = Depends(deps.get_db)):
    return ModulesExtractor.get_global_repartidor_history(db)

@router.get("/dashboard/metrics")
def get_dashboard_metrics(db: Session = Depends(deps.get_db)):
    return ModulesExtractor.get_dashboard_metrics(db)

@router.get("/repartidor/{id}/history")
def get_repartidor_history(id: int, db: Session = Depends(deps.get_db)):
    return ModulesExtractor.get_repartidor_history(db, id)

@router.get("/schema_dump")
def dump_schema(db: Session = Depends(deps.get_db)):
    from sqlalchemy import text
    try:
        query = text("SELECT id, employee_id, event_type, amount, notes, event_date FROM empleado_novedades ORDER BY id DESC LIMIT 50")
        res = db.execute(query).fetchall()
        return [dict(r._mapping) for r in res]
    except Exception as e:
        return {"error": str(e)}

import urllib.request
import json

@router.get("/cocina/pedidos")
def get_cocina_pedidos(db: Session = Depends(deps.get_db)):
    try:
        req = urllib.request.Request("http://localhost:8080/api/v1/data/cocina/pedidos")
        install = db.query(YummyInstallation).first()
        integration_key = install.api_key if install else ""
        if integration_key:
            req.add_header("X-Integration-Key", integration_key)

        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = response.read().decode('utf-8')
                parsed = json.loads(data)
                return parsed
        return []
    except Exception:
        return []

@router.get("/cocina/config")
def get_cocina_config():
    try:
        req = urllib.request.Request("http://localhost:8080/api/comandero/config")
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = response.read().decode('utf-8')
                parsed = json.loads(data)
                return parsed.get('data', {}) if isinstance(parsed, dict) and 'data' in parsed else parsed
        return {}
    except Exception:
        return {}

@router.put("/cocina/comandas/{order_id}/{kitchen_key}/state")
def update_cocina_state(order_id: int, kitchen_key: str, data: dict):
    try:
        encoded_data = json.dumps(data).encode('utf-8')
        req = urllib.request.Request(
            f"http://localhost:8080/api/comandas/{order_id}/{kitchen_key}/state",
            data=encoded_data,
            method="PUT"
        )
        req.add_header('Content-Type', 'application/json')
        with urllib.request.urlopen(req, timeout=5) as response:
            resp_data = response.read().decode('utf-8')
            return json.loads(resp_data)
    except Exception:
        return {}

from fastapi import Request, Depends
from sqlalchemy.orm import Session
from app.api import deps
from app.models.yummy import YummyInstallation

@router.put("/pedidos/{order_id}")
async def update_pedido(order_id: int, request: Request, db: Session = Depends(deps.get_db)):
    try:
        data = await request.json()
        encoded_data = json.dumps(data).encode('utf-8')
        req = urllib.request.Request(
            f"http://localhost:8080/api/v1/data/pedidos/{order_id}",
            data=encoded_data,
            method="PUT"
        )
        req.add_header('Content-Type', 'application/json')
        # Pasamos el integration key desde la BD
        install = db.query(YummyInstallation).first()
        integration_key = install.api_key if install else ""
        if integration_key:
            req.add_header("X-Integration-Key", integration_key)
            
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        from fastapi import HTTPException
        err_detail = e.read().decode('utf-8')
        raise HTTPException(status_code=e.code, detail=err_detail)
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/pedidos/{order_id}/cancel")
async def cancel_pedido(order_id: int, request: Request, db: Session = Depends(deps.get_db)):
    try:
        req = urllib.request.Request(
            f"http://localhost:8080/api/v1/data/pedidos/{order_id}/cancel",
            method="POST"
        )
        install = db.query(YummyInstallation).first()
        integration_key = install.api_key if install else ""
        if integration_key:
            req.add_header("X-Integration-Key", integration_key)
            
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        from fastapi import HTTPException
        err_detail = e.read().decode('utf-8')
        raise HTTPException(status_code=e.code, detail=err_detail)
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))
