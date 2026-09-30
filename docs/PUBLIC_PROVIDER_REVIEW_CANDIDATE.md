# Alta pública controlada — candidato local

Fecha: 2026-09-29. Rama: `mission/identity-pilot`.
Base preservada: `c60ea7f` (piloto) y `8b3dc2e` (instrucciones/evidencia).
Implementación: `69b3dcd` (persistencia) → `e98ebac` (recepción, administración y pruebas).

## Estado y tablero

| Bloque | Responsable / revisión | Estado |
|---|---|---|
| Preservar candidato anterior | Coordinador | Dos commits locales; trabajos anteriores conservados |
| Redis compartido | Especialista persistencia / administración | Implementado; CAS, reinicio y procesos con doble local |
| Sesión y acciones administrativas | Especialista administración / producto | Implementado; autenticación, CSRF, auditoría y recuperación con dobles |
| Recepción y límites | Coordinador / persistencia y administración | Implementado; deshabilitado por defecto |
| Producto | Especialista producto / coordinador | `/admin` separado de `/admin/operations`; pruebas de componente |
| Publicación | Coordinador | Bloqueada hasta revisión de entorno, coste y autorización |

No se hicieron escrituras externas, compras, correos, push, merge ni despliegues. Las pruebas no certifican Redis real, durabilidad, configuración publicada ni un alta de un desarrollador remoto.

## Interfaces y permisos

Se conservan POST `/api/provider-self-listing` y GET `/api/provider-self-listing/{id}`. El proveedor conserva antes de enviar UUID y token aleatorio; el servidor almacena su hash. El token no concede administración. Reenviar condiciones diferentes con el mismo identificador produce conflicto; corregir un rechazo exige conservar la solicitud previa y crear expresamente otra.

Nuevas interfaces: `/api/admin/review-session` (intercambio, consulta y revocación), GET `/api/admin/provider-submissions`, GET/POST `/api/admin/provider-submissions/{id}`. Una credencial OTP del mecanismo administrativo existente se consume una vez; la sesión dura 30 minutos, cookie Secure/HttpOnly/SameSite=Strict, allowlist comprobada en cada solicitud. Las mutaciones exigen origen exacto y CSRF. No se acepta una clave maestra en estas acciones ni se crea alta administrativa pública.

Acciones separadas: verificar DNS/HTTPS → aprobar o rechazar con motivos → preparar → activar → reconciliar. Cada acción conserva intención de auditoría antes de efectos y resultado después. Un error de auditoría final no demuestra que la acción no ocurrió: consultar/reconciliar, nunca repetir activación a ciegas. El registro conserva el marcador incierto.

## Configuración propuesta, sin aplicar

| Variable | Condición |
|---|---|
| `BAZAAR_PROVIDER_REVIEW_BACKEND` | `redis` para despliegue; `file` solo local |
| `BAZAAR_REVIEW_REDIS_REST_URL/TOKEN` | Credenciales dedicadas a la revisión; no fallback a aliases históricos |
| `BAZAAR_REVIEW_PREFIX` | `bazaar-review:local-test`, `bazaar-review:preview` o `bazaar-review:production` |
| `BAZAAR_REVIEW_RATE_SECRET` | Secreto aleatorio de al menos 32 caracteres, exclusivamente servidor |
| `NEXT_PUBLIC_APP_URL` | Origen HTTPS exacto; sin rutas, parámetros o credenciales |
| `BAZAAR_ENABLE_SELF_LISTING_INTAKE` | Habilitación de nuevas solicitudes, independiente de consulta |
| `BAZAAR_ENABLE_PUBLIC_PROVIDER_REVIEW` | Por defecto false; despliegue soportado únicamente tras proxy Vercel |
| `BAZAAR_ENABLE_PROVIDER_REVIEW_ADMIN` | Por defecto false |
| `BAZAAR_ENABLE_PROVIDER_ACTIVATION` | Por defecto false; adicional a los controles existentes del registro |

El envío de enlaces de operador reutiliza allowlist, Redis de OTP y proveedor de correo existentes: revisar su configuración, aislamiento y cuota antes de publicar. El registro público conserva su configuración existente; el prefijo de revisión no aísla por sí mismo el catálogo donde se activan fichas. Confirmar ambos destinos en el expediente de despliegue. No introducir claves de firma. Mantener pagos y compradores reales deshabilitados.

Redis de revisión guarda estado y auditoría sin TTL. Sesiones y contadores sí caducan. CAS no reintenta automáticamente ante respuesta perdida, corrupción o conflicto. No hay fallback a archivos en despliegue. La cola admite 100 solicitudes; el operador debe resolver su gestión antes de una campaña abierta. No hay borrado o archivado automático en este bloque.

Límites: 32 KiB por envío; 60 consultas por minuto por IP/acceso; 10 nuevas intenciones por hora/IP y 50 por día global; 50 acciones administrativas por minuto; 5 peticiones de enlace por 15 minutos/IP/destinatario. Estos límites acotan uso, pero no garantizan coste cero frente a tráfico ilimitado: incluso un rechazo puede consumir una operación Redis. Verificar cuota y protecciones de plataforma antes de habilitar. El proxy Vercel sobrescribe `x-forwarded-for`; servidores arbitrarios no se consideran confiables. Fuente: https://vercel.com/docs/headers/request-headers (consulta 2026-09-29).

## Evidencia reproducible

Windows, Node 24.14.0, sin archivos de entorno ni credenciales externas en los ejecutores. Pruebas ejecutadas sobre la base anterior más el diff local de esta fase; el commit final identifica ese diff.

```powershell
node scripts/test-provider-review-redis.mjs
node scripts/test-provider-review-store.mjs
node scripts/test-provider-self-listing.mjs
node scripts/test-provider-review-operator.mjs
node scripts/test-provider-admin-session.mjs
node scripts/test-provider-review-admin-ui.mjs
node scripts/test-provider-review-limits.mjs
node scripts/test-provider-submission-http.mjs
node scripts/test-public-provider-review.mjs
node scripts/test-seller-end-to-end.mjs
node scripts/test-seller-instructions.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build --webpack
```

Resultados aprobados: procesos concurrentes con doble de Redis, conservación tras reinicio, CAS sin reintentos, respuesta perdida, registros dañados, sesión vencida/revocada, CSRF, acceso ajeno, prueba de control inválida, aprobación prematura, rechazo/corrección, activación incierta y recuperación sin duplicación. El test integrado usa handlers Request/Response reales, no un servidor HTTP desplegado: una creación, 18 eventos de auditoría y cero pagos/llamadas externas. El E2E previo contrasta el registro sintético con discovery y MCP. Los límites se verifican con un equivalente local del script Lua; falta ejecutar Lua en Redis autorizado.

Compilación Webpack y tipos aprobados. Advertencia existente de `metadataBase` sin configurar. Turbopack con dependencias enlazadas queda separado; no se presenta como probado.

Sobre `e98ebac` se repitieron tipos y compilación Webpack satisfactoriamente. Node 22.18.0 también aprobó integración pública y sesión administrativa. La revisión independiente encontró una confirmación de DEL insuficiente al revocar; se corrigió y se probaron respuestas nulas, cadenas y números inesperados.

Navegador real: panel cerrado en 390×844 y 1366×768, sin desbordamiento horizontal del documento. El recorrido autenticado móvil/escritorio queda pendiente: la revisión automática del navegador exigió autorización explícita para abrir el Magic Link sintético en `http://localhost:3255`. Se solicitó al usuario; no se eludió el bloqueo. El ejecutor `scripts/serve-provider-admin-review-ui.mjs` está preparado: proxy local de la UI real en 3254, handlers reales y Redis/DNS/registro ficticios, sin red externa; `--lose-activation-ack` permite revisar reconciliación. No se guardan tokens en este informe. Las pruebas de componente y handlers aprobadas no sustituyen esta comprobación visual autenticada.

## Reversión y puertas de publicación

1. Cerrar intake y activación; conservar consulta y registros. No borrar marcadores ni auditoría.
2. Ante pérdida/restauración del estado, mantener activación detenida y contrastar registro público con evidencia independiente.
3. Revertir código solo a una versión compatible con los registros; un piloto antiguo de archivos no puede recuperar automáticamente el estado Redis.
4. Antes de escribir fuera de local: acordar instancia/prefijo y registro de destino, verificar capacidad gratuita y presupuesto explícito de operaciones.
5. Antes de publicar: revisar SHA, variables, allowlist/correo, HTTPS/cookies/proxy, límites y reversión; autorización separada.
6. Después del despliegue autorizado: un desarrollador independiente debe enviar, recuperar y corregir; operador verifica y activa; catálogo, ficha, HTTP y MCP deben coincidir.

La aceptación externa y la validación de almacenamiento real permanecen pendientes. El candidato no habilita pagos ni anuncia nuevas capacidades multichain.
