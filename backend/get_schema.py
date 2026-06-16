import psycopg2
import json

def get_schema():
    conn = psycopg2.connect('host=localhost user=yummy_app password=YummyDb2026! dbname=yummy')
    cur = conn.cursor()
    tables = ['ventas', 'pedidos', 'productos', 'clientes', 'detalle_pedidos']
    schema = {}
    
    for t in tables:
        cur.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{t}'")
        schema[t] = cur.fetchall()
        
    with open('schema.json', 'w') as f:
        json.dump(schema, f, indent=2)

if __name__ == '__main__':
    get_schema()
