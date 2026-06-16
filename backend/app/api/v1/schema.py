from fastapi import APIRouter
import psycopg2

router = APIRouter()

@router.get("/schema")
def get_schema():
    try:
        conn = psycopg2.connect('host=localhost user=yummy_app password=YummyDb2026! dbname=yummy')
        cur = conn.cursor()
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
        tables = [r[0] for r in cur.fetchall()]
        schema = {}
        for t in tables:
            cur.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{t}'")
            schema[t] = cur.fetchall()
        cur.close()
        conn.close()
        return schema
    except Exception as e:
        return {"error": str(e)}
