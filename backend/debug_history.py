import traceback
from sqlalchemy import create_engine, text
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL)

query1 = """
SELECT v.id, v.pedido_id, v.status, v.total_amount, v.address, v.notes, v.created_at, r.name
FROM repartidor_viajes v
LEFT JOIN repartidores r ON v.repartidor_id = r.id
ORDER BY v.id DESC
LIMIT 5
"""

query2 = """
SELECT v.id, v.status, v.total_amount, r.name
FROM repartidor_viajes v
LEFT JOIN repartidores r ON v.repartidor_id = r.id
ORDER BY v.id DESC
LIMIT 5
"""

with engine.connect() as conn:
    print("Trying Query 1")
    try:
        res = conn.execute(text(query1)).fetchall()
        print("Success!", len(res))
        for r in res: print(r)
    except Exception as e:
        print("Failed Query 1:", e)

    print("\nTrying Query 2")
    try:
        res = conn.execute(text(query2)).fetchall()
        print("Success!", len(res))
        for r in res: print(r)
    except Exception as e:
        print("Failed Query 2:", e)
        
    print("\nChecking columns in repartidor_viajes")
    try:
        res = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='repartidor_viajes';"))
        for r in res: print(r[0])
    except Exception as e:
        print("Failed to get columns:", e)
