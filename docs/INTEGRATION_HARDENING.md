# Revisión Yummy y panel

## Bloque 1: aislamiento de cocina por local

Implementado en el código local el 7 de septiembre de 2026. No desplegado.

- Configuración y cambios de comandas requieren autenticación, usuario activo y `installation_id` UUID explícito.
- La instalación debe pertenecer a la organización del usuario y tener la integración habilitada y disponible.
- No se elige una instalación alternativa cuando falta el local o no está disponible.
- Los errores de conexión, timeout, conflictos y respuestas inválidas producen errores HTTP explícitos. Los cambios requieren confirmación `ok: true` de Yummy.
- La pantalla envía el local al consultar configuración, cancela consultas al cambiar de local y evita consultas de pedidos simultáneas.
- Los errores de consulta se muestran en pantalla. Esto no identifica todavía los datos servidos desde snapshots: corresponde al bloque pendiente de caché.

Validación sin usar la base de datos del cliente:

```powershell
cd backend
python -B -m unittest test_kitchen_integration -v
cd ../frontend
npm run build
```

Las pruebas de API usan dependencias y conexiones remotas simuladas. Queda pendiente la comprobación visual con dos locales reales y un corte de conexión.

## Bloque 2: reintentos sin repetir operaciones

Implementado en el código local el 7 de septiembre de 2026. No desplegado ni empaquetado en un instalador nuevo.

- El panel guarda la acción y su UUID antes de enviar pedidos, movimientos de caja y ajustes de stock a Yummy.
- La petición directa y el worker conservan el mismo `_operation_id` y los mismos datos.
- Yummy guarda el resultado en `panel_remote_operations` dentro de la misma transacción que los cambios de negocio. Los commits intermedios de `execute_db` se difieren exclusivamente durante estas operaciones identificadas.
- Un bloqueo transaccional por operación serializa peticiones simultáneas. Si ya está guardada, se devuelve la respuesta original. Si el mismo identificador trae datos diferentes, se responde 409.
- Si la operación falla, se revierten también pedido, venta, stock o adelanto asociados. Si se pierde la confirmación después de guardar, el siguiente intento recupera el resultado existente.
- El ajuste remoto de stock transmite un objetivo estable. El worker no recalcula otro ajuste al repetir una operación ya aplicada, por lo que respeta las ventas posteriores.
- Una notificación tardía de fallo no convierte una acción completada en fallida. Los errores temporales del worker quedan disponibles para reintento.
- Las operaciones locales sin identificador mantienen su funcionamiento anterior.

Validación: 13 pruebas de Yummy con PostgreSQL real en una instancia temporal exclusiva, 10 pruebas del panel con transporte/base simulados y las 12 pruebas de cocina de la fase anterior. Todas aprobadas.

```powershell
cd backend
python -B -m unittest test_remote_action_dispatch test_kitchen_integration -v
```

En el proyecto Yummy, `python -B -m unittest test_remote_operations -v` requiere `YUMMY_RETRY_TEST_DSN` apuntando a una base desechable llamada `yummy_retry_test`, en `127.0.0.1` y un puerto diferente de 5432. La prueba rechaza otras bases y reinicia únicamente los datos de esa base de prueba.

### Actualización y comprobación manual

Actualizar primero Yummy API y worker juntos y después el backend del panel, usando los nuevos fuentes. Al iniciar Yummy se crea la tabla auxiliar automáticamente. Los módulos nuevos se importan de forma estática, por lo que entran en el empaquetado existente de API y worker. No usar el instalador anterior para validar esta fase.

Hacer las pruebas en un local de prueba, fuera del servicio:

1. Crear un pedido desde el panel. Debe existir una sola vez en Yummy, con una sola venta y un solo descuento de stock.
2. Cargar desde el panel un movimiento de caja y un vale. Debe haber un registro de cada uno; el vale debe producir un único adelanto del empleado.
3. Dejar sin conexión la PC de Yummy, mantener el panel accesible desde otro dispositivo y cargar una sola vez un pedido y un movimiento. Al reconectar, esperar que la cola termine y comprobar que cada operación aparece una sola vez. No volver a crearla con el formulario.
4. Ajustar stock desde el panel, registrar una venta en Yummy y comprobar que el stock sigue descontado después de actualizar/reconectar. El test automático cubre además la repetición exacta del ajuste original después de esa venta.
5. Recorrer cocina 1 y 2, asignar repartidor y pulsar Listo en salida: el pedido debe seguir en Pedidos en curso como antes de esta fase.

Límites: la protección cubre reintentos de una misma acción, no dos altas independientes desde el formulario. No deduplica retroactivamente acciones aplicadas con versiones anteriores que nunca guardaron el identificador. El corte exacto después del guardado y antes de confirmar ya fue simulado en las pruebas automáticas.

## Trabajo pendiente

1. Entregas explícitas: dejar de inferirlas de la asignación a un repartidor.
2. Reglas comunes de transición y protección contra acciones atrasadas. Conservar que `Listo` en cocina y salida no finaliza el pedido.
3. Snapshots con origen, antigüedad y control de escrituras concurrentes.
4. Relación estructurada entre vuelto y pedido, con migración verificable de las notas existentes.
5. Reasignaciones transaccionales y recálculo de ambos viajes.
6. Una fuente de cálculo para entregados y vuelto; protección contra respuestas atrasadas en empleados y repartidores.
7. Tabla de entregas con migración del registro actual y paginación, sin recorte a 500 entradas.

No considerar estos puntos resueltos por los dos primeros bloques. Antes de desplegar cada bloque deben comprobarse pedidos mixtos, cocina 1 y 2, salida, entrega, reasignación y reintentos según corresponda.
