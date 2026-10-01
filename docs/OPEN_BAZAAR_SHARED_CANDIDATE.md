# Bazaar abierto — candidato para validación compartida

Fecha: 2026-10-01, America/Santiago. Este expediente prepara una revisión de
publicación separada. **Sprint sin cerrar: Redis real sigue bloqueado.**

## Identificación y alcance

Base preservada: `61bcb685f6e359e8f756c5226399d3a6bc8202fa`, rama
`mission/open-bazaar-local`; código previo `c92e084430065ae76a152a39570e3ab1727b521d`.
Código integrado y probado: `6c60391d271a57b04ec8621470237c9ca2f522e2`.
Build Next 16.3.1 webpack: `WxPu0FGeFg7y3k_ufOvHy`; runtime Node **22.18.0**.
Los commits posteriores de expediente solo añaden documentación y evidencia;
el código servido y revisado queda identificado por ese SHA y BUILD_ID.
El tablero único está en [SPRINT_REDIS_BOARD.md](SPRINT_REDIS_BOARD.md).

El usuario confirmó que aún no hay instancia Redis ni margen gratuito confirmado.
No se abrió, consultó ni modificó una instancia. Cero escrituras Redis externas,
compras, modelos/proveedores alojados, transferencias, faucets, push, merge o deploy.
No se cargaron `.env`, firmantes ni accesos históricos. Las dependencias existentes
y Node **22.18.0** se reutilizaron sin instalar paquetes.

## Cambios revisados

- Guía: una tarea recibe una única respuesta definitiva. Para una entrega, el
  agente conserva los archivos privados de respuesta/operación antes del registro,
  registra la entrega y responde una sola vez con su referencia. Si falla el
  registro, reenvía únicamente el mismo JSON e identificador conservados: no
  regenera respuesta/entrega ni envía `respond` hasta confirmar el registro.
- Paquete copiable del humano y agente: UUID/intención conservados, `agent.json`
  como único acceso delegado, y comparación exacta de conversación/entrega tras
  reinicio. No ejecuta un modelo ni un servicio.
- Cliente MCP: reconexión automática desactivada; la recuperación usa una orden
  explícita contra la intención conservada. El test pierde un POST y cierra SSE
  exitosamente; mantener la conexión abierta no emite nuevos requests.
- Interfaz: navegación con líneas que envuelven y filtros dentro de su ancho
  disponible. La revisión inicial midió texto x2 y reprodujo los desbordes; las
  capturas normales anteriores no se usan para aprobar texto ampliado.
- Ejecutor Redis: preparación separada del efecto, prefijo sintético nuevo,
  propietarios/claves congelados, allowlist EVAL y presupuestos globales. Su host
  HTTP de prueba y la inyección de IDs se declaran expresamente.

## Evidencia por categoría

| Categoría | Estado | Evidencia / límite |
|---|---|---|
| Local con dobles | Aprobado en el SHA de código | Guard propio independiente y recorrido acotado; 167 requests Redis, 764 comandos EVAL/Lua, 58 HTTP/MCP, cuatro procesos y dos reinicios |
| HTTP/MCP real + file aislado | Aprobado; canonical final reproducido independientemente | Dos propietarios, una conversación/respuesta/operación tras reinicio; scopes, rotación/revocación; reenvío de registro fallido conservando los mismos bytes |
| Navegador Chromium real | Aprobado en el SHA de código | Ocho casos: 390×844 y 1366×768, texto x2 medido, cero desbordes; teclado, bloqueo/reentrada y respuesta tardía |
| Redis real aislado | **Bloqueado** | Sin instancia, margen gratuito ni autorización específica |
| Next nativo + Redis real | **Pendiente** | No sustituir por el host HTTP instrumentado |
| Navegador/Magic Link + Redis real | **Pendiente** | El navegador con file no valida este backend |
| Dispositivo físico | Pendiente, evidencia separada | Chromium emula viewport; no certifica dispositivo real |

La revisión independiente usa checkout separado y reproduce la guía sin intervención
del autor. Registra el conflicto original de dos respuestas y la reconexión SDK
observada; las primeras ejecuciones no cuentan como aceptación del cliente corregido.
El informe final debe nombrar el SHA integrado y los límites de cada evidencia.

El [reporte del navegador](evidence/sprint-redis-browser/report.json) vincula SHA,
BUILD_ID, Chromium **153.0.8010.12**, origen loopback y configuración cerrada.
Las cuatro mediciones ampliadas registran ratio calculado mínimo/máximo **2/2**;
todas conservan el ancho del viewport y cero rectángulos de controles fuera de él.
El probe declara que retira el AbortSignal de un GET de prueba para entregar una
respuesta después del bloqueo: confirma que la generación anterior no reabre la vista.
El token desaparece de la URL y no aparece en storage, el borrador se retira y los JSON coinciden tras
reiniciar Next. Las capturas muestran la entrega inline y **Sin pago**; **Simulación**
se comprobó abriendo y cerrando los detalles técnicos. No se afirma que esa etiqueta
sea prominente en la vista principal ni que todos los paneles técnicos se capturaran
abiertos al 200 %. Son viewports emulados y texto ampliado, sin certificación de
dispositivo físico, zoom nativo o WCAG completo.

El [handoff integrado](evidence/sprint-product/handoff-integrated.json) pasó con
23 comandos, 78 HTTP de comandos, seis readiness y una verificación: **85 intentos
HTTP efectivos**. Conservó una respuesta/entrega y reenvió exclusivamente el registro
guardado después de un fallo local confirmado antes de escritura. El gate de proveedor
con Next construido mantuvo recepción cerrada, solicitudes pendientes privadas y fuera
del catálogo. No hay conteo global de wire en ese gate; no se infiere uno.

Comandos, límites y resultados finales se recogen en
[final-verification.json](evidence/sprint-review/final-verification.json) y en la
[revisión independiente](review/SPRINT_REDIS_INDEPENDENT_REVIEW.md). La preparación
detallada está en [OPEN_BAZAAR_REDIS_PREPARATION.md](OPEN_BAZAAR_REDIS_PREPARATION.md).

## Redis: propuesta que requiere autorización futura

El plan preparado será público y sin tokens. Los tokens y cuerpos de intentos
quedan en directorio privado nuevo, fuera del repositorio. Antes de un efecto real
se requiere confirmar instancia REST, credencial nueva dedicada, gratuidad/margen
actual y aprobación del hash del plan, executor y límites. Una ausencia o error
de configuración produce bloqueo, nunca éxito.

El prefijo aislado reserva cinco claves exactas: registro, marcador,
`owner:none` (solo lectura) y dos documentos de propietarios nuevos. Solo EVAL
de los dos scripts canónicos está permitido. Se comprueba ausencia en esas claves
sin SCAN/KEYS; no se borran claves, no hay TTL ni limpieza externa. El presupuesto
cuenta EVAL y cada GET/SET Lua, incluidos rechazos CAS; un resultado desconocido
mantiene la reserva máxima y detiene el ejecutor. El SDK Redis tiene retries 0,
auto-pipelining apagado y el cliente MCP reconexión 0. Los máximos y conteos exactos
se adjuntan al plan/reporte, incluidos intentos CAS de cuota (hasta 8).

La tarifa pública del proveedor no demuestra el saldo de una cuenta ni autoriza
gastos. La [página oficial de precios Redis](https://upstash.com/pricing/redis)
se consultó el 2026-10-01; la autorización exige comprobar el plan y margen de la
instancia concreta. No se crea una base ni se cambia/contrata un plan desde este sprint.

## Manifiesto propuesto de actualización

| Campo | Propuesta / gate |
|---|---|
| Código | `6c60391d271a57b04ec8621470237c9ca2f522e2`; revisar de nuevo cualquier delta de fuente |
| Origen/dominio | `NEXT_PUBLIC_APP_URL` con HTTPS exacto todavía pendiente; nunca heredar loopback de evidencia |
| Espacios | `BAZAAR_ENABLE_OPEN_WORKSPACES=true` solo tras autorización de publicación |
| Backend | `BAZAAR_WORKSPACE_BACKEND=redis`; sin fallback file |
| Prefijo público | `BAZAAR_WORKSPACE_PREFIX=bazaar-workspace:preview` o `bazaar-workspace:production`, exclusivo y aprobado |
| Acceso Redis | `BAZAAR_WORKSPACE_REDIS_REST_URL/TOKEN`, privados; valores fuera del manifiesto |
| Pagos | `X402_PILOT_PAYMENTS_ENABLED=false`, `X402_LEGACY_PAYMENTS_ENABLED=false`, `X402_ENABLE_LOCAL_PAYER=false` |
| Mutaciones catálogo | `BAZAAR_ENABLE_PROVIDER_ACTIVATION=false`, `BAZAAR_ENABLE_REGISTRY_MUTATIONS=false` |
| Recepción proveedores | `BAZAAR_ENABLE_SELF_LISTING_INTAKE=false` y `BAZAAR_ENABLE_PUBLIC_PROVIDER_REVIEW=false` en las pruebas; habilitación/publicación se revisa aparte |
| Metadatos sociales | Resolver advertencia `metadataBase` con el origen HTTPS antes de publicación |
| Credenciales delegado | Solo acceso agente; humano/recuperación se conservan con el propietario |

No contiene secretos ni ejecuta configuración externa. No se publica este manifiesto.
Las solicitudes pendientes permanecen fuera del catálogo.

El plan Redis de aceptación local quedó consumido por un doble, nunca por un servicio.
Sus hashes identifican esa ejecución, no autorizan una escritura futura. HEAD y digest
de fuente se verifican al ejecutar: después de cerrar los commits del expediente debe
prepararse un plan nuevo para el HEAD final, en una carpeta privada nueva. La instancia
y el margen de ese plan seguirán sin confirmar hasta que el humano los aporte.

## Reversión y cierre

Revertir con `BAZAAR_ENABLE_OPEN_WORKSPACES=false` y
`BAZAAR_ENABLE_SELF_LISTING_INTAKE=false`, manteniendo el backend Redis, hashes,
entregas, solicitudes y tombstones. No borrar datos, volver a inferir propietario
ni restaurar credenciales antiguas. Ante efecto incierto: detener nuevos efectos,
conservar el intento y recuperar/reconciliar explícitamente. Una copia antigua
requiere reconciliación; el recorrido no certifica respaldos o pérdida de Redis.

Para cerrar: autorizar y ejecutar Redis real con los límites congelados, completar
reproducción independiente sobre ese mismo candidato y el recorrido nativo de
Magic Link con ese backend. Solo después se presenta la publicación concreta para
una decisión separada. La prueba remota posterior sigue siendo otro hito.
