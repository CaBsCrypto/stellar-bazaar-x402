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

## Evidencia administrativa confirmada — 23 septiembre 2026

Se identificó en la cuenta correcta la base **x402-bazaar**, ID 642bb693-0d9f-4806-9ee6-7fdf6b23f48e. Su endpoint coincide con la configuración local. Plan Free Tier; AWS, N. Virginia (us-east-1), Global; almacenamiento observado aproximadamente 110 KB de 256 MB. No se copiaron credenciales ni datos del panel.

Eviction está desactivado. Backups muestra No data y Daily Backup está deshabilitado. La documentación de Upstash describe persistencia habilitada, pero esto no prueba restauración ni ausencia de pérdida de marcadores: https://upstash.com/docs/redis/features/durability y https://upstash.com/docs/redis/features/backup. No se ejecutó respaldo ni restauración ni cambio de plan. La restauración requiere reconciliar evidencia externa antes de reabrir pagos; nunca interpretar una base vacía como ausencia de cobros.

### Bloqueo de la Preview gratuita

Al pulsar Create Database, Upstash informó: "You can create 1 database in free tier" y solicitó añadir un método de pago para crear más bases. La única plaza gratuita de esta cuenta ya corresponde a x402-bazaar. Se cerró el aviso sin contratar, crear ni modificar recursos.

Por la condición aprobada de cero coste adicional y base independiente, la publicación queda detenida. No se reutilizará la base histórica ni se sustituirá el aislamiento por un prefijo. No se modificaron variables Vercel, no se hizo push ni despliegue. La protección remota y las pruebas en Preview siguen pendientes, no acreditadas por las pruebas locales.

Para retomar se necesita una instancia gratuita independiente disponible en una cuenta autorizada del usuario, o una decisión nueva sobre coste. Antes de subir la rama se deben configurar overrides exclusivos de Preview para Redis, propietarios y facilitador no operativo: las variables genéricas existentes no constituyen aislamiento y podrían contener credenciales reales. Comprobar protección Vercel antes de publicar; no incluir secretos de firma.

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

## Resultado de esta ejecución — 23 septiembre 2026

Publicación detenida antes de modificar Vercel o subir la rama por falta de una segunda base gratuita. No se crearon propietarios de Preview ni se trasladaron datos históricos. Las verificaciones de protección, variables, origen y navegación en Preview no se ejecutaron; permanecen pendientes.

Pruebas repetidas y correctas: test:payments:shared (Redis real y HTTP entre procesos con facilitador simulado), test:xlm:pilot, test:history, test:provider-card, test:mcp:onboarding en localhost:3215, build y typecheck. Compilación conserva la advertencia previa metadataBase. Cero transferencias nuevas.

Namespaces aislados de esta ejecución: bazaar:settlement:test:f59c8f95-9241-462f-a9f7-172994b3bf5e y bazaar:http:test:11810b75-d4b9-41cd-9787-8e44a9831ee2. El test confirma TTL -1, una llamada simulada por operación concurrente, recuperación desde otro proceso y bloqueo de incertidumbre. Se conservaron estos registros de prueba.

Consulta histórica con validate-two-assets.mjs check: records=1 para USDC y XLM, hashes originales conservados y gateEnabled=false. No se ejecutaron buy ni recover. La identidad administrativa confirmada corresponde al endpoint local; no se ha comparado aquí el valor secreto de producción en Vercel.