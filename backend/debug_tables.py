import json
from sqlalchemy import create_engine, text
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL)
with open('debug_out.txt', 'w') as f:
    try:
        with engine.connect() as conn:
            res = conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'"))
            tables = [r[0] for r in res]
            f.write(f"TABLES: {tables}\n\n")
            
            if 'pedidos' in tables:
                res = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='pedidos'"))
                f.write(f"PEDIDOS COLS: {[r[0] for r in res]}\n\n")
            
            res = conn.execute(text("SELECT id, pedido_id, status, notes, address FROM repartidor_viajes ORDER BY id DESC LIMIT 15"))
            f.write("RECENT VIAJES:\n")
            for r in res:
                f.write(f"{r}\n")
    except Exception as e:
        f.write(f"ERROR: {e}\n")
