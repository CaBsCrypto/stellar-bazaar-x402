# Piloto local de solicitudes y revisión

## Contrato y autorización

Se conservan POST `/api/provider-self-listing` y GET `/api/provider-self-listing/{id}`. El piloto persistente exige un UUID v4 creado por el cliente y un token aleatorio de 32 bytes guardados **antes** del envío. POST recibe `submissionId` en JSON y el token en `Authorization: Bearer`; GET requiere el mismo encabezado. Nunca se usa el token en URLs. El servidor almacena únicamente su hash y no hay registro de usuario.

Una solicitud fija ficha y condiciones. Reenviar el mismo identificador, token y contenido es idempotente; cambiar contenido produce 409. Un acceso incorrecto o desconocido no expone ficha ni estado. El token no permite verificar, revisar ni activar servicios. Un rechazo conserva sus razones; una corrección requiere una solicitud nueva explícita y mantiene la original.

El operador tiene acceso al directorio privado del servidor y ejecuta la CLI offline. Esta autoridad proviene del acceso administrativo al host y a su configuración, no del campo `operator`, que solo identifica al responsable en la evidencia. No hay endpoint público de administración. El proveedor nunca recibe `BAZAAR_PROVIDER_SECRET`.

## Configuración local

- `BAZAAR_ENABLE_SELF_LISTING_INTAKE=true`.
- `BAZAAR_PROVIDER_REVIEW_DIR`: directorio absoluto de prueba fuera del repositorio, con permisos de acceso limitados por el operador.
- Servidor enlazado únicamente a `127.0.0.1`; los handlers rechazan origen no local y el backend rechaza Vercel. No hay fallback a memoria.
- No cargar credenciales Redis, wallets ni facilitador para los tests. El almacenamiento del registro público se sustituye por un adaptador sintético en la prueba integral.

La antigua cola temporal no se migra. Los registros se conservan sin TTL de borrado, con un máximo de 100 solicitudes retenidas y 32 KiB por envío. Los archivos no constituyen un backend aprobado para despliegue distribuido. Windows requiere verificar permisos efectivos del directorio: el parámetro POSIX `mode` no acredita por sí solo una ACL privada.

## Operación explícita

Desde el repositorio con dependencias instaladas y Node 22.18+:

```text
node scripts/provider-review-operator.mjs --review-dir ABSOLUTE_PATH inspect SUBMISSION_UUID
node scripts/provider-review-operator.mjs --review-dir ABSOLUTE_PATH verify-dns SUBMISSION_UUID
node scripts/provider-review-operator.mjs --review-dir ABSOLUTE_PATH verify-http SUBMISSION_UUID
node scripts/provider-review-operator.mjs --review-dir ABSOLUTE_PATH review SUBMISSION_UUID --operator OPERATOR_ID --decision approve --reason "Motivo concreto"
node scripts/provider-review-operator.mjs --review-dir ABSOLUTE_PATH stage SUBMISSION_UUID
```

Usar solo el verificador correspondiente al método solicitado. DNS y HTTPS consultan la red únicamente al invocar explícitamente esa operación. Las pruebas automatizadas usan resolutores/transporte dobles, no un dominio real. HTTPS no sigue redirecciones, fija la IP pública resuelta y valida el certificado del hostname; rechaza destinos privados o mixtos y actualmente IPv6. La prueba queda vinculada a ficha, challenge, origen y fecha.

La aprobación manual no activa. `activate` usa la operación administrativa existente `createService`, con sus controles de configuración y secreto server-side. No ejecutar ese comando contra Redis real en este bloque. La aceptación integral inyecta únicamente su almacenamiento de registro sintético, conservando validación e ingestión reales.

Antes del efecto se escribe un marcador de activación. `recover` solo lee el registro y finaliza si coinciden ID, contenido y hash; no vuelve a ingerir. Tanto falta de evidencia como registro distinto mantienen la incertidumbre. La biblioteca de compras y sus credenciales no intervienen en este protocolo.

## Fallos y recuperación

`review.lock` se crea exclusivamente para coordinar procesos. No se elimina automáticamente un bloqueo abandonado ni se reinicia un marcador incierto. Ante un proceso caído: detener el piloto, comprobar que ningún proceso usa el directorio, preservar los archivos y revisar la evidencia antes de cualquier intervención administrativa. No borrar `review.json`, restaurar una copia antigua o reenviar con otro identificador como reparación automática.

Un resultado de escritura incierto exige consultar la misma solicitud cuando el almacén vuelva a estar disponible. Datos dañados fallan cerrados. Un reinicio probado acredita persistencia local entre procesos, no resistencia certificada ante pérdida del disco o restauración antigua.

## Validación reproducible sin transferencias

```text
node scripts/test-provider-self-listing.mjs
node scripts/test-provider-review-store.mjs
node scripts/test-provider-review-operator.mjs
node scripts/test-seller-end-to-end.mjs
node scripts/test-provider-review-controls.mjs
node scripts/test-seller-mcp.mjs
```

La prueba integral utiliza handlers HTTP y cliente MCP reales, dos procesos y reinicios, con DNS y registro aislados sintéticos. No habilita una recepción pública. Antes de publicar hay que elegir y validar almacenamiento compartido, límites de abuso, configuración operativa, canal de revisión y repetición externa del recorrido. No reutilizar una base histórica por el simple hecho de disponer de su credencial.
