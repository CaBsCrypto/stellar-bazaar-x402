# Propuesta de Preview protegida — 23 septiembre 2026

## Destino y límites

Proyecto local enlazado en Vercel: **stellar-bazaar-x402**. Rama: **ui/testnet-funding-guide**. El enlace del proyecto se leyó de .vercel/project.json; todavía no se comprobó su configuración remota. No se hizo push, despliegue ni cambios en main. La URL definitiva se conocerá tras autorizar la publicación.

La propuesta es una Preview con autenticación de Vercel, biblioteca privada y compras bloqueadas. Antes de desplegar, comprobar la protección de acceso remota; si no está disponible, no publicar como si fuera privada. No introducir claves de wallet ni la credencial real del facilitador en esta Preview.

## Configuración propuesta (no aplicada)

| Variable | Valor o requisito |
|---|---|
| NEXT_PUBLIC_X402_XLM_PILOT | true, durante compilación de revisión |
| X402_SETTLEMENT_STORE | redis |
| X402_PILOT_PAYMENTS_ENABLED | false |
| NEXT_PUBLIC_APP_URL | origen HTTPS definitivo de esta Preview |
| X402_SELLER_ADDRESS / NEXT_PUBLIC_X402_PILOT_SELLER | GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ |
| STELLAR_X402_FACILITATOR_URL | https://channels.openzeppelin.com/x402/testnet |
| STELLAR_X402_FACILITATOR_API_KEY | marcador sin acceso, exclusivamente para inspeccionar el 402; nunca clave real |
| UPSTASH_REDIS_REST_URL / TOKEN | instancia dedicada de Preview, pendiente de seleccionar/configurar; no reutilizar producción |
| BAZAAR_HISTORY_ACCOUNTS_JSON | propietarios exclusivos de revisión, tokens de lectura/escritura separados; no reutilizar accesos históricos |

Sin X402_PILOT_STATE_DIR ni secretos del comprador. Separación por instancia Redis porque los prefijos existentes del historial no constituyen una separación completa por entorno. No se aprovisionará una instancia ni un plan de pago sin revisión. Mantener claves privadas fuera del bundle, repositorio y capturas.

El prefijo de liquidación es bazaar:settlement:v1:testnet:swap-risk. La ruta bloquea toda firma en modo redis antes de verificar o liquidar. La inyección que usa el test HTTP requiere NODE_ENV=test, ausencia de VERCEL y un callback pasado directamente por código; la ruta Next no lo proporciona. No existe parámetro HTTP de desbloqueo.

## Evidencia administrativa pendiente

El 23 de septiembre se abrió console.upstash.com y apareció la pantalla de inicio de sesión. No fue posible comparar el endpoint configurado con una base del panel. El acceso REST funcional corresponde a la configuración local existente, pero no acredita identidad administrativa ni garantías operativas.

Pendientes: base/proyecto propietario y región; persistencia y pérdida máxima documentada; límites y política de memoria; respaldos, retención y restauración. INFO/CONFIG no están disponibles por las credenciales REST. TTL -1 únicamente acredita ausencia de expiración de las claves examinadas.

Si ocurre pérdida, restauración o eliminación de registros: mantener el bloqueo de compras, conservar la evidencia disponible, reconciliar transferencias y operaciones antes de cualquier habilitación. Nunca interpretar una base vacía como prueba de ausencia de cobros. No reiniciar marcadores ni cambiar identificadores para resolver incertidumbre.

## Reproducción sin pagos

- npm ci
- npm run test:xlm:pilot
- npm run test:history
- npm run test:provider-card
- npm run test:payments:shared (requiere credenciales Redis privadas; crea únicamente registros aislados de prueba)
- npm run build y npm run typecheck
- Con localhost iniciado: MCP_BASE_URL=http://127.0.0.1:3215 npm run test:mcp:onboarding (establecer variable según la shell).

Las pruebas compartidas cargan solo credenciales Redis: no leen seeds ni credenciales del facilitador. El test HTTP levanta procesos locales y pasa por el handler completo con verificación/liquidación simuladas. Cubre ambos activos, concurrencia, reinicio, pérdida de respuesta, indisponibilidad, fallo de finalización y registros inválidos. Los tests del almacén complementan el caso de respuesta perdida después de guardar la finalización.

Resultados del bloque: compilación y tipos correctos; test:payments:shared, test:xlm:pilot, test:history, test:provider-card y test:mcp:onboarding correctos. El intento inicial de MCP apuntaba al puerto 3000 sin servidor; se repitió correctamente en 3215. Advertencia previa metadataBase sin configurar, independiente de pagos.

Consulta histórica read-only: una operación por activo, hashes originales conservados y pagos locales deshabilitados. Ninguna compra nueva. La evidencia histórica de Testnet no acredita compras desde esta futura Preview.

## Revisión después de autorizar publicación

Comprobar autenticación antes de exponer datos; catálogo, conexión, biblioteca, aislamiento de propietarios y bloqueo/reentrada con datos de prueba. Comparar origen, destinatario y contratos del 402 con la ficha; confirmar rechazo de firmas antes del facilitador. Cualquier activación de pagos o reconciliación automática será otro bloque. Este documento prepara esa revisión; no afirma que la Preview esté desplegada.
