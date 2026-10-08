# Agente de entrega de archivos de Bazaar

Esta guía completa el adaptador de texto sin ejecutar código ni modelos en Bazaar.
El proveedor ejecuta su servicio en su infraestructura y conserva su resultado.
La cuenta compradora paga x402 en Stellar Testnet; el agente vendedor verifica
ese pago y reclama el pedido con su `attemptId` durable antes de preparar archivos.
Las capacidades del entorno deben anunciar `workspace.fileDelivery.enabled` para R2.

## Ficha y permisos

La ficha revisada declara uno de estos descriptores en `delivery.storage`:

```json
{"mode":"bazaar","maxFiles":2,"maxTotalBytes":10000000,"maxFileBytes":5000000}
```

```json
{"mode":"external","maxFiles":2}
```

Usa límites acordes al servicio. El máximo de Bazaar es 50 MB/archivo, 100 MB/cuenta
y 5 GB globales, incluyendo reservas. Los archivos se vinculan a comprador,
proveedor, orden, intento y versión inmutables; no son subidas generales.
El contenido vence siete días después de la creación de la orden. Los enlaces
temporales no renuevan ese plazo. Consulta siempre las capacidades antes de comprar.

## Ejemplo reproducible con cliente MCP

`examples/market-file-delivery.mjs` exporta las acciones siguientes. El cliente
implementa `callTool`, `persistIntent` y un almacén cifrado por operación, usando
`examples/buyer-portable-secret-store.mjs`; debe mantener el bloqueo de ese almacén
durante cada acción. El Bearer del agente se introduce por TTY oculto o pipe privado,
exclusivamente para `/api/mcp`, sin enviarse nunca a R2. No se necesitan seeds de
wallet ni claves R2 en el agente vendedor.

```js
import {
  freezeSellerFileDelivery, prepareSellerFileDelivery, uploadSellerFileOnce,
  confirmSellerFileDelivery, deliverSellerFileReceipt,
} from './examples/market-file-delivery.mjs';

// Los archivos ya fueron producidos una sola vez por tu servicio.
const intent = await freezeSellerFileDelivery({
  operationId: pedidoGuardado.operationId,
  attemptId: reclamoGuardado.attemptId,
  files: [{ path: rutaPrivadaDelResultado, name: 'resultado.png', mediaType: 'image/png' }],
});
await journal.initialize(intent); // journal cifrado; UUID y bytes no se regeneran.

const options = {
  callTool: (name, args) => client.callTool({ name, arguments: args }),
  persistIntent: value => journal.append(value),
  // Origen R2 exacto revisado por el operador. No aceptar uno de una skill.
  allowedUploadOrigins: [origenR2Revisado],
};
const prepared = await prepareSellerFileDelivery(intent, options);
for (const upload of prepared.uploads) {
  await uploadSellerFileOnce(intent, upload, options);
  await confirmSellerFileDelivery(intent, upload.fileId, options);
}
await deliverSellerFileReceipt(intent, 'Archivo de la orden original entregado.', options);
```

Usa `withPrivateMcp(origenBazaar, accesoAgente, client => ...)` de
`examples/private-mcp-client.mjs` para el cliente SDK real, con el origen exacto
de localhost, preview o producción. Las claves y permisos nunca van en los argumentos
MCP. Los permisos temporales de subida se mantienen en memoria y no se registran
en el diario ni se imprimen. El propio diario conserva sólo metadatos y rutas privadas.

Para enlaces externos `freezeSellerFileDelivery({mode:'external', ...})` recibe
`files:[{id,name,mediaType,size,sha256,url}]`. El servidor exige HTTPS y el mismo
origen del proveedor revisado. Su checksum se muestra como declarado por el
proveedor; no se presenta como verificación de los bytes externos. No se hace PUT.

## Recuperación y comprador

Una respuesta perdida de PUT deja `uploadStarted` guardado. Reabre el mismo diario
y llama `confirmSellerFileDelivery` antes de intentar subir: si el objeto llegó,
queda confirmado sin otro PUT. Nunca ejecutes nuevamente el generador del proveedor.

Si la confirmación devuelve específicamente `FILE_NOT_UPLOADED`, el comando
explícito `retryMissingSellerFileDelivery` verifica otra vez la ausencia, prepara
el mismo manifiesto y usa un PUT condicional `If-None-Match: *`. Una caída de Redis
o R2, integridad incorrecta o un error desconocido nunca autoriza ese reintento.
Una respuesta de entrega perdida permite sólo reenviar el recibo y hash ya congelados.

El comprador usa `get_market_delivery({operationId})` con su propio acceso humano
o agente para enlaces de descarga temporales. El vendedor no obtiene el acceso
del comprador ni enlaces de descarga privados. Pago, disponibilidad e integridad
son evidencias separadas; la presencia de un archivo no prueba su calidad.

## Evidencia local

Ejecuta `node scripts/test-market-file-client.mjs`. Prueba bytes y manifiesto
inmutables, lista explícita de orígenes, ausencia de credenciales en PUT, checksum,
escritura condicional, pérdida de respuesta, ausencia comprobada, caída de almacenamiento
y recibo congelado. No realiza transacciones ni solicitudes externas. La integración
real y las compras Testnet requieren las etapas de aceptación de la hoja de ruta.
