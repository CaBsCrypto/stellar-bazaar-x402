# Entregas interactivas privadas

El panel `/history` abre cada compra en Resultado, con Actividad del agente y Pago y comprobante como pestañas. Los registros anteriores se leen sin migración y mantienen su contenido original. `/history/review` contiene cuatro ejemplos públicos y ficticios, incluyendo un MP4 de ocho segundos, dos PNG y subtítulos VTT. No son evidencia de pagos ni de almacenamiento privado operativo.

## Contrato de entrega

`lib/deliverable.ts` define y valida `bazaar.deliverable/v1`: `deliveryId`, `versionId`, `previousVersionId` opcional, `versionLabel`, `title`, `summary`, `content` y `files`. Los tipos de contenido son `script`, `video`, `gallery`, `report` y `other`. Las escenas, clips, variantes, secciones y archivos tienen IDs estables. El proveedor debe conservar esos IDs en revisiones del mismo elemento y usar un `versionId` nuevo. Una versión no se puede modificar; el padre debe existir para el mismo propietario y entrega. No hay comentarios, solicitudes de revisión ni edición.

Cada descriptor de archivo incluye `id`, `name`, `mediaType`, `size` en bytes y `sha256` hexadecimal del archivo completo. Las referencias a archivos y sus familias MIME se validan; no se inventan contenido, fuentes o subtítulos ausentes. El original del manifiesto se puede consultar y descargar. La selección de versión humana se conserva por ID durante las actualizaciones.

## APIs privadas

Todas usan `Authorization: Bearer <token>` y respuestas `private, no-store`. Ninguna acepta un propietario enviado por el cliente: se deriva del token; tarea y agente se derivan de la compra existente.

| Solicitud                             | Permiso          | Cuerpo / consulta                                    |
| ------------------------------------- | ---------------- | ---------------------------------------------------- |
| `GET /api/deliveries?operationId=...` | Lectura humana   | Versiones y límites/bytes reservados del propietario |
| `POST /api/deliveries`                | Escritura agente | `{operationId, manifest}`                            |
| `POST /api/deliveries/uploads`        | Escritura agente | `{versionId, fileId}`                                |
| `POST /api/deliveries/confirm`        | Escritura agente | `{versionId, fileId}`                                |
| `POST /api/deliveries/access`         | Lectura humana   | `{versionId, fileId, download}`                      |

El alta reserva cuota atómicamente en Redis. La carga usa PUT firmado por diez minutos, limitado a clave, tamaño y SHA-256; `If-None-Match: *` evita sobrescribir objetos. Confirmar consulta HEAD y exige tamaño, MIME y checksum coincidentes. Una interrupción deja el archivo pendiente y permite reconciliar la confirmación antes de copiar otra vez. Los GET firmados duran cinco minutos y se renuevan mediante el acceso privado. Cada propietario, versión y archivo tiene una clave S3 distinta. HTML/SVG y otros formatos activos se descargan como adjuntos, sin insertarse como documento ejecutable.

El piloto limita cada archivo a 500 MB decimales y reserva hasta 5 GB por propietario, contando todas las versiones y cargas pendientes. La biblioteca muestra uso y límite; el SDK devuelve `OWNER_STORAGE_LIMIT` cuando no cabe una nueva reserva. Los reintentos de la misma versión no consumen cuota adicional. Hay un máximo defensivo de 1.000 manifiestos por propietario. No se borran entregas confirmadas automáticamente. Las reservas pendientes tampoco se liberan automáticamente: su gestión administrativa queda pendiente y debe reconciliar los objetos antes de liberar cuota.

## Configuración del servicio

Se mantienen `BAZAAR_HISTORY_ACCOUNTS_JSON` y Redis privado. Añadir únicamente en el servidor:

```
BAZAAR_S3_BUCKET=...
BAZAAR_S3_REGION=...
BAZAAR_S3_ENDPOINT=...
BAZAAR_S3_ACCESS_KEY_ID=...
BAZAAR_S3_SECRET_ACCESS_KEY=...
```

Para AWS S3, omitir ENDPOINT. Para otro servicio, usar endpoint HTTPS compatible con SigV4, PUT condicional, SHA-256 de carga y HEAD con ChecksumMode ENABLED. Si no confirma el checksum, la entrega permanece pendiente: no se reduce la comprobación de integridad. Las claves deben tener permiso limitado a GetObject/PutObject sobre el prefijo privado `deliveries/v1/`; mantener bloqueo de acceso público y ningún ciclo de vida que elimine entregas confirmadas. Respaldar Redis junto con los objetos. Esta fase no crea el bucket ni cambia permisos de servicios existentes.

Configurar CORS de ese bucket con los orígenes exactos del panel: GET y HEAD, headers Range/If-Range y exponer Content-Length/Content-Range/Accept-Ranges/ETag. La carga del comprador se ejecuta en Node, no en el navegador. Si otro cliente necesita cargar desde navegador, añadir PUT y permitir Content-Type, If-None-Match y x-amz-checksum-sha256. No usar el bucket como sitio público. El proveedor debe ofrecer archivos desde su mismo origen; el SDK rechaza redirecciones y enlaces a otros orígenes.

Las URLs firmadas son accesos temporales: bloquear el panel desmonta los visores, aborta consultas y retira contenido de la página, pero no revoca una URL ya emitida ni un archivo ya descargado. No registrarlas en analítica ni en el emulador WebMCP. El funcionamiento y caducidad se basan en la [documentación oficial de S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).

## Cliente comprador

Activar `history.preserveFiles: true` en `BazaarAgentClient`, junto con los parámetros privados existentes. El proveedor puede incluir en la respuesta de compra:

```js
{ bazaarDelivery: { manifest, sources: [{ fileId: 'clip-1', url: 'https://proveedor.example/archivo.mp4' }] } }
```

Después de registrar la operación, el SDK reserva y copia esos archivos por streaming, con tamaño acotado; S3 valida el SHA-256. El resultado `library` indica `stored`, `partial` o `failed`, `versionId`, `failedFiles` y, para fallos de alta, un código `error`. Guardar `clientOperationId` y el paquete entregado para poder reintentar sin comprar otra vez:

```js
import { preserveDeliverable } from "./lib/deliverable-client.ts";
const library = await preserveDeliverable({
  baseUrl,
  writeToken,
  operationId: originalClientOperationId,
  providerOrigin: originalServiceUrl,
  delivery: originalDeliveryBundle,
});
```

Este método no firma, paga ni vuelve a ejecutar el servicio. Un fallo de almacenamiento no cambia el éxito del pago. Un fallo al registrar la compra requiere reconciliar primero su historial con el mismo ID; no repetir `executeService`. MCP/WebMCP de descubrimiento no puede observar ni copiar por sí solo compras externas. Los agentes externos usan este cliente o el mismo flujo privado HTTP; no deben enviar archivos privados o URLs firmadas al registro público del emulador.

## Comprobaciones

`npm run test:deliverables` valida contrato, aislamiento, límites, versiones, firmas y visores con dobles de Redis/S3 y prueba el límite de integración del comprador sin repetir ejecución. `npm run test:activity:redis` ejercita Redis real en Docker cuando esté disponible. `npm run build` valida compilación. La prueba real de S3 debe verificar carga, HEAD, reproducción con Range/CORS, enlace caducado, interrupción y nueva versión en un bucket privado de prueba. La compra Testnet sigue siendo una validación distinta.
