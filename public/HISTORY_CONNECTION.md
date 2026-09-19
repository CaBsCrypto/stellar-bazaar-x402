# Conectar actividad y entregas al panel humano

El piloto conserva accesos separados de lectura y escritura, asignados por el operador a un propietario. No utiliza una wallet para identificar automáticamente a una persona. No pegues credenciales en prompts, URLs ni argumentos de herramientas.

## Cliente comprador externo

Configura BazaarAgentClient con history: {writeToken, agentId, taskId, taskTitle, includeResult:true}. Obtén writeToken del almacén de secretos de tu proceso. Elige un taskId nuevo por tarea; reutilízalo en navegador y cliente si ambos participan en esa tarea. La configuración de resultados es explícita: includeResult sigue desactivado por defecto para clientes anteriores.

El cliente registra el comienzo, búsquedas, selección, solicitud, pago reportado y entrega. Al terminar todas las operaciones de la tarea, llama await client.finishTask(). Si la tarea termina con un error, llama finishTask(true). Consultar o registrar historial nunca firma, cobra ni añade aprobaciones por compra.

Cada operación incluye taskId y clientOperationId. Los resultados de texto/JSON permitidos se conservan con la compra; evita secretos y datos innecesarios. Un fallo al guardar se comunica en history.status y no debe causar otro pago.

## WebMCP nativo

El humano abre /history con su acceso de lectura. En Conectar actividad del navegador introduce el acceso de escritura del mismo propietario, agente, taskId y nombre de tarea. El agente utiliza las herramientas bazaar_private_* registradas directamente en WebMCP nativo. bazaar_private_connection explica la conexión sin devolver credenciales; bazaar_private_finish_task termina la tarea. Desconectar o salir retira las herramientas.

Estas herramientas no pasan por el emulador público ni emiten resultados a sus eventos visuales. Sus ejecuciones conservan el alcance existente: referencias locales o recuperación acotada, sin realizar compras externas. Se identifican como fixture. Para compras x402 usa el cliente comprador; comparte taskId para agrupar ambos recorridos. La página debe permanecer abierta para sus herramientas nativas.

Los navegadores sin WebMCP nativo conservan la consulta web y la integración por cliente/API. No se anuncia compatibilidad nativa hasta realizar el smoke en un navegador compatible.

## HTTP privado

Authorization: Bearer <acceso de escritura> permite POST /api/activity con eventId, taskId, agentId opcional, mode (fixture/mock/testnet), kind, title, operationId y serviceId opcionales. Los tipos de evento son task-started, search, service-inspected, service-selected, request-started, payment-reported, delivery-reported, task-completed y error. El servidor asigna la fecha de recepción y la evidencia agent-reported. No acepta ownerId, fecha ni evidencia elegidos por el cliente.

POST /api/operations conserva el formato anterior y admite taskId. delivery.artifact puede ser un archivo {kind:file, filename, mediaType, base64} de hasta 64 KiB o una referencia {kind:external, url, label}. Las referencias externas deben ser HTTPS, del origen del proveedor y sin credenciales ni query. El proveedor conserva su propio mecanismo de autenticación; Bazaar no inventa acceso a enlaces privados ni reconstruye archivos ausentes. Para entregas mayores se necesita el acceso del proveedor. No se descargan URLs externas desde el servidor.

GET /api/activity?view=tasks|events|operations usa acceso de lectura. Admite limit (1–100), cursor, taskId, agentId, from/to (fechas UTC) y status (active/completed/error/legacy). Reutiliza los mismos filtros al paginar; los cursores están ligados al propietario, filtros e instante de consulta. GET /api/activity?download=1&operationId=<id del registro> descarga exclusivamente un resultado del propietario autenticado. Nunca incluyas credenciales en la URL.

Repetir un eventId o clientOperationId con contenido idéntico es idempotente; cambiar su contenido devuelve conflicto. Se conservan 1000 compras y 10000 eventos por propietario; llegar al límite produce un error explícito. Este piloto consulta un corpus acotado para filtrar y paginar. La política de borrado y retención deberá acordarse antes de publicación.

## Lo que demuestra el panel

Las fechas indican recepción de eventos. La falta de eventos no demuestra finalización. Las compras anteriores aparecen sin pasos inventados. Los reportes del navegador y del cliente son agent-reported: autenticarlos no demuestra que el pago se verificó en Stellar. El enlace al explorador sirve para inspeccionar la referencia. La conciliación existente del comprador no se convierte en verificación independiente del servidor de historial.

La vista /history/review contiene ejemplos simulados sin acceso a historiales privados. Para verificar persistencia se requiere Redis real de prueba. Para validar una compra se requiere proveedor operativo, comprador Testnet y verificador configurados; nunca repetir un pago para subsanar un error del historial.

## Interactive delivery files
Enable `history.preserveFiles: true` in the Node buyer SDK to preserve a provider `bazaarDelivery` manifest and same-origin file sources. Retry storage with `preserveDeliverable` and the original operation/version IDs; never repeat payment to recover files. Read docs/INTERACTIVE_DELIVERIES.md in the repository for the manifest and private API. External MCP/WebMCP discovery alone cannot capture external purchases or files. Keep private results and signed URLs out of the public emulator.
