# Prepara tu servicio para Bazaar

Este recorrido no requiere crear una cuenta. Prepara un servicio para Stellar Testnet y un paquete para revisión; no garantiza publicación, ventas ni cobros. Puedes seguirlo sin una copia del repositorio.

Resuelve las rutas relativas contra el mismo origen donde consultaste esta guía y las capacidades MCP. Las URLs públicas de los ejemplos son referencias: en localhost o Preview sustitúyelas por el origen exacto de ese entorno antes de ejecutar comandos. No envíes pruebas locales al servidor público.

## 1. Idea o API existente

Aclara qué hace el servicio, para quién, entradas, resultado, formato de entrega y límites. Si ya existe una API, reutilízala y prueba que produce lo declarado. Si solo existe una idea, prepara una muestra identificada como ilustrativa y enumera lo que falta implementar. No presentes una muestra simulada como servicio operativo.

Confirma con el proveedor precio, activo exacto, red, destino público de cobro y condiciones. No uses direcciones de ejemplo para cobrar. No solicites semillas, claves privadas, credenciales de facilitador ni datos de clientes.

## 2. Prepara y valida la ficha

En /publish puedes describir el servicio y copiar instrucciones para tu agente. Ese borrador editorial no es una ServiceCard. El apartado «Ya tengo una integración técnica» permite preparar y copiar el manifest JSON; sustituye todos los valores de ejemplo por datos confirmados.

Conecta el MCP Streamable HTTP en /api/mcp del mismo origen y usa `initialize`, `tools/list`, `tools/call`. `GET /api/mcp` solo describe capacidades. Comprueba las herramientas anunciadas por el servidor antes de usarlas.

Las herramientas de descubrimiento e historial son `get_bazaar_capabilities`, `list_services`, `search_services`, `get_service`, `list_workflow_bundles`, `get_workflow_bundle`, `validate_service_card` y `get_operation_history`. El historial tiene autenticación propia y no es necesario para preparar un proveedor. Para validar, llama a `validate_service_card` con `{"card": TU_MANIFEST_JSON}`. Revisa `valid` y cada regla en `outcomes`; corrige los fallos antes de continuar.

Consulta get_bazaar_skills con {"role":"seller"} o /skills/seller/SKILL.md para el recorrido canónico. El MCP valida y permite enviar y consultar solicitudes mediante submit_provider_request y get_provider_request_status; no crea la API, comprueba control, aprueba, publica ni firma pagos. WebMCP es otra interfaz del navegador. Como alternativa HTTP, envía el manifest JSON directamente con `Content-Type: application/json` a `POST /api/conformance/service-card` del mismo origen; comprueba `valid`, no solo que haya respuesta.

La validación comprueba formato y reglas; no prueba disponibilidad, control del dominio, seguridad, liquidación ni entrega. Para x402, documenta el desafío 402, la autorización, la verificación y liquidación, la conservación del resultado y la recuperación sin repetir un pago incierto. Preparar este paquete no necesita compra ni fondos. Una prueba de pago requiere autorización y configuración independientes.

### Ejemplo completo de ServiceCard mínima

Este ejemplo es sintético: no existe una API operativa detrás ni autoriza pagos. Sustituye nombre, dominio, ruta, entradas, precio, destinatario y proveedor por valores confirmados. La dirección siguiente es solo un valor público de prueba, no el destino de tu servicio. Si falta un dato, pregunta al proveedor; no lo deduzcas de otro servicio del catálogo.

```json
{
  "version": "bazaar.service-card/v0",
  "id": "independent-report-example",
  "name": "Independent Report — ejemplo",
  "description": "Ejemplo sintético de informe de texto a partir de un tema; no es un servicio disponible.",
  "kind": "http",
  "url": "https://api.seller.example.com",
  "routeTemplate": "/v1/report",
  "input": [{ "name": "topic", "type": "string", "required": true }],
  "network": "stellar:testnet",
  "payment": {
    "scheme": "exact",
    "asset": "USDC",
    "amount": "0.001",
    "destination": "GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ"
  },
  "provider": { "name": "Proveedor sintético" },
  "tags": ["example", "report"]
}
```

Todos los campos mostrados pertenecen a la ficha mínima actual, incluidos `version`, `routeTemplate`, `provider` y `tags`. `url` es el origen HTTPS y `routeTemplate` su ruta. `id` usa minúsculas, números y guiones. Las entradas admiten `string`, `number` o `boolean`; el importe es una cadena decimal positiva con hasta siete decimales. La ficha usa el nombre `USDC` en `payment.asset`; consulta capacidades y condiciones del servicio para comprobar su contrato exacto antes de cualquier pago. Este ejemplo no amplía activos ni sustituye una comprobación de integración.

Envía el objeto completo en `{"card": ...}` a `validate_service_card`. Un catálogo vacío no impide preparar una ficha. Si la validación devuelve `schema.shape`, revisa primero estos campos y tipos; no envíes una solicitud inválida. Documenta también los límites y recuperación de la entrega, aunque el esquema mínimo no los exija.

## 3. Conserva un paquete para revisión

Guarda el manifest, el resultado de validación, una muestra identificada, las pruebas de funcionamiento realizadas y los puntos pendientes. Incluye el hostname exacto del endpoint y el método de control que puedes preparar: DNS TXT o HTTP `.well-known`. Informa «preparado para revisión», nunca «publicado» por haber validado.

Opcional, solo con una copia de este repositorio, dependencias instaladas y Node.js 22.18 o posterior: ejecuta `node scripts/prepare-provider-review.mjs ruta/mi-service-card.json ruta/paquete-nuevo`. El primer archivo debe ser una ServiceCard completa, no el borrador editorial ni la configuración inicial del CLI. El directorio de salida no debe existir. Se generan `service-card.json`, `review-packet.json` con hash SHA-256 canónico y `REVIEW.md`. El comando valida localmente y no realiza solicitudes de red, pagos ni publicación; control, revisión e indexación siguen pendientes. Sin el repositorio, conserva los mismos datos y evidencias manualmente.

La recepción permanece deshabilitada por defecto. El candidato admite archivos para pruebas locales o Redis compartido para una futura habilitación controlada. La existencia de ese código no indica que el entorno público esté habilitado. Consulta `get_bazaar_capabilities.providerOnboarding`; no presupongas disponibilidad por ver el formulario. Durante una prueba local usa exclusivamente el origen localhost que te entregue el operador, también para guía y MCP; no mezcles esta versión con la web pública.

Antes de enviar, genera un UUID v4 `submissionId` y 32 bytes aleatorios expresados como 64 caracteres hexadecimales `submissionToken`. Conserva ambos junto a la ficha exacta y el método de control en un archivo privado fuera del repositorio. No imprimas el token en chats ni logs. El formulario técnico permite preparar y guardar ese acceso antes del envío; no lo persiste en el navegador.

Envía `POST /api/provider-self-listing`, `Content-Type: application/json`, con `Authorization: Bearer SUBMISSION_TOKEN` y cuerpo `{"submissionId":"UUID_GUARDADO", "card": TU_MANIFEST_JSON, "controlProof": {"method": "dns-txt", "domain": "HOSTNAME_EXACTO"}}`. También admite `http-well-known`. El acceso es específico de esta solicitud: permite reenviar exactamente los mismos datos y consultar su estado, nunca revisar, aprobar ni publicar. No es una clave administrativa o de wallet.

Si devuelve `INTAKE_DISABLED`, conserva el paquete. No existe aquí un canal público de contacto o alta alternativo documentado: hace falta que el operador proporcione un canal y confirme disponibilidad. No inventes un contacto ni pruebes otros endpoints para evitar el bloqueo.

Si devuelve `202`, conserva `submissionId`, `expiresAt` y el challenge completo. El backend configurado conserva la solicitud (archivos en el piloto local, Redis en el modo compartido); recibirla no es aprobación ni certificación de respaldo o durabilidad. La prueba tiene caducidad de 24 horas. Para DNS TXT, publica `control.expectedRecord` en el hostname exacto `control.domain`. Para HTTP, sirve exactamente ese texto, sin redirecciones ni contenido adicional, en `https://{control.domain}{control.verificationPath}`. El verificador usa HTTPS:443 e IPv4 públicas, con límites de tiempo y tamaño; direcciones privadas, IPv6 y destinos mixtos se rechazan. Coordina la comprobación con el operador: emitir o alojar el challenge no significa que esté verificado.

Consulta `GET /api/provider-self-listing/{submissionId}` en el mismo origen con el mismo `Authorization: Bearer SUBMISSION_TOKEN`. No pongas el token en la URL. Un identificador por sí solo no concede acceso; los identificadores de la antigua cola en memoria no se recuperan ni se reasignan automáticamente.

Ante respuesta perdida, consulta el mismo identificador. Un reenvío debe conservar ficha, dominio, método, identificador y token; no crees otra solicitud automáticamente. Datos distintos con el mismo identificador producen conflicto. Al recibir un rechazo, lee los motivos, conserva esa decisión y prepara expresamente una nueva solicitud corregida: no sobrescribas la revisión anterior. Una cola llena o un almacenamiento inaccesible requiere intervención del operador.

No hay una operación pública que ejecute la verificación o revisión. El recorrido es `awaiting-control-proof → pending-manual-review → approved-for-staging → staged-not-public → activation-pending → activated`. Hasta `activated` no se afirma publicación. `activation-uncertain` requiere que el operador reconcilie el mismo intento contra el registro; nunca otro alta automática. El operador verifica y revisa mediante la CLI local o la sesión protegida de /admin cuando esté configurada; tu token no permite esas operaciones.

## 4. Publicación administrativa separada

La incorporación al catálogo requiere una acción del operador con controles y almacenamiento durable configurados. `/api/publisher/ingest` no es autopublicación: nunca solicites ni uses su secreto compartido de operador. El MCP no ofrece escritura del registro. No crees cuentas ni solicites credenciales para sortear este límite.

Antes de afirmar que está publicado, el operador debe confirmar el alta y debe comprobarse que discovery devuelve la ficha aceptada. Estar en discovery no certifica seguridad, disponibilidad ni una compra completada. Resume siempre qué está listo, qué se comprobó y qué depende del operador.

Para comprobar el alta, consulta `list_services`, `search_services` y `get_service` por el identificador aceptado. La alternativa HTTP pública es `GET /api/discovery/resources` en el mismo origen; contrasta la ficha en `results` por su `id`, endpoint y condiciones. Si informa disponibilidad parcial o error del registro, conserva esa limitación. No confundas aparición en discovery con disponibilidad de pago.

## Ejemplo MCP desde el repositorio

Con Node 22.18+ y npm ci, prepara fuera del repositorio un directorio privado nuevo:

```sh
node examples/agent-provider-mcp.mjs prepare /ruta/privada/nueva https://bazaar.browns.studio servicio.json dns-txt api.tudominio.com
# Revisa y autoriza las condiciones antes de enviar:
node examples/agent-provider-mcp.mjs submit /ruta/privada/nueva
node examples/agent-provider-mcp.mjs status /ruta/privada/nueva
```

request.json contiene el token y las condiciones congeladas: no lo compartas. accepted-receipt.json conserva el primer comprobante exitoso sin sobrescribirlo; responses/ conserva consultas y errores posteriores. Ante respuesta incierta, status consulta el mismo intento; `node examples/agent-provider-mcp.mjs retry /ruta/privada/nueva` reenvía explícitamente el mismo paquete. No hay reintentos automáticos. Un error conserva http.status y http.retryAfter cuando corresponda: respeta ese tiempo y los límites del entorno; no anuncies éxito si el servidor está inaccesible o cerrado. Para HTTP .well-known sustituye dns-txt por http-well-known. En Windows usa una ruta privada absoluta. No uses esta URL pública en pruebas sintéticas: usa un localhost explícito. No configures credenciales administrativas, del espacio o de historial como acceso de solicitud. El espacio privado opcional se prepara siguiendo /WORKSPACE_AGENT.md, en una conexión distinta.
