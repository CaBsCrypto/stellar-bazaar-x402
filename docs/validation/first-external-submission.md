# Primera solicitud externa: candidato de apertura

## Estado

Base publicada: `d6dd85588c90a5f00adfa1a57cc907f349a9b2b6`.
La sesión administrativa fue comprobada por el operador en su celular.
Este bloque prepara código local; no abre recepción ni activa servicios.

La página `/publish` consulta configuración del servidor en cada solicitud:
recepción cerrada, abierta con almacenamiento compartido configurado, o no disponible.
La configuración válida no certifica disponibilidad ni durabilidad de Redis.

## Actualización propuesta, todavía no aplicada

Conservar proyecto `stellar-bazaar-x402`, origen `https://bazaar.browns.studio`,
Redis existente y prefijo `bazaar-review:production`.
Cambiar únicamente `BAZAAR_ENABLE_SELF_LISTING_INTAKE=true` para el candidato revisado.
Mantener revisión administrativa y consulta privada habilitadas.
Mantener `BAZAAR_ENABLE_PROVIDER_ACTIVATION=false`,
`BAZAAR_ENABLE_REGISTRY_MUTATIONS=false`, `X402_PILOT_PAYMENTS_ENABLED=false`,
`X402_LEGACY_PAYMENTS_ENABLED=false`, `X402_ENABLE_LOCAL_PAYER=false`
y `NEXT_PUBLIC_X402_XLM_PILOT=false`. Sin firmantes ni altas de cuentas públicas.

Antes de aplicar: revisar SHA, resultados, margen gratuito y configuración efectiva.
La autorización de esta preparación no aplica la actualización remota.
Conservar pausa global de builds y usar construcción Webpack del candidato.

## Paquete para el desarrollador

URL: https://bazaar.browns.studio/publish

Describe tu servicio y prepara su ficha con tu agente. Si ya tienes una API,
abre «Ya tengo una integración técnica». Usa tu endpoint HTTPS y el dominio
exacto que controlas. Prepara la solicitud y guarda su identificador y acceso
privado fuera del navegador antes de enviarla. Conserva también el comprobante.
Publica la prueba DNS TXT o HTTPS indicada y pide al operador su revisión.
Para recuperar, usa «Recuperar una solicitud guardada» con el mismo acceso.
Una respuesta incierta exige consultar esa solicitud, no crear otra.
Enviar o recibir aprobación no significa publicación. No necesitas credenciales
administrativas ni compartir secretos de tu wallet.

## Aceptación externa pendiente

1. Un desarrollador real guarda acceso, envía y recibe el comprobante.
2. Desde otro navegador recupera la misma solicitud; reenvío idéntico no duplica.
3. Un acceso distinto se rechaza; la cola privada no aparece en catálogo/MCP.
4. El operador verifica control, revisa y aprueba/rechaza; preparación separada.
5. La activación permanece bloqueada. Conservar evidencia sin tokens.

La prueba externa requiere recepción autorizada y un participante con servicio
y dominio propios; los dobles locales no sustituyen esa evidencia.

## Reversión

Configurar recepción en `false` y publicar el mismo código compatible con
autenticación estricta. Conservar consulta privada, solicitudes, sesiones y
auditoría. No borrar Redis ni volver a código de autenticación permisiva.
Un cambio de variable solo afecta nuevos despliegues; no basta editarla sin
actualizar el despliegue que sirve el dominio.

## Evidencia local — 2026-09-30

Node 24.14.0; base `d6dd855` con los cambios de esta preparación.
Comandos aprobados: `npm run typecheck`, `npx next build --webpack` y
`node scripts/test-publish-reception-state.mjs` (requiere construir primero).
También pasan `test-provider-review-controls.mjs`, `test-public-provider-review.mjs`,
`test-provider-review-limits.mjs`, `test-provider-submission-http.mjs`,
`test-provider-review-operator.mjs` y `test-operational-guards.mjs` en `scripts/`.
Estas pruebas usan configuración sintética y dobles; ninguna escritura en producción.
Webpack informa una advertencia previa de metadataBase local, sin fallo de compilación.
La prueba con desarrollador externo sigue pendiente; no se presenta como completada.
