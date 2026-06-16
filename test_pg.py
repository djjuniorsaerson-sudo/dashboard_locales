import psycopg2
try:
    conn = psycopg2.connect('host=localhost user=yummy_app password=YummyDb2026! dbname=central_db client_encoding=utf8')
    print("SUCCESS")
except Exception as e:
    import traceback
    traceback.print_exc()
