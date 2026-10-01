# Redis aislado: ejecutor preparado, aceptación real pendiente

Fecha: 2026-10-01. Base del especialista: `61bcb685f6e359e8f756c5226399d3a6bc8202fa`.
La evidencia incluye cambios locales identificados por su digest; no representa
un candidato integrado/publicado ni una autorización para una instancia futura.

En la validación anterior no había instancia ni margen gratuito verificados.
En el nuevo sprint del 2026-10-01 se comprobó en la consola autenticada la base
dedicada `bazaar-validacion-20261001`, AWS `us-east-1`, Free Tier, coste $0.00,
0/500.000 comandos, 0 B/10 GB de tráfico y 0 B/256 MB de almacenamiento.
Eviction está desactivado y no hay regiones de lectura adicionales.
Su credencial dedicada quedó fuera del repositorio con ACL exclusiva; no se
reutilizaron credenciales históricas. La inspección no envió comandos Redis.
La evidencia actual está en `evidence/sprint-native-redis-real/provider-preflight.json`.
El nuevo ejecutor `run-open-workspace-redis-native.mjs` añade Next construido,
`configuredWorkspaceStore` de producción y un ledger compartido para navegador,
MCP, assets, errores y reinicios. Su aceptación real sigue pendiente de un plan
nuevo revisado y autorización específica antes de cualquier escritura.

Durante la validación anterior no se consultó ni escribió Redis externo, no se abrió ningún `.env`, no se usaron
claves/cuentas históricas y no se creó infraestructura. El modo real permanece
pendiente de instancia explícita, aislamiento, margen cero coste y autorización
humana específica del plan congelado.

## Arquitectura y límite de evidencia

Un relay HTTP en `127.0.0.1` centraliza la allowlist y todos los presupuestos.
Dos procesos Node independientes llaman los handlers nativos de espacios, chat,
historial, actividad y entregas. El servidor MCP canónico y el SDK MCP instalado
recorren Streamable HTTP. El SDK Upstash instalado envía EVAL al relay con
`retry: { retries: 0 }`, `automaticDeserialization: false` y auto-pipelining apagado.
El modo externo, todavía sin ejecutar, reenvía cada petición mediante HTTPS
nativo: una solicitud, sin redirect/retry/refresco de autenticación; timeout
absoluto de 5 s y cancelación de todos los requests al vencer el límite global.

La fábrica Redis acepta un asignador de owner UUID exclusivamente en
`NODE_ENV=test`, sin Vercel; su valor por defecto sigue siendo `randomUUID()`.
El asignador del runner vincula dos intenciones guardadas a dos IDs asignados por
el servidor. Un cliente sigue sin poder enviar `ownerId`. Esto permite congelar
las cinco claves exactas antes del primer efecto. Las revisiones y los IDs de
espacio/agente conservan su generación normal.

**Es un host HTTP de prueba con handlers reales; no es un servidor Next nativo
ni ejercita `configuredWorkspaceStore` en producción.** La aceptación de Next
con Redis real y el Magic Link en navegador permanecen pendientes. La prueba
local demuestra reinicios de procesos de la aplicación conservando el mismo
doble REST; no demuestra persistencia de Redis externo, respaldos ni durabilidad
tras perder Redis.

El producto admite ahora `bazaar-workspace:isolated-<32 hex minúsculos>`.
La configuración exige un origen loopback, rechaza Vercel, y los handlers
aplican la misma validación estricta de Host/Origin/autoridad que el backend de
archivos. Los prefijos `local-test`, `preview` y `production` mantienen su contrato.

## Plan congelado y máximos

`prepare` guarda primero IDs, secretos sintéticos separados y todos los cuerpos
de mensaje, intento, respuesta, operación y comprobante. La carpeta privada se
crea fuera del checkout y verifica ACL exclusiva del operador en Windows
(permisos 0700 en Unix). El plan público contiene hashes, no secretos utilizables.
Nunca se crea un tercer propietario ni se amplía dinámicamente la allowlist.

Las claves exactas son `registry`, `initialized`, `owner:none` y los dos
`owner:ow_...` del plan, dentro de un prefijo nuevo y su hash tag. `owner:none`
solo puede leerse. Los únicos scripts permitidos son READ y COMMIT canónicos,
con tres KEYS y cero/cinco ARGV exactos. No hay SCAN, KEYS, DEL, FLUSH, expiración,
limpieza, cargas externas, pagos ni activación de proveedores.

| Recurso | Máximo por ejecución |
|---|---:|
| Solicitudes REST Redis, incluidas las lecturas de ausencia y CAS | 400 |
| Comandos Redis: EVAL más todos los GET/SET internos | 2.400 |
| Cuerpos JSON enviados a Redis | 16.777.216 bytes |
| Cuerpos JSON recibidos de Redis | 33.554.432 bytes |
| Cuerpo por solicitud/respuesta Redis | 65.536 bytes |
| Registry / cada documento de propietario | 16.384 / 16.384 bytes |
| Valor almacenado total, incluidos dos docs y marcador | 49.164 bytes |
| Propietarios | 2 |
| Solicitudes HTTP/MCP de aplicación | 120 |
| Cuerpos enviados/recibidos de aplicación | 1.048.576 / 2.097.152 bytes |
| Duración total / request HTTPS remoto | 120 s / 5 s absolutos |
| Intentos CAS de cuota / reintentos de transporte | 8 / 0 |

La reserva máxima se aplica **antes** de invocar el transporte, incluida la
reserva de respuesta concurrente. READ consume 4 comandos (EVAL + GET×3); COMMIT
consume hasta 7 (EVAL + GET×3 + SET×3), o 6 sin cambio del documento. Un CAS0
confirmado ajusta el conteo a 4 porque no hubo SET. La cuota puede hacer ocho
pares read/commit; esos intentos comparten los máximos globales y no permiten
eludirlos. Un acuse incierto conserva la reserva máxima, detiene el relay y no
repite ningún efecto. La recuperación requiere una decisión explícita; este
runner no inicia otra ejecución sobre un prefijo existente.

Los bytes miden cuerpos HTTP JSON UTF-8 a nivel de transporte, incluidas las
respuestas de error observadas. Excluyen headers, framing TCP/TLS y overhead
interno de Redis. El almacenamiento contado excluye bytes de las claves y
overhead del servidor. No se presenta como medición de memoria facturada total.
Al recibir un chunk que supera el máximo, se cuenta lo recibido y se corta;
no se puede deshacer tráfico ya recibido ni afirmar que un servidor defectuoso
jamás envió ese chunk. Toda incertidumbre queda identificada.

## Reproducción local

Runtime verificado: Node **22.18.0** existente en
`C:\Users\MGC\AppData\Local\Temp\bazaar-node22-review\node.exe`.
SDK MCP 1.30.0 y Upstash existentes; no se instaló un paquete.

Desde el checkout que se vaya a revisar, sin `.env`, usando el Node 22 existente:

```powershell
& $node22 --experimental-strip-types scripts/test-open-workspace-redis-budget.mjs
& $node22 --experimental-strip-types scripts/test-open-workspace-redis-contention.mjs
& $node22 --experimental-strip-types scripts/test-open-workspace-core.mjs
& $node22 scripts/run-open-workspace-redis-isolated.mjs prepare $newPrivateDirectory
& $node22 scripts/run-open-workspace-redis-isolated.mjs double "$newPrivateDirectory\plan.json"
```

`$newPrivateDirectory` debe ser nuevo, fuera del checkout, con su carpeta padre
existente; nunca apunta a datos históricos. Los outputs privados no se versionan.
No se ejecutan suites antiguas de Redis real por analogía.

`execute` verifica digest del plan, HEAD exacto, runtime exacto y digest de
lib/app/components/styles/public/scripts/examples/package+lock, además de los
scripts nuevos y del helper ACL importado. Un cambio de fuente o HEAD invalida
el plan. **Después de integrar y cerrar los commits de evidencia, preparar un
plan nuevo para el HEAD final.** Un plan de esta revisión no autoriza otro SHA.

## Evidencia aprobada localmente

El plan y reporte redactados del último recorrido del especialista se conservan
en `review/OPEN_BAZAAR_REDIS_PREPARATION_PLAN.json` y
`review/OPEN_BAZAAR_REDIS_PREPARATION_RESULT.json`. La fixture de secretos queda
solo en la carpeta privada ACL. El fingerprint de esa ejecución es
`b78fa9b38afdddf4764c95140ce56b5fa66985ba1f7c20cbc5f01fb221cfc38d`.

| Comprobación | Resultado local con dobles |
|---|---|
| Recorrido HTTP y SDK MCP real | 167 requests Redis; 764 comandos: 167 EVAL y 597 GET/SET; 44 commits, un CAS0; 58 requests HTTP/MCP; 4 procesos con 2 reinicios |
| Datos de Redis observados | 390.464 bytes enviados y 405.982 recibidos, cuerpos JSON |
| Datos HTTP/MCP observados | 7.318 bytes enviados y 31.844 recibidos, cuerpos JSON |
| Identidad/persistencia | Dos propietarios; creación concurrente única; reenvío inmutable; scopes distintos; otro propietario denegado; rotación/revocación sobreviven reinicio |
| Chat/entrega | Mensajes exactos, tarea, intento, única respuesta enlazada con operationId, operación inline y comprobante recuperados sin reejecutar |
| Guard | Rechaza claves/scripts/IDs/payloads ajenos antes del send, límites globales y por request, reservas concurrentes, bytes negativos, falta de autorización/margen; timeout absoluto y cancelación global |
| SDK/CAS | Cero retries de transporte; CAS confirmado acotado a ocho intentos; acuse perdido no repite creación/cuota; resultado incierto falla cerrado |
| Daño o indisponibilidad | Core y contention con dobles: corrupción, acuse perdido, CAS agotado y bloqueo persistente no producen falso éxito |

Cero solicitudes externas, pagos, invocaciones de proveedores, push, merge,
deploy o limpieza de Redis. Las ejecuciones iniciales de depuración fallidas
no cuentan como aprobadas; solo se cita el recorrido final y los gates pasados.

Se preservó, sin leer contenido ni integrar, un artefacto local `%SystemDrive%`
con tres DB de caché de Windows. Su aparición coincidió con el gate ACL y se
atribuye al entorno reducido del helper de PowerShell, que omitía SystemDrive
y ProgramData. El helper ahora conserva esas dos variables del sistema; no
incorpora credenciales. El artefacto queda fuera del patch y del candidato.

## Condición para habilitar el modo real

Primero se revisan el candidato integrado, el plan nuevo, instancia concreta,
allowlist y máximos. El humano debe confirmar margen gratuito de requests,
comandos y datos suficiente para **todos** esos máximos. La existencia pública
de un plan gratuito no verifica el uso ni margen de una cuenta.

Una autorización concreta se registra con `planHash`, `sourceFingerprint`,
`redisOrigin`, `humanAuthorized: true`, `zeroCostConfirmed: true`, referencia del
mensaje humano y `confirmedFreeMargin` para redisRequests/redisCommands/
requestBytes/responseBytes. No contiene el token Redis. Las únicas variables de
conexión admitidas por el runner real son
`BAZAAR_ISOLATED_REDIS_REST_URL` y `BAZAAR_ISOLATED_REDIS_REST_TOKEN`, suministradas
explícitamente para la instancia revisada; no hay aliases ni lectura de `.env`.
El comando requiere además el hash exacto del plan como último argumento.

No se incluye un comando listo para ejecutar real en este expediente porque
faltan esas condiciones. El resultado del sprint y la publicación permanecen
pendientes. Los fallos destructivos continúan exclusivamente con dobles.
