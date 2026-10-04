# Revisión independiente previa a efectos USDC

Fecha: 2026-10-04. Revisor: `review_usdc_hosted`. Revisión local de liquidación y runners; este revisor no implementó la liquidación, no leyó secretos/DPAPI y no ejecutó provisión, pagos, cambios Vercel ni solicitudes externas.

Dictamen del código: **PASS condicional para preparar y ejecutar los pasos acotados de Preview después de cerrar sus puertas de evidencia**. No queda un fallo de código bloqueante identificado en el alcance revisado. Esto no acredita una venta hospedada ni permite abrir producción: siguen pendientes SHA/despliegues reales, prueba HTTPS, contadores hospedados, fondos, recorrido, navegador y Freighter humano.

## Validación ejecutada

Con Node 22.18.0, todos estos controles dieron PASS sin red externa:

- `test-marketplace.mjs`: dos envíos de doble; identidad Circle testnet exacta, SAC derivado, rechazo de otras redes/emisores/activos/destinos/importes/memo, firmas criptográficas y umbral, autorización/capacidad de trustlines, responsabilidades, reservas y comisión. Historial XLM anterior conserva lectura/hash sin migración. Pérdida de respuesta mantiene intención y exige conciliación sin reenviar la transacción.
- `test-usdc-wallet-provision.mjs`: siete GET Horizon, dos Friendbot, dos trustlines y una reclamación USDC con desafío aparte, contra dobles. Se comprueban recibos mínimos oficiales, fondos en dirección/emisor exactos, intenciones previas y parada ante respuesta perdida. No se publican semillas ni XDR en el reporte.
- `test-usdc-acceptance-meter.mjs`: topes antes de escrituras de cada namespace, claves y valores, catálogo previsto, transporte parcial/incierto, scopes API/SSR y credencial de protección sólo al hostname autorizado. Otros hosts y nombres parecidos no la reciben; redirecciones se rechazan.
- `test-protected-preview-client.mjs`: origen fijo, cuerpo y bearer por stdin, credencial Vercel sólo en entorno del hijo, ninguna credencial en argv, cero redirecciones y cero reintentos.
- `test-sale-effect-lock.mjs`: efectos concurrentes rechazados y bloqueo incierto conservado.
- `test-usdc-hosted-control-contract.mjs`: tres recibos públicos reales anteriores de CLI se pasan por el parser puro actual. CLI devuelve `{status, deployment:{id,url,...}}`; la protección de ese recibo está en `deploymentProtection`. Se prueba el hash de bytes crudos del código, distinto del JSON de un Buffer. Cero lectura de secretos.
- `test-automation-preview-client.mjs`: una llamada fetch por intento, cero procesos auxiliares, credencial de automatización sólo al origen exacto, sin cookies/redirecciones/reintentos ni secretos en metadatos. El runner hospedado utiliza este transporte directo.
- `test-usdc-provision-global-budget.mjs`: agregado con otros runners y reserva de 1 MiB de respuesta y 12 segundos; agotamiento API/payload/tiempo y evidencia inválida se rechazan antes de llamar fetch, sin registrar una solicitud ficticia.

`usdc-native-local.json`, build `JuUYuA-SG2W_Bt7kYc0fv`, acredita Next nativo, Redis/Horizon de doble, trabajador externo y generador Express real, dos compras locales, recuperación al sustituir proceso y pausa. Sus 39 API, una página, 188 Redis, 590 comandos, 16 intercambios Horizon, un proveedor y una prueba DNS/HTTP son evidencia local. El propio reporte aclara que no movió fondos, no comprobó propiedad HTTPS hospedada, ni midió tráfico estático de navegador.

## Hallazgos comunicados y correcciones verificadas

1. El controlador comparaba `sha256(JSON.stringify(Buffer))` con el SHA256 de bytes crudos del audit. Corregido: el hash acepta Buffer sin serializarlo. El nuevo control de recibos/bytes pasa.
2. El controlador leía el ID del contenedor JSON de CLI, en vez de `result.deployment`. Habría creado un despliegue y fallado antes de guardar su ID. Corregido: extrae y conserva el recibo antes de comprobarlo; el parser reconoce `deploymentProtection`.
3. La provisión carecía de exclusión entre procesos; el runner hospedado leía el packet antes de bloquear. Se añadió un bloqueo común por plan, previo a descifrar, con conservación ante PENDING/UNCERTAIN. La prueba de bloqueo pasa. El controlador Vercel también se está integrando con ese mismo bloqueo.
4. Un JSON parseable posterior a una mutación no basta como recibo. El controlador conserva UNCERTAIN ante comprobación semántica fallida después de intentar una mutación; conservar el ID observado permite lectura explícita, sin repetir el efecto.

## Correcciones finales verificadas en código

Las correcciones comunicadas quedaron implementadas; la revisión final se limitó a esos cambios y a sus pruebas focales:

- `bind-usdc-sale-preflight.mjs local` congela UUID de pausa, SHA final, fingerprint de upload y hash del reporte/build nativo antes de abrir `canDeployPreview`.
- El controlador guarda intenciones con `runtimeFlags`/`buildFlags` exactos y hashes antes de crear cada despliegue. Comprueba esos hashes en metadata v13, además del SHA Git real de Bazaar y fingerprint. Una etiqueta personalizada no sustituye el SHA Git.
- Todos los runners de efectos usan el mismo bloqueo antes de leer DPAPI. El controlador conserva UNCERTAIN después de una mutación cuyo recibo semántico no se confirma.
- El runner reserva por acción `prepare=3`, `pay=5`, `reconcile=1` Horizon y prueba de control=2 DNS/HTTP, más 13,5 segundos y cotas de payload antes de enviar. Añade al agregado los dos checks manuales de protección/reto, sus bytes y su tiempo. Se revisan los totales después de las respuestas.
- La provisión agrega tiempo y API/payloads del runner hospedado y del check HTTPS; reserva su propia llamada y hasta 1 MiB de respuesta antes de cada intento. Su binding ahora incluye el tope API. El envío cuenta sus bytes de salida antes de fetch, también ante respuesta perdida.
- El check HTTPS rechaza reutilizar un intento, registra dos llamadas, comprueba rechazo sin credencial y reto exacto con credencial del origen fijado; dispone de guardia agregada de tiempo/API/bytes. La fase provider sólo abre provisión con esa evidencia positiva vinculada al despliegue/alias.
- La proyección incorpora 55 solicitudes de aplicación, 21 de backend y pruebas de control, 13 de provisión y 20 privadas de navegador: **109/120**. Redis **368/400**, comandos **1790/2400**, persistencia **49152/49164**. Son cotas de preparación, no resultados hospedados. Horizon conserva la cota conservadora de **23/24** para dos compras y siete GET de provisión; evitar inspecciones prescindibles que la consuman.

## Evidencia todavía requerida

Antes de habilitar cada paso real deben existir el SHA y upload auditados del candidato, despliegues READY con configuración vinculada, margen Free fresco y lectura real de contadores conciliada por request ID. La prueba protegida del alias debe dar rechazo sin credencial y el reto exacto con credencial; una instantánea del proyecto o un campo ausente en v13 no bastan.

Todavía se requieren provisión confirmada de las wallets exactas, dos pagos de 0,01 USDC, texto único y fallo declarado separados del pago, sustitución de Vercel con recuperación exacta, pausa compartida, retirada, revocación y preservación de B. El total final debe conciliar API/SSR/navegador/provisión/pruebas sin duplicar. Teclado, móvil, ampliación real al 200 % y Freighter humano son condiciones de apertura; ningún PASS local las sustituye.

Retirada, revocación de A y cierre final se ejecutan sólo después de los recorridos y del navegador, conservando los dos pedidos, comprobantes, entrega, fallo y acceso de B. Ninguna invitación fue enviada por esta revisión.
