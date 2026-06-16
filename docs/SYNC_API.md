# Documentación de la API de Sincronización (Agente Local)

Este documento detalla el formato JSON y los endpoints que el **Agente Local** (desarrollado por la otra IA) debe consumir para sincronizar datos bidireccionalmente con el Panel Central.

## Patrón de Arquitectura: Outbox + LWW (Last Write Wins)
El agente local nunca accede a la base de datos central directamente. Toda sincronización se realiza mediante una cola de eventos de mutación (Action = `CREATE`, `UPDATE` o `DELETE`).

Base URL: `http://<IP_VPS>/api/v1/locations/{location_id}/sync`
Autenticación: Enviar header `Authorization: Bearer <TOKEN>` (Para la prueba actual, se emitirá desde `/api/v1/auth/login`).

---

## 1. Push (Desde Local hacia Central)

El agente local debe agrupar los cambios realizados localmente en lotes y enviarlos mediante un POST.

**Endpoint:** `POST /push`

**Request Body (JSON):**
```json
{
  "events": [
    {
      "entity_type": "PRODUCT",
      "entity_id": "550e8400-e29b-41d4-a716-446655440000",
      "action": "CREATE",
      "local_timestamp": "2026-06-08T15:30:00Z",
      "payload": {
        "name": "Hamburguesa Triple",
        "price": 5500.0,
        "stock": 10,
        "is_active": true,
        "metadata_info": {"extra": "sin cebolla"}
      }
    },
    {
      "entity_type": "ORDER",
      "entity_id": "b3e24451-c045-4201-8d2b-8a8b12345678",
      "action": "UPDATE",
      "local_timestamp": "2026-06-08T15:32:15Z",
      "payload": {
        "status": "PREPARING"
      }
    }
  ]
}
```
**Response:**
```json
{
  "processed": 2,
  "failed": 0,
  "status": "SUCCESS"
}
```

---

## 2. Pull (Desde Central hacia Local)

El agente debe consultar periódicamente (Polling o vía WebSocket a futuro) los cambios ocurridos en el servidor central que fueron generados por administradores desde la web.

**Endpoint:** `GET /pull?last_sync=2026-06-08T15:00:00Z`
*(El parámetro `last_sync` debe ser la fecha y hora UTC de la última vez que el agente hizo un pull exitoso).*

**Response (JSON):**
```json
{
  "server_time": "2026-06-08T15:45:00Z",
  "events": [
    {
      "entity_type": "PRODUCT",
      "entity_id": "123e4567-e89b-12d3-a456-426614174000",
      "action": "UPDATE",
      "payload": {
        "price": 6000.0
      },
      "local_timestamp": "2026-06-08T15:40:00Z"
    }
  ]
}
```

**Reglas de Resolución de Conflictos que la IA del Agente Local debe implementar:**
1. Al recibir el `/pull`, si el registro `entity_id` ya fue modificado localmente *después* del `local_timestamp` que indica el servidor, el Agente debe ignorar la mutación o combinarla con cuidado. 
2. Si el Agente local falló al hacer push por falta de internet, debe guardar los eventos en una tabla SQLite local (`outbox_events`) y reintentar cuando haya conexión.
