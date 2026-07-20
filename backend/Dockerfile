FROM python:3.10-slim

WORKDIR /app

# Primero copiamos el requirements
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Luego el resto del código
COPY . .

# Comando de inicio
CMD ["/bin/sh", "-c", "sleep 5 && python create_db.py && python create_admin.py && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
