# Informe real de una página · piloto local

El proveedor `website-intelligence-provider` admite `POST /v1/audits` con `{ "mode": "live", "url": "https://example.com/", "language": "es" }`. Sin `mode` o con `fixture`, conserva el comportamiento anterior. El modo real usa español por defecto. La ruta pagada rechaza `live` antes de cualquier pago; la ficha comercial y MCP siguen describiendo únicamente el servicio fixture. No se ha publicado este cambio.

La respuesta real usa `schemaVersion: "1.1"`, `mode: "live"`, URL solicitada/final, fecha, hallazgos con evidencia, puntuación orientativa, limitaciones y hash del HTML decodificado. El contrato fixture 1.0 permanece disponible. El panel conserva el original y presenta el alcance y las cinco comprobaciones de HTML; no ejecuta contenido del proveedor.

## Ejecutar y recuperar

Prerequisito: piloto privado anterior configurado, con Redis y sus accesos separados. Desde el proveedor compilado, iniciar `node work/build/src/server.js` con `PORT=8788`. Desde Bazaar, iniciar `node scripts/website-report-pilot.mjs serve` para el panel privado en 3214.

Desde Bazaar:

```text
node scripts/website-live-report.mjs analyze https://example.com/
node scripts/website-live-report.mjs store https://example.com/
node scripts/website-live-report.mjs verify https://example.com/
```

`analyze` conserva una instantánea por URL normalizada bajo `work/private-live-reports`, con IDs durables y bloqueo entre procesos. Una respuesta ya recibida se reutiliza; no se vuelve a consultar el proveedor. `store` solo registra la copia local y `verify` solo lee la biblioteca. No hay importación de firmante ni ejecución del endpoint de compra. El destinatario existente se conserva como metadato requerido por el historial; importe cero, estado `not-requested` y ninguna transacción. `mode: mock` identifica el recorrido sin pago, mientras `originalResult.mode: live` identifica el contenido real.

Solo se permiten servicios de loopback en operaciones mock de importe cero y sin pago solicitado. Los archivos externos siguen requiriendo HTTPS. La consulta pública fija la dirección DNS validada al abrir la conexión, comprueba todas las respuestas DNS y cada redirección, bloquea rangos especiales y solo permite puertos estándar. Máximo tres redirecciones, diez segundos incluyendo DNS y 2 MB de HTML. No envía cookies ni credenciales; rechaza compresión y formatos distintos de text/html. Interpreta el charset HTTP o UTF-8; no ejecuta JavaScript ni carga subrecursos.

Un error de consulta se registra como error de actividad y no crea una entrega. Tras una interrupción abrupta, solo se libera un bloqueo si el sistema confirma que el proceso murió. Los informes confirmados no se borran ni se sustituyen para actualizar una demostración.

## Comprobaciones

Proveedor: `npm run check`. Bazaar: `node scripts/test-live-report.mjs`, `npm run test:website-report`, `npm run test:deliverables`, `npm run test:activity`, `npm run build`.

La validación real de example.com guardó la operación `website-live-b9979cea-1507-4add-a613-441f2f5a6fa5` con cinco eventos y una entrega original. La lectura desde otro proceso y el rechazo de otro propietario pasaron. El informe anterior y su transacción Testnet se recuperaron sin cambios. Esta evidencia demuestra una consulta web y almacenamiento reales, no una nueva compra.

También pasaron ocho reintentos concurrentes por almacén en propietarios aislados de Redis real. `store` funcionó con el proveedor detenido. En navegador, bloquear retiró el informe; tras reiniciar el servidor y volver a introducir el acceso de lectura, reapareció la entrega original en Resultado, marcada «Sin pago · validación local».

Publicación, habilitación de compras de informes reales, S3, adjuntos y análisis con IA permanecen para etapas posteriores.
