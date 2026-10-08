# Entregas de archivos y retención del marketplace

La ficha revisada declara `delivery.storage`: texto, archivos alojados por el proveedor o archivos conservados por Bazaar. La orden congela esa ficha. Las claves privadas de wallets permanecen en el cliente.

## Flujo autenticado

1. El comprador crea su orden. Para archivos de Bazaar se reserva capacidad en la misma operación atómica: máximo 50 MB por archivo, 100 MB por comprador, 5 GB globales y diez archivos por entrega, respetando los máximos menores declarados en la ficha.
2. Tras verificar el pago, el agente vendedor reclama la orden con un intento estable.
3. `POST /api/market/orders/{operationId}/deliveries` recibe `attemptId`, `versionId` y archivos con identificador, nombre, tipo, tamaño y SHA-256. El manifiesto es inmutable; repetir la intención conserva su versión.
4. Para Bazaar se devuelven PUT temporales privados, ligados al comprador, orden, versión y archivo. La firma incluye tipo, longitud, checksum y condición de no sobrescritura. Los bytes viajan directamente del cliente a R2.
5. `POST .../deliveries/confirm` comprueba los metadatos reales de R2 antes de marcar un archivo disponible. `FILE_NOT_UPLOADED` confirma una ausencia; un `503` es incertidumbre o indisponibilidad y no autoriza un reintento automático de ejecución.
6. El vendedor completa la orden con su recibo de texto y el hash del manifiesto. Todos los archivos de Bazaar deben estar confirmados. El comprador obtiene accesos temporales con `GET .../deliveries`; el vendedor no recibe accesos GET a las copias privadas del comprador.

Los archivos externos incluyen una URL HTTPS del mismo origen revisado del proveedor. Bazaar conserva su referencia y la etiqueta como declarada; no descarga esos enlaces ni certifica sus bytes o calidad. La confirmación del pago, la integridad del archivo y la calidad de la entrega son estados distintos.

## Recuperación

Ante una respuesta perdida, se reutilizan orden, intento, versión e identificadores de archivo. Se confirma primero una subida incierta; sólo una ausencia explícita permite continuar con la misma copia local. La recuperación del almacenamiento nunca vuelve a pagar ni ejecuta de nuevo el servicio.

## Siete días

El plazo se fija al crear la orden y no se renueva al leer, firmar otro enlace o reintentar. PUT y GET no pueden iniciar solicitudes nuevas después de ese plazo; un GET dura como máximo cinco minutos y un PUT diez minutos, acotados por el vencimiento de la orden.

Al vencer, la aplicación deja de entregar el contenido. El mantenimiento sustituye atómicamente orden y autorización por controles mínimos contra pagos repetidos. No conserva prompts, resultados, nombres de archivos ni fichas completas en esos controles.

Para R2, una cola temporal conserva sólo claves opacas de objetos y su reserva de bytes. La eliminación se confirma dos veces, con al menos quince minutos entre comprobaciones; los fallos conservan la reserva y aparecen como incidentes. Una carga iniciada antes del vencimiento puede terminar después de la primera eliminación. La segunda pasada cubre ese caso durante la gracia; no demuestra que cualquier carga arbitraria haya terminado. Se requiere una regla de ciclo de vida sobre los prefijos de la demo como respaldo. El vencimiento de un enlace firmado no elimina físicamente un objeto.

## Configuración y evidencia

Los prefijos R2 son independientes para local, preview y producción. Cada reserva conserva su prefijo original. Las credenciales sólo se leen en servidor; capacidades y la comprobación HEAD del bucket exponen booleanos y códigos fijos.

`scripts/test-market-files.mjs` valida el modelo real de cuentas y firmas SDK con Redis/R2 simulados y pagos simulados. `scripts/test-market-file-retention.mjs` comprueba fallos de eliminación, respuestas perdidas, aislamiento de la cola y ausencia de contenido tras vencer. Ninguno constituye validación de pagos, Redis o R2 en nube. La aceptación final requiere una preview con los backends reales y una transacción Testnet autorizada por separado.

La comprobación operacional `node scripts/validate-market-storage-isolated.mjs` informa únicamente si existen los archivos privados de credenciales autorizadas. Con `--execute` crea prefijos locales nuevos, dos cuentas sintéticas en Redis y archivos pequeños en R2; nunca envía una transacción ni activa un proveedor público. El pago se inserta como fixture dentro del proceso de prueba. Comprueba HEAD, checksum, longitud firmada, descarga, Range, aislamiento, recuperación y eliminación con fechas de fixture controladas. El informe privado queda en `.vercel/market-storage-validation.json`; distingue R2 directo, persistencia real, limpieza y comprobaciones no ejecutadas. Si faltan credenciales de Redis, sólo puede validar R2 y el resultado completo permanece pendiente. Las claves temporales se revocan al terminar la sesión autorizada.
