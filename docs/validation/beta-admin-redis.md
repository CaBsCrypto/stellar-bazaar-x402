# Sesiones y límites: Redis real acotado

Fecha 2026-09-29. Base f3a18e14 con scripts de este bloque. Node 24.14.0, Windows. Revisión independiente beta_candidate; guardas reproducidas por coordinador. Sin cambios de aplicación en este bloque.

Ejecución f94db1e3-72b3-49dc-bcd8-5cbc1cbeac8c, instancia x402-bazaar Free. Tres claves previamente declaradas y comprobadas ausentes bajo `bazaar-review:local-test:admin-probe:<runId>`, distintas de la solicitud sintética anterior y de todas las claves históricas. El adaptador traduce exclusivamente esas tres claves; utiliza las implementaciones nativas de sesión y límites.

Resultado: **20 solicitudes REST, 40 comandos conservadores, 4.337 bytes acumulados de cuerpos de solicitud**. Máximo autorizado 200 comandos/100 KiB. Contadores privados persistidos antes de cada petición; sin reintentos, redirecciones ni ampliación del presupuesto.

- Sesión sintética aceptada; origen ajeno y CSRF incorrecto rechazados.
- Revocación nativa confirmada y nueva lectura rechazada.
- Lua nativo permite dos solicitudes, rechaza la tercera con 429; contadores en 2 y TTL positivo.
- Otro proceso confirma ausencia de sesión revocada y acepta únicamente contadores ausentes por caducidad o con valor 2; no demuestra conservación más allá del TTL.
- La sesión se sembró directamente: no acredita correo, OTP ni intercambio inicial. La segunda invocación prueba revocación, no persistencia de una sesión activa.
- La prueba elimina únicamente su sesión sintética mediante la revocación prevista; contadores caducan por diseño. No borra solicitudes ni auditoría.
- Cero publicaciones, pagos, correos o consultas históricas. No demuestra respaldos ni recuperación ante pérdida de Redis.

Comandos reproducibles (no repetir run sobre un diario ejecutado):

```text
node scripts/beta-admin-redis-guard.mjs
node scripts/beta-admin-redis-probe.mjs prepare <directorio-privado-nuevo>
node scripts/beta-admin-redis-probe.mjs run <directorio> <env-privado>
node scripts/beta-admin-redis-probe.mjs check <mismo-directorio> <env-privado>
```

El diario quedó fuera del repositorio con ACL exclusiva del operador; no contiene datos históricos. Un error intermedio bloquea otro run y requiere inspección del mismo diario.

## Regresiones y candidato

Tipos (`tsc --noEmit`) y compilación (`next build --webpack`) aprobados; aviso preexistente metadataBase. Suites aprobadas: provider-review-redis, provider-review-store, provider-self-listing, provider-review-operator, provider-review-admin-ui, provider-review-limits, provider-submission-http, seller-end-to-end, seller-instructions, discovery-conflicts, history-rotation, delivery-recovery-client. El revisor reprodujo provider-admin-session, public-provider-review e history-identity-pilot.

Se corrigió una dependencia faltante en el harness test-operational-guards; no cambió código de producción. El coordinador reprodujo esa corrección y comprobó que el rechazo por límites impide crear OTP o enviar correo. Las guardas del ejecutor nuevo también pasaron sin red.

PR61 sigue OPEN en be9d1db, base fix/operational-guards y CI SUCCESS (consulta 2026-09-29). Ese CI no acredita los commits locales posteriores. Main remoto sigue76ba7b1. Consulta de capacidades públicas mediante herramienta web no disponible; no se atribuye al servidor un fallo basándose en ese error de herramienta. Revalidar despliegue/dominio antes de publicación.

Pendientes: correo administrador, remitente y cuota Resend, compatibilidad privada de cuentas existentes, autorización concreta de configuración/despliegue y alta externa posterior. Véase BETA_PUBLIC_RELEASE_MANIFEST.md.
