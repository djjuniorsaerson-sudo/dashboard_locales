FROM python:3.10-slim

WORKDIR /app

# Primero copiamos el requirements
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Luego el resto del código
COPY . .

# Copiar script de inicio
COPY start.sh .
RUN chmod +x start.sh

# Comando de inicio
CMD ["./start.sh"]
