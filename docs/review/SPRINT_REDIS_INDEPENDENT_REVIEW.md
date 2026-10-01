# Revisión independiente del sprint Bazaar abierto

Fecha: 2026-10-01. Revisor independiente en checkout exclusivo `sprint-review`.
Estado: aceptación local reproducida; Redis real bloqueado. No se declara cerrado el GOAL.

## Identificación y método

- Base ejecutada: `61bcb685f6e359e8f756c5226399d3a6bc8202fa` (código candidato `c92e084`).
- Node usado en todas las ejecuciones: `v22.18.0`, ejecutable existente `C:/Users/MGC/AppData/Local/Temp/bazaar-node22-review/node.exe`.
- Next `16.3.1` con `dev --webpack`; SDK MCP instalado `1.30.0`, SDK Upstash existente.
- Origen independiente: `http://127.0.0.1:3347`. Backend file, prefijo `bazaar-workspace:local-test`, directorio sintético nuevo `C:/Users/MGC/AppData/Local/Temp/bazaar-sprint-review-file-20261001`.
- Entorno servidor construido con allowlist de variables OS. `BAZAAR_ENABLE_OPEN_WORKSPACES=true`; pagos pilot/legacy/local-payer, activación y mutaciones de catálogo en `false`. Sin credenciales Redis/S3/wallet ni archivos `.env`.
- `sprint-review` no tenía dependencias ni build. El operador enlazó las dependencias existentes; no se instaló ningún paquete. Se inició un servidor Next propio y no se reutilizó el build histórico.
- Antes de la primera reproducción leí únicamente el texto solicitado, AGENTS.md, el plan, `OPEN_BAZAAR_LOCAL_CANDIDATE.md`, `WORKSPACE_AGENT.md`, requisitos/configuración de ejemplo y esquemas públicos. Usé el helper indicado por la guía sin leer su implementación ni las suites del autor. La revisión de implementación y pruebas existentes ocurrió después.
- Paquetes de acceso, intenciones, respuestas y comprobantes permanecen en directorios privados fuera del checkout. El informe no contiene secretos.

## Local: Next, HTTP y cliente MCP reales con file aislado

Ejecuté el helper tal como lo describe la guía: preparar accesos antes del alta, crear A/B, escribir por HTTP como humano, listar/reclamar/responder por MCP como agente, registrar operación/actividad inline y recuperar.

Resultados reproducidos:

1. Descubrimiento público sin acceso: 17 herramientas, skills y OpenAPI. Espacios habilitados comprobados.
2. Dos propietarios nuevos distintos. Tres altas simultáneas idénticas de A devolvieron su mismo espacio; cambiar el hash con la misma intención produjo conflicto.
3. Mensaje humano estable reenviado: un mensaje y una tarea. Cambiar el contenido manteniendo IDs produjo 409. Agente no crea conversación humana; humano/recuperación no consultan tareas de agente; B/recuperación no leen conversación A.
4. Helper conserva intento y respuesta antes de enviar. Reenvíos idénticos de claim/respond/operation/activity confirmados.
5. Lectura observada: dos mensajes (uno humano, uno agente), una tarea, una operación inline gratuita/simulada. La consulta MCP de historial y su JSON se conservaron privadamente.
6. Detuve y reinicié realmente Next con mismo backend/prefijo/origen. Conversación, mensajes, tarea y operación coincidieron íntegramente con el JSON previo; no se regeneró el ejemplo.
7. Rotación humana invalidó acceso anterior y conservó agente/datos/owner; rotación agente invalidó acceso anterior y conservó humano/datos/owner.
8. Revocación rechazó ambos roles y `create` original no restauró acceso. Tras otro reinicio, siguió revocado y B no recibió IDs/registros de A.

Comandos de revisión conservados en `scripts/review-sprint-server.mjs`, `scripts/review-sprint-local.mjs` y `scripts/review-sprint-handoff.mjs`. Son la transcripción ejecutada: fijan origen y directorios de esta evidencia, que ya existen. No son un alta nueva lista para ejecutar; para otra reproducción deben usarse directorios nuevos conforme a la guía y nunca sobrescribir esta intención. Usé el ejecutable Node 22 indicado:

```text
node examples/agent-workspace-mcp.mjs prepare PRIVATE_A http://127.0.0.1:3347
node scripts/review-sprint-server.mjs
node examples/agent-workspace-mcp.mjs create PRIVATE_A
node scripts/review-sprint-local.mjs journey
[detener/reiniciar servidor sin cambiar su configuración]
node scripts/review-sprint-local.mjs restart
[detener/reiniciar servidor sin cambiar su configuración]
node scripts/review-sprint-local.mjs revoked-restart
```

Contadores propios por fase:

| Fase | HTTP directos | callTool | comandos helper | HTTP efectivo de clientes MCP propios |
|---|---:|---:|---:|---:|
| journey inicial | 10 | 11 | 13 | No medido completamente |
| restart | 5 | 5 | 6 | 11 |
| revoked-restart | 1 | 2 | 1 | 8 |

Los comandos helper implican inicialización/notifications/listado/GET/llamada adicionales. Estos contadores locales no equivalen a todo el tráfico HTTP del servidor. La primera ejecución dejó el SDK con opciones por defecto y observó GET automáticos; se corrigió el runner del revisor para deshabilitar reconexiones y contar su fetch efectivo. No atribuyo un límite global ni un conteo Redis real a esa ejecución inicial.

## Hallazgos y correcciones revisadas

**Guía de respuesta:** ejecutar secuencialmente los pasos 2 y 3 originales instruía responder dos veces con contenido diferente para una tarea. El segundo `respond` falló; la primera respuesta ya estaba congelada. El parche de `WORKSPACE_AGENT.md` explicita texto solo como final alternativo y entrega como una única respuesta vinculada después del registro confirmado. La respuesta/payload se conserva antes del primer registro.

**MCP automático:** el helper original dejaba reconexión por defecto del SDK. El GET SSE de Next termina y el SDK reconecta mientras sigue abierto; un EOF exitoso reinicia su contador. El parche `examples/private-mcp-client.mjs` fija `maxRetries:0`. Leí y ejecuté su prueba con SDK real y servidor loopback: GET SSE 1, POST perdido 1, reconexiones 0 después de 1,7 s. Sin peticiones externas.

**Texto ampliado:** el coordinador encontró overflow real en navegación desktop y filtros mobile. Revisé el parche CSS de `styles/ui.css` y `app/history/history.css`: wrapping, ancho mínimo cero y controles limitados a su contenedor. Se aplica a Navbar/ActivityDashboard reales. La aprobación visual final requiere el build exacto y la repetición del navegador.

**Runner navegador:** revisé su código. El cambio de texto mide tamaño calculado ×2, verifica URL/storage, bloqueo con teclado, borrador/reentrada, comparación tras reinicio y red acotada. La fuente final exige build provenance con HEAD y BUILD_ID coincidentes antes del arranque. El probe tardío mantiene explícitamente un GET vivo pese al AbortSignal, espera fulfill, requestfinished y dos animation frames y solo entonces comprueba bloqueo; la perturbación queda declarada en su informe. También compara el JSON original inline y la etiqueta Simulación. Aprobar fuente no sustituye su ejecución visual final; pedí mantener acotadas las esperas Promise del probe.

## Reproducción independiente de la guía corregida

Leí `sprint-product/docs/OPEN_BAZAAR_SYNTHETIC_HANDOFF.md` y ejecuté sus dos bloques de script copiándolos literalmente a directorios privados nuevos, sin editar el código de muestra. La delegación conserva únicamente `agent.json`; el agente no recibe raíz, acceso humano o secreto de recuperación.

```text
node scripts/review-sprint-handoff.mjs PATH_TO_CORRECTED_HANDOFF journey
[detener/reiniciar el servidor de revisión]
node scripts/review-sprint-handoff.mjs PATH_TO_CORRECTED_HANDOFF restart
```

Resultado: 19 comandos de journey y uno de comprobación después del reinicio. `freeze` generó el payload una vez y su repetición verificó los mismos bytes sin generar otra respuesta/ID. Repetí envío humano, operación, actividad y respuesta: un mensaje humano, una respuesta agente y una operación vinculada. Tras reinicio, el bloque `verify` confirmó igualdad del JSON conservado, sin volver a ejecutar el ejemplo. Esta reproducción utilizó la guía corregida contra el código base file; la integración final debe señalar su SHA.

## Local con dobles: fallos y contención

Después de la reproducción inicial leí los límites y mecanismos de las suites existentes, verifiqué que usan dobles/loopback y las ejecuté con entorno OS allowlist, Node 22.18:

```text
node scripts/test-open-workspace-core.mjs
node --experimental-strip-types scripts/test-open-workspace-redis-contention.mjs
node scripts/test-private-workspace-chat-lifecycle.mjs
node scripts/test-private-mcp-no-reconnect.mjs   [sprint-product corregido]
```

Todas pasaron. Core reportó tres procesos HTTP file/reinicio, contención/lock acotado, generación/rotación/tombstone, corrupción cerrada, pérdida de acuse recuperable, scopes/límites y ausencia de fallback/cargas externas. Redis REST con SDK/doble reportó seis altas simultáneas: 201 una, 200 cinco; un commit de creación y cinco CAS0. Cuota: seis incrementos, máximo ocho intentos tras CAS0 confirmado. Pérdida de acuse de alta/cuota y resultado desconocido no repiten la mutación; agotamiento devuelve 503 y revalida auth.

El lifecycle de UI usó dobles de hooks/fetch: reapertura misma pestaña, sustitución de propietario, cancelación, borrador retirado y aislamiento de respuesta tardía. No es prueba de navegador. Ningún fallo inducido se aplicó a Redis externo ni a datos históricos.

## Ejecutor Redis: preparación y dobles aprobados

Leí el primer guard, worker HTTP y ejecutor de `sprint-redis`. Es un host HTTP de prueba que importa handlers nativos y usa transport MCP/SDK reales; declara que no valida Next/configuredWorkspaceStore de producción.

Contabilidad contrastada con Lua canónico: lectura EVAL+GET×3 = 4 comandos; commit con documento = 7, solo registry = 6; CAS0 confirmado = 4. Acuse incierto conserva reserva máxima y detiene sin retry. Cinco claves planificadas, sin SCAN/KEYS/FLUSH/DEL, dos owners congelados por fábrica de prueba y accesos hash separados.

El corte final corregido conserva ACL privada Windows, digest de fuentes relevantes/HEAD/runtime/Lua, payloads congelados antes de efectos y respuesta vinculada única, reservas simultáneas de respuesta HTTP, documentBytes no negativos y limitación de arrays/contenidos al escenario sintético. Rechaza un plan alterado o ejecución sobre otro HEAD/source digest/runtime. Congela incluso el intento contradictorio de la prueba negativa antes del primer efecto.

Identifiqué que `req.setTimeout(5000)` limitaba inactividad y un stream lento podía superar el plazo total; la fuente final usa timer absoluto de 5 s y cancela requests HTTPS pendientes al deadline global y al finalizar. Revisé y ejecuté su doble nativo de error HTTP/stream sin final/cancelación: un send y un destroy, timeout entre 4,9 y 6,5 s, bytes de error contados y ningún retry. La credencial real se exige explícita; autorización debe nombrar hash de plan, digest de fuente, origen, referencia humana y margen gratuito confirmado suficiente.

La prueba independiente propia `scripts/review-sprint-redis-guard.mjs` pasó 11 gates con comandos sintéticos y dobles de transporte: claves/script ajenos, prohibición de mutar `owner:none`, requests/comandos/body/respuesta agotados rechazados antes de enviar, documentBytes negativo rechazado, pérdida de acuse con un solo send y detención permanente, CAS0 contado como cuatro comandos y reserva concurrente de respuestas que impide otro envío fuera del presupuesto.

También leí y ejecuté `node --experimental-strip-types scripts/test-open-workspace-redis-budget.mjs` en `sprint-redis`; pasó los gates de autorización, límites, timeout/cancelación, prefijo aislado local, prohibición de fábrica de propietario en producción y SDK Upstash sin retries. El entorno allowlist necesitó excepción Git `safe.directory` aplicada solo al proceso y al checkout verificado, sin cambiar configuración global. La primera ejecución sin esa excepción quedó bloqueada antes de cualquier Redis y no cuenta como aprobada.

Después preparé un plan nuevo propio y ejecuté el recorrido completo contra un Redis REST doble:

```text
node scripts/run-open-workspace-redis-isolated.mjs prepare PRIVATE_REDIS_REVIEW
node scripts/run-open-workspace-redis-isolated.mjs double PRIVATE_REDIS_REVIEW/plan.json
```

Fuente observada: HEAD base `61bcb685f6e359e8f756c5226399d3a6bc8202fa` más parche final revisado, digest `882fa96dacaeac9137e155d2535ccb99196e236207240068d6ae1c5b3c56f182`. Plan hash `14a064c5f30f8a6d15130f284973fae84cd092badcef983a491aa84e90c05e1e`; prefijo `bazaar-workspace:isolated-0ff07c331ba98ebfbb83046c45baee91`. Son identificadores sintéticos; ningún secreto se incorpora al informe.

Resultado independiente inicial `ok:true`: dos propietarios; altas simultáneas 201/200 e idempotencia; cliente MCP real/17 herramientas; humano, agente, recuperación y ámbito proveedor separados; una respuesta vinculada, tarea, operación y comprobante; rotación y revocación conservadas con cuatro procesos HTTP y dos reinicios; mismos registros recuperados sin reejecución. Contabilidad efectiva: 167 requests Redis, 764 comandos (167 EVAL + 597 internos Lua), 390464 bytes body enviados y 405982 recibidos, un CAS0 y 44 commits. Transporte aplicación: 58 requests, 7318 bytes enviados y 31844 recibidos. Cero incertidumbres, rechazos de guard o peticiones externas; 2698 ms observados. Bytes TCP/TLS/cabeceras excluidos expresamente.

Último delta Windows revisado antes de integrar: el helper ACL preserva `SystemDrive` y `ProgramData` en su subproceso PowerShell; el ejecutor propaga ambas variables OS al worker. La verificación no añade credenciales ni altera permisos requeridos. Mi gate directo preparó un directorio privado nuevo, verificó ACL dos veces y comprobó que no creó un directorio literal `%SystemDrive%` en el checkout de revisión. No se borraron los artefactos antiguos identificados por el autor. Mis launchers y la suite canónica conservan esas variables OS; la suite canónica también fija reconexiones MCP a cero. Node 22 `--check` pasó el patch de la suite.

Repetí únicamente preparación privada y recorrido con doble afectados: fuente final digest `b78fa9b38afdddf4764c95140ce56b5fa66985ba1f7c20cbc5f01fb221cfc38d`, plan hash `49a1029f9eb9b69851001a94e62b07ad1c7e71729c13b204c9aa17a03bd9aa88`, prefijo `bazaar-workspace:isolated-4f819be9ce4fa32cf5ac3168233dae80`. Pasó de nuevo: 167 requests Redis/764 comandos/390464 bytes enviados/405893 recibidos; aplicación 58 requests/7318 bytes enviados/31844 recibidos; cuatro procesos, dos reinicios, 44 commits, un CAS0, cero incertidumbres/rechazos/efectos externos; 2531 ms. Conservé privadamente ese JSON; el archivo público `docs/evidence/sprint-review/redis-double.json` fue actualizado posteriormente con la ejecución sobre el SHA final integrado. Los archivos privados de todas las preparaciones permanecen fuera del repositorio.

Esta aprobación permite integrar la preparación revisada. Un nuevo commit o modificación de fuente exige regenerar el plan/fingerprint y el expediente exacto; no transfiero el hash de este plan a otro candidato. No se ejecutó la rama `real` ni se creó un archivo de autorización real.

La ejecución conserva la limitación explícita: **host HTTP de prueba + handlers/SDK reales + Redis REST doble**. No es Next nativo/configuredWorkspaceStore con Redis real ni Magic Link sobre Redis; tampoco demuestra respaldos o pérdida de Redis. El navegador real sigue al coordinador con build final exacto.

## Candidato integrado y aceptación sobre build

Revisé la integración `4d2ba93ef7ea955aebfd7fb695abc13ac681b48d` frente a la base: 16 archivos, todos correspondientes a las fuentes/parches revisados. Build provenance observado: Node 22.18.0, Next 16.3.1 Webpack, BUILD_ID `hpqETEnZVMxDG8MvFirgG`, SHA coincidente; compilación y tipos reportados aprobados por el coordinador. Ejecuté desde `mission-consolidation`, con OS allowlist (incluido SystemDrive/ProgramData) y Git safe.directory solo del proceso:

```text
node scripts/test-open-bazaar-independent.mjs
```

La suite completa sobre ese build terminó exit 0: Next HTTP construido + cliente MCP real, file sintético compartido por dos procesos y reinicio; discovery/scopes/owners/concurrencia/chat/tarea/respuesta/operación/recuperación/rotación/generación/revocación. Corrupción, journal incompleto, lock persistente y acuses inciertos se probaron en entornos sintéticos/dobles y fallaron cerrados. Recepción de proveedor en file propio mantuvo scopes y recibo inmutable, sin activación. La cuenta legacy era generada sintéticamente por la suite; no se leyeron cuentas históricas del humano. External requests/payments/production writes: cero. EvidenceDirectory propio `C:/Users/MGC/AppData/Local/Temp/bazaar-independent-open-Yoid22`; origen del helper conservado `http://127.0.0.1:54255`. La suite no expone un conteo global de HTTP entre sus procesos/helpers: no se infiere.

También pasaron guard propio 11 gates y budget/timeout/cancelación sobre `4d2ba93`. Preparación nueva y doble: digest `2f6544e751482654f649705d36cf744fae66e016b2202aaeb6eee300176f9902`, plan `8343fb75517f6357feab625993a8c3ba69361bdcb4df2a160b457693852ec0a1`; 167/764 Redis, 58 HTTP, cuatro procesos/dos reinicios, 2628 ms, cero efectos externos.

El candidato final de fuente es `6c60391d271a57b04ec8621470237c9ca2f522e2`. Revisé sus cuatro deltas respecto a `4d2ba93`: documentación precisa de **Sin pago** en la entrega principal y **Simulación/Fixture de prueba** al abrir detalles técnicos, probe que verifica ese badge visible y vuelve a cerrarlo, y ProgramData en el entorno del test de handoff. No cambian app/lib/estilos respecto al candidato anterior. La limitación UX se conserva explícita: no se certifica una etiqueta de simulación prominente en la entrega principal.

Sobre `6c60391` pasaron de nuevo mis 11 gates de guard y un plan/doble nuevos: digest `fa93557cae8929ca369c1b2c4462ec821aa247d517c6623755d9eb7fcb47268c`, plan `d8db46e70a8b04fb51c45da831108469a998187c560882410ac8eeb7fd94c83c`, prefijo `bazaar-workspace:isolated-cf2706d9d0cb76714c30a5c98a9c97bb`. Resultado final JSON `docs/evidence/sprint-review/redis-double.json`: 167 requests/764 comandos Redis, 390464 bytes enviados/405893 recibidos; aplicación 58 requests, 7318 bytes enviados/31844 recibidos; cuatro procesos, dos reinicios, un CAS0, 44 commits, 5095 ms; cero incertidumbres/rechazos/efectos externos.

Build provenance final leído: `6c60391…52e2`, BUILD_ID `WxPu0FGeFg7y3k_ufOvHy`, Node 22.18.0, Webpack exit 0. Ejecuté de nuevo la suite canónica completa, sin modificar fuentes ni reconstruir durante su ejecución. Terminó exit 0 con todos los gates anteriores aprobados y cero peticiones externas, pagos y escrituras de producción. EvidenceDirectory propio `C:/Users/MGC/AppData/Local/Temp/bazaar-independent-open-EQdqps`; origen observado del helper `http://127.0.0.1:63687`. `docs/evidence/sprint-review/canonical-built.json` conserva los resultados redactados de ambos SHA, comando/runtime/build y límites de la evidencia. No se midió ni se infirió el total de requests HTTP de esa suite; el conteo completo 58 HTTP/167 requests Redis/764 comandos pertenece únicamente al ejecutor con doble separado.

Leí el reporte final del navegador ejecutado por el coordinador y revisé independientemente sus ocho capturas: chat e historial, viewport 390×844 y 1366×768, texto normal y tamaño calculado ×2. El reporte vincula el mismo SHA/BUILD_ID, Chromium 153.0.8010.12 y origen `http://127.0.0.1:56792`; cuatro casos ampliados miden ratio mínimo/máximo 2/2, sin rectángulos de control fuera del viewport ni errores runtime/peticiones externas. Las capturas permiten ver navegación y filtros contenidos, mensaje/entrega sintéticos y **Sin pago**. La comprobación de **Simulación** abrió y cerró los detalles técnicos: la etiqueta no se presenta como prominente en la vista principal. El probe tardío declara su eliminación puntual de AbortSignal y reporta respuesta entregada después del bloqueo sin reabrir contenido. La igualdad de registros tras reinicio, URL/storage, teclado/borrador/reentrada y JSON original son assertions del ejecutor revisado y ejecutado por el coordinador, no deducciones de las imágenes. La aprobación permanece limitada a viewport emulado y ampliación calculada; no cubre dispositivo físico, zoom nativo, todos los paneles técnicos abiertos al 200 % ni WCAG completo.

También contrasté `handoff-integrated.json` y `final-verification.json`: SHA/build/runtime, origen file loopback y categorías coinciden. Handoff conserva 23 comandos y 78 HTTP de comandos, seis readiness y una verificación (85 intentos), con un registro fallido local definido y su mismo reenvío guardado, una respuesta/operación tras reinicio y cero peticiones externas/modelos/pagos. Ese fallo fue ejecutado por el coordinador con el gate literal revisado; mi reproducción independiente inicial no indujo ese fallo. Los máximos del manifiesto coinciden con `DEFAULT_BUDGET`, y el conteo Redis final proviene de mi doble separado. Build/tipos y gate adicional de recepción pendiente de proveedor son resultados del coordinador; la suite canónica propia también verifica aislamiento de proveedor. El manuscrito conserva correctamente Redis real y Next/Magic Link con ese backend como pendientes.

La revisión independiente aprueba las fuentes integradas y la aceptación local sobre el build exacto `6c60391`, incluida preparación Redis acotada, recorrido con doble y la correspondencia documental/visual observada. Redis real continúa bloqueado; la aprobación local no cierra el GOAL.

## Redis real y pendientes

**Bloqueado, no aprobado:** el humano confirmó que no dispone de instancia ni margen gratuito confirmado. No se creó infraestructura ni se abrió una conexión Redis/S3 externa. No hubo pagos, proveedor/modelo, cuentas/claves históricas, push, merge ni deploy.

Para desbloquear: instancia explícita dedicada/permitida, prefijo nuevo y cinco claves exactas, plan/hash/SHA revisados, margen gratuito suficiente y autorización humana específica para máximos request/comando/bytes/tiempo/CAS. Destructivos e incertidumbre seguirán solo en dobles. Una ejecución por host de prueba seguiría siendo categoría distinta de Next nativo con Redis y Magic Link navegador real.

Esta revisión local demuestra persistencia entre procesos en el entorno observado. No prueba Redis real, respaldo, pérdida/restauración Redis, dispositivo físico, desarrollador remoto, publicación ni durabilidad certificada.
