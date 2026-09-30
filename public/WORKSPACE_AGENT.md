# Tu agente externo y tu espacio privado

Esta guía corresponde al candidato local. Consulta `get_bazaar_capabilities.workspace.enabled` antes de crear accesos. Un bloqueo de configuración o capacidad no es un alta exitosa. Bazaar no aloja un modelo: tu agente usa terminal y MCP desde tu equipo. No necesita correo, aprobación ni credenciales administrativas.

## Requisitos y ámbitos

- Checkout de Bazaar identificado por SHA, Node 22.18+ y `npm ci`. Ejecuta desde su raíz. Los ejemplos son internos del repositorio, no un SDK publicado.
- Cliente MCP Streamable HTTP con cabecera Authorization configurable, almacenamiento privado fuera del checkout y origen HTTPS exacto (loopback HTTP solo para pruebas).
- Tres conexiones distintas: descubrimiento sin token; proveedor con su token de solicitud; espacio e historial con el acceso del agente. No intercambies credenciales.
- El secreto de recuperación pertenece al dueño del espacio. Solo autoriza alta, rotación y revocación; nunca se entrega al agente delegado. No guardes tokens en prompts públicos, repositorio, URLs HTTP ni argumentos MCP. El cliente MCP puede conservar trazas: protege su configuración.

## 1. Preparar antes de crear

Desde un checkout local de este candidato, usando el localhost entregado por el operador:

```sh
node examples/agent-workspace-mcp.mjs prepare /ruta/privada/nueva http://127.0.0.1:3282
node examples/agent-workspace-mcp.mjs create /ruta/privada/nueva
```

Windows admite una ruta absoluta privada como `C:\Users\TU_USUARIO\AppData\Local\Temp\bazaar-mi-espacio`. El helper verifica permisos antes de escribir y no carga archivos `.env` ni claves de wallet. `workspace-root.json` conserva UUID, secreto de recuperación, accesos y hashes antes del envío. Guarda una copia privada segura. `creation-receipt.json` conserva el primer comprobante; `responses/` conserva consultas posteriores. Una respuesta perdida se recupera repitiendo **create con el mismo archivo**, sin generar otro intento. Datos distintos con ese UUID producen conflicto. Un intento revocado no recrea accesos.

Entrega únicamente `agent.json` al agente, conservando el directorio privado y los archivos de intentos. `human-links.txt` contiene tus enlaces a `/agent-chat#token=…` y `/history#token=…`; no los publiques. El token se captura y retira de la barra y se conserva en memoria, no en almacenamiento del navegador. Bloquear cancela solicitudes y retira contenido y borradores; no revoca el enlace conservado.

## 2. Conversar y responder

Abre el enlace humano, crea una conversación y envía un mensaje. El humano puede escribir sus mensajes y leer su biblioteca, pero no responder como agente ni registrar operaciones. El agente consulta explícitamente:

```sh
node examples/agent-workspace-mcp.mjs tasks /ruta/privada/nueva
node examples/agent-workspace-mcp.mjs claim /ruta/privada/nueva UUID_DE_TAREA
```

El resultado íntegro se guarda privadamente en `responses/`. `claim` conserva `attemptId` antes de llamar al servidor. Una tarea reclamada permanece asociada a ese intento: no caduca para autorizar otro efecto. Consulta o repite ese mismo intento ante incertidumbre; no reclames con otro identificador.

Prepara y guarda `respuesta.json` antes de responder:

```json
{"text":"Resultado de ejemplo, gratuito y sin pago."}
```

```sh
node examples/agent-workspace-mcp.mjs respond /ruta/privada/nueva UUID_DE_TAREA respuesta.json
```

El helper congela `messageId`, texto e intento antes de enviar. Repetir lo mismo recupera la respuesta; cambiarla produce conflicto. El humano pulsa **Actualizar**: no hay conexión permanente ni consultas indefinidas. Los estados representan pendiente, recibido por el agente, respuesta disponible o incierto. Una respuesta no se inventa cuando el agente está ausente.

## 3. Conservar una entrega inline

Si el agente genera una muestra, guarda primero el resultado en un archivo privado. Consulta `/api/openapi` y los esquemas de `tools/list`. `record_bazaar_operation` recibe `{operation:…}` con el esquema nativo de `/api/operations`; `record_bazaar_activity` recibe `{event:…}` con el de `/api/activity`. El servidor deriva propietario y agente. Usa identificadores estables, `mode: "mock"` o `"fixture"`, pago `not-requested`, importe atómico `"0"` y resultado inline. La etiqueta de simulación permanece visible. No son pruebas de pago, descarga externa ni persistencia certificada.

Ejemplo completo para `operacion.json`: sustituye `UUID_DE_TAREA` por el identificador real reclamado y conserva `clientOperationId` para todos sus reenvíos. El destinatario es un campo requerido del esquema heredado; aquí no se transfiere nada y `NO_PAYMENT` no es un activo admitido para comprar. Omite `agentId`: lo asigna el servidor.

```json
{
  "clientOperationId": "ejemplo-inline-001",
  "taskId": "UUID_DE_TAREA",
  "mode": "mock",
  "service": {"id":"ejemplo-gratuito", "title":"Ejemplo inline sin pago", "provider":"Tu agente externo", "url":"http://127.0.0.1:3282"},
  "payment": {"status":"not-requested", "network":"stellar:testnet", "asset":"NO_PAYMENT", "amountAtomic":"0", "recipient":"GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ"},
  "delivery": {"status":"reported-delivered", "result":{"simulation":true, "summary":"Resultado de ejemplo conservado, sin transferencia."}}
}
```

Para un entorno HTTPS utiliza su URL exacta en `service.url`. Guarda `actividad.json` usando la misma tarea y `clientOperationId`:

```json
{"eventId":"ejemplo-entrega-001", "taskId":"UUID_DE_TAREA", "operationId":"ejemplo-inline-001", "mode":"mock", "kind":"delivery-reported", "title":"Ejemplo inline disponible", "result":{"simulation":true}}
```

```sh
node examples/agent-workspace-mcp.mjs record /ruta/privada/nueva operacion.json
node examples/agent-workspace-mcp.mjs activity /ruta/privada/nueva actividad.json
node examples/agent-workspace-mcp.mjs recover /ruta/privada/nueva
```

Después de registrar, responde con `{"text":"Tu ejemplo está en la biblioteca", "operationId":"ID_DE_OPERACION_CONSERVADO"}`. Solo se puede vincular una operación propia. Ante fallo de historial, reintenta **el mismo registro conservado**, sin regenerar el resultado ni ejecutar otra compra. El Magic Link humano recupera esa misma entrega tras reiniciar el servidor con el mismo almacenamiento. Registrar no paga; este espacio no admite informes de pagos, archivos externos ni cargas.

## 4. Ofrecer un servicio

Consulta la skill de vendedor y `/PROVIDER_ONBOARDING.md` usando una conexión distinta. Prepara y valida tu API y ficha, conserva UUID y token de solicitud antes de enviar y solicita autorización de sus condiciones. Tu solicitud permanece pendiente de verificación/revisión administrativa; crear un espacio, validar, enviar o aprobar no activa el servicio ni lo hace aparecer en catálogo.

## 5. Renovar o revocar

Solo el dueño usa el archivo raíz y secreto de recuperación:

```sh
node examples/agent-workspace-mcp.mjs rotate /ruta/privada/nueva human
node examples/agent-workspace-mcp.mjs rotate /ruta/privada/nueva agent
node examples/agent-workspace-mcp.mjs revoke /ruta/privada/nueva
```

La rotación cambia un rol y conserva el otro y los datos. Redis conserva hashes y revocaciones, nunca los secretos originales. `expectedGeneration` impide cambios sobre un estado antiguo. El helper conserva el cambio pendiente antes de enviarlo; ante incertidumbre, conserva ese archivo y reconcilia **ese cambio**. No lo borres para empezar otro. Revocar retira ambos accesos; no borra las entregas ni permite recrear el mismo intento. Perder todos los secretos no permite recuperación automática ni prueba propiedad por conocer un `ownerId`.

## Límites y recuperación

El alta está cerrada por defecto. Los límites compartidos de creación, peticiones y bytes bloquean nuevos efectos al agotarse; respeta `Retry-After`, no hagas bucles automáticos. Redis inaccesible o registro dañado produce error explícito, sin fallback ni falso éxito. El almacén local de archivos es solo para localhost. Los límites de aplicación no prueban disponibilidad gratuita o durabilidad del proveedor: una validación Redis externa exige presupuesto propio. Pérdida/restauración conocida del almacenamiento requiere detener y reconciliar, no volver a ejecutar intenciones antiguas automáticamente.

Pagos, modelos alojados, cargas externas, activación automática y multichain quedan fuera de esta beta.
