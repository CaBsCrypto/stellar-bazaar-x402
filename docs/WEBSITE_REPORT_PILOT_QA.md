# Validación del piloto Website Intelligence — 8 de septiembre de 2026

## Resultado

Compra única completada por **0,001 USDC Testnet**. Informe persistido en Redis real y abierto en `http://127.0.0.1:3214/history`. El proveedor entregó su análisis fixture de example.com: puntuación 88/100 y cinco hallazgos. Este contenido de prueba no representa una auditoría en vivo.

- Operación: `website-pilot-c35f141e2c686e6c490659ce`.
- Transacción: [dd4a835c…afdc6da](https://stellar.expert/explorer/testnet/tx/dd4a835c8e743b698ce53182be7c4971d1e895d66c7ddb48f92ce0624afdc6da).
- Ledger: `4564364`, transacción exitosa el `2026-09-08T05:30:07Z`.
- Horizon y el sobre on-chain confirmaron una operación transfer: pagador, destinatario, contrato USDC Testnet y 10000 atómicos coinciden con lo aprobado y con el recibo. Diferencias observadas de saldo: comprador -10000 y proveedor +10000 atómicos.
- El runner marcó un solo intento; el reintento posterior fue exclusivamente `store`, sin nuevo pago.

El panel conserva la etiqueta de pago reportado por el agente; la verificación adicional anterior pertenece al cliente del piloto, no a un verificador independiente del servidor del historial.

## Persistencia y aislamiento reales

El harness `test-private-report-redis.mjs --run-isolated-test` pasó contra el Redis configurado usando dos propietarios QA nuevos, sin acceder a datos ajenos. Comprobó ocho reintentos concurrentes por store, rechazo de sobrescritura, permisos de lectura/escritura, versiones y recuperación byte a byte del original desde un hijo Node de solo lectura. Conservó dos operaciones mock, dos eventos y tres manifiestos; no usó S3 ni pagó.

Después de comprar se reinició el servidor del piloto. Un proceso Node nuevo volvió a consultar la API privada y comprobó: una operación para esta compra, una versión del informe, seis eventos únicos ligados a ella, hash exacto del resultado original y rechazo 404 para el segundo propietario. El reintento `store` no duplicó registros. Esto valida persistencia externa al proceso de la aplicación; no supone que hayamos reiniciado el servidor administrado de Redis.

## Navegador y pruebas locales

Se abrió la tarea Testnet en `/history`; Resultado fue la pestaña inicial y mostró resumen, puntuación, hallazgos e índice. Actividad mostró seis pasos de la misma operación. Pago y comprobante mostró 0.001 USDC y el enlace al hash correcto. Bloquear retiró tarea e informe. Tras reiniciar el servidor y volver a introducir el acceso, el navegador recuperó la misma tarea y su informe; el desplegable original mostró el JSON exacto del proveedor. El acceso de lectura se conserva en el archivo privado local del piloto para futuras entradas.

Pasaron las pruebas del adaptador, originales acotados y UTF-8, aislamiento mediante handlers, guardado idempotente, fallos parciales sin pago y texto no ejecutable. El test del bloqueo entre procesos comprobó una sola reserva en ocho procesos, negativa tras reinicio y recuperación de un lock cuyo PID ya terminó sin borrar el marcador. El test con el cliente x402 real y firmante simulado rechazó cambios de precio, timeout, recurso, hashes de ficha/input y recuperación antes de llamar al firmante. La compilación Next/TypeScript pasó.

## Límites conservados

El piloto permanece local, con accesos humano/agente separados y archivos de acceso/recuperación ignorados por Git. No se publicó el proyecto. S3, adjuntos multimedia, comentarios y revisiones siguen fuera de este hito. No se guardan semillas de wallet ni credenciales de recuperación en Redis o en el registro público de WebMCP.
