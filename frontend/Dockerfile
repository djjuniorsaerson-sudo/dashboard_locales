# Etapa de compilación
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Etapa de producción
FROM nginx:alpine

# Copiar configuración de nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar archivos compilados
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
