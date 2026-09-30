# Beta pública: expediente previo a autorización

Fecha: 2026-09-29. Estado: preparado localmente; NO publicado.

## Versiones y alcance

Candidato base `f3a18e14`; rama `mission/identity-pilot`. Consulta remota de esta fecha: main `76ba7b19eacb424d8c9e872a2d01569e1eb45b3d`, rama remota `be9d1dbb2afb4041edf707576ba5e9fe6fe5e165`. El candidato local incluye trabajo posterior aún no subido. El SHA exacto final debe fijarse antes de autorizar el despliegue; no desplegar automáticamente la punta de una rama.

Proyecto previsto: `stellar-bazaar-x402`. Origen: `https://bazaar.browns.studio`. La última inspección del panel mostraba producción en `76ba7b1`; main remoto no prueba por sí solo qué despliegue está sirviendo el dominio.

Respecto a esa base, incluye separación cliente/servidor y WebMCP, identidad estricta, recuperación USDC/XLM, control compartido bloqueado, descubrimiento consistente, instrucciones del comprador y piloto administrativo. Revisar el diff completo: no es solo un cambio de formulario.

Biblioteca: conservar `BAZAAR_HISTORY_ACCOUNTS_JSON` con todas las asociaciones verificadas. No aceptar ownerId como credencial ni inferir la pertenencia de enlaces antiguos. La ausencia de una asociación histórica es un bloqueo de ese acceso, no una autorización para reasignarlo. Preparar un traspaso privado de credenciales antes de cambiar cuentas; este expediente no contiene sus valores.

## Configuración inicial propuesta, NO aplicada

| Variable | Valor o condición |
|---|---|
| NEXT_PUBLIC_APP_URL | https://bazaar.browns.studio |
| BAZAAR_PROVIDER_REVIEW_BACKEND | redis |
| BAZAAR_REVIEW_PREFIX | bazaar-review:production |
| BAZAAR_REVIEW_REDIS_REST_URL / TOKEN | instancia existente x402-bazaar, valores privados |
| BAZAAR_REVIEW_RATE_SECRET | nuevo secreto servidor, mínimo 32 caracteres |
| BAZAAR_ENABLE_PROVIDER_REVIEW_ADMIN | true únicamente con correo y almacenamiento comprobados |
| BAZAAR_ENABLE_PUBLIC_PROVIDER_REVIEW | true para consulta remota protegida por credencial |
| BAZAAR_ENABLE_SELF_LISTING_INTAKE | false inicialmente |
| BAZAAR_ENABLE_PROVIDER_ACTIVATION | false inicialmente |
| BAZAAR_ENABLE_REGISTRY_MUTATIONS | false inicialmente |
| ADMIN_ALLOWED_EMAILS | una dirección, pendiente de entrega privada |
| RESEND_API_KEY | privada, pendiente de comprobar remitente y cuota |
| X402_PILOT_PAYMENTS_ENABLED | false |
| X402_LEGACY_PAYMENTS_ENABLED | false |
| X402_ENABLE_LOCAL_PAYER | false |

No incorporar claves de firma. No depender de la vigencia de credenciales del facilitador para bloquear pagos: las tres puertas anteriores deben permanecer cerradas y probarse.

El correo usa el remitente existente `Stellar Bazaar <auth@browns.studio>`. Deben verificarse el dominio y la cuota disponible de Resend antes de habilitar envíos. No se ha solicitado ningún correo en este bloque.

El OTP administrativo existente utiliza `UPSTASH_REDIS_REST_URL/TOKEN` (o aliases KV) y `bazaar:admin:magic:*`, TTL 15 minutos. NO está bajo el prefijo de revisión. Sesiones (30 minutos), límites, solicitudes y auditoría sí usan el prefijo de revisión. Solicitudes y auditoría no tienen TTL. Confirmar ambos destinos sin cambiar ni leer datos históricos.

El catálogo dinámico conserva su almacenamiento actual. Solicitudes pendientes nunca se copian al registro público. Activar exige además la habilitación del registro y el secreto servidor existente; no entregar ese secreto a proveedores.

## Publicación y reversión

1. Antes de configurar: confirmar SHA final, correo, asociaciones históricas, cuota, panel de producción y protección operativa. Solicitar autorización sobre este expediente completo.
2. Conservar la pausa global (`commandForIgnoringBuildStep = exit 0`) y exclusiones Git hasta revisar el procedimiento exacto de despliegue. No levantarla globalmente ni suponer que un push es inocuo.
3. Desplegar inicialmente con recepción y activación cerradas. Verificar dominio, SHA, administración, lectura, catálogo y MCP; comprobar pagos bloqueados.
4. Abrir recepción para un desarrollador invitado. Probar solicitud, recuperación y reenvío idempotente. Después verificar dominio, aprobar, preparar y activar separadamente.
5. Ante incertidumbre, consultar/reconciliar el mismo intento. No borrar marcadores ni generar otra activación.
6. Reversión: cerrar intake, activación y mutaciones del registro; mantener consulta, solicitudes y auditoría. Usar solo código compatible con Redis y autenticación estricta; no revertir a una versión que acepte credenciales inseguras. No borrar Redis.

## Puertas aún pendientes

- Dirección administrativa y comprobación de remitente/cuota real; no contratar servicios.
- Confirmación privada de compatibilidad de cuentas históricas.
- Revisión final del SHA y autorización separada para configurar/desplegar.
- Prueba remota de desarrollador real y administración HTTPS tras publicación autorizada.
- Sin respaldos disponibles observados en Redis Free: esta prueba no acredita recuperación ante pérdida de la base.

Los límites Redis reducen abuso, pero las peticiones rechazadas también consumen comandos. Revisar cuota antes de abrir el evento y cerrar recepción si se alcanza el margen permitido; no subir de plan automáticamente. No anunciar beta validada antes del alta externa recuperable.
