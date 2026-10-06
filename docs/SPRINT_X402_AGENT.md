# Compra por agente y entrega recuperable

El candidato incorpora compra privada x402 v2 para el Guionista. Cada pedido congela la ficha, su hash, entrada, comprador, destinatario e identidad oficial USDC testnet. El agente conserva el desafío y la autorización firmada antes de enviarlos. Bazaar verifica una transferencia SAC al vendedor mediante el facilitador testnet y una lectura independiente de Soroban RPC. La entrega se obtiene después, desde el mismo pedido.

La apertura permanece cerrada. La implementación local, los dobles y una compilación no acreditan ventas hospedadas ni una captura completa del navegador. Las dos ventas Classic anteriores mantienen sus pedidos, hashes y expediente de aceptación parcial.

## Interfaces

1. `GET /api/market/services` con acceso del espacio devuelve las fichas activas. Una ficha nueva incluye `purchase`, con URLs privadas de creación, pago y seguimiento. La URL del proveedor continúa señalando al agente externo.
2. `POST /api/market/orders` admite credencial de agente y `paymentProtocol: "x402-stellar-exact-v2"`. Un reenvío con el mismo identificador y contenido devuelve el pedido conservado. Cualquier cambio produce conflicto.
3. `POST /api/market/orders/{operationId}/x402`, con cuerpo `{}`, devuelve `402` y `PAYMENT-REQUIRED` cuando falta la prueba. El desafío contiene 100.000 unidades del SAC oficial, equivalentes a 0,01 USDC.
4. El mismo POST con `PAYMENT-SIGNATURE` valida la autorización y reserva su intento en Redis antes de llamar al facilitador. Tras confirmar el pago devuelve `202`, `PAYMENT-RESPONSE`, pedido y `statusUrl`; si el texto ya está conservado devuelve `200`.
5. `GET /api/market/orders/{operationId}` recupera el estado, comprobante y texto con autenticación del participante. No cobra ni ejecuta. Una conciliación explícita sólo hace lecturas para un hash conocido; un intento incierto sin hash se conserva para soporte.

El trabajador vendedor conserva sus acciones MCP de reclamar, entregar, declarar fallo o ejecución incierta. Sólo invoca una vez el proveedor después de confirmar el pago. Ni el historial del vendedor ni sus acciones MCP incluyen las credenciales o la autorización firmada del comprador.

## Comprador

El ejemplo ejecutable es `examples/marketplace-x402-buyer.mjs`, con Node 22 y las dependencias del repositorio. El módulo de runtime del desarrollador exporta `createRuntime({journalPath})` y proporciona:

- `agentToken`: acceso de agente al espacio, leído desde almacenamiento privado.
- `signer`: cuenta y función `signAuthEntry`; la clave sólo existe en memoria durante la firma.
- `marketFetch` y `rpcFetch`: transportes medidos, con origen exacto, tiempo y tamaño máximos, sin redirecciones ni reintentos.
- `journal`: diario cifrado con `initialize`, `append` y `read`. En Windows se ofrece `createDpapiBuyerJournal(path)`.
- `reserveSpend`: reserva durable antes de firmar. `createBuyerSpendBudget` limita el total a 200.000 unidades y conserva reservas ante respuestas perdidas.
- `maxSponsoredFeeStroops: 1_000_000`: techo explícito de fees patrocinadas para este piloto testnet. Se aplica a ambas simulaciones y a la transacción antes de enviarla. El valor debe ser un entero entre 1 y 1.000.000; si se omite, se conserva el límite de 50.000. Elevarlo requiere que el desafío declare `areFeesSponsored: true`. Este techo no aumenta los 0,01 USDC autorizados y no acredita la cuota ni la aceptación del facilitador; un exceso detiene el intento y conserva su reserva.

El archivo de intención pública contiene `origin`, `card`, `input`, `payer`, `operationId` y `maxAtomic: "100000"`. El origen debe ser el Preview protegido exacto aprobado. La credencial de automatización de Vercel se añade exclusivamente para ese hostname; no se transmite al RPC ni al proveedor.

```powershell
node examples/marketplace-x402-buyer.mjs prepare runtime.mjs pedido.dpapi intencion-publica.json
node examples/marketplace-x402-buyer.mjs buy runtime.mjs pedido.dpapi
node examples/marketplace-x402-buyer.mjs inspect runtime.mjs pedido.dpapi
```

Después de una desconexión, usar `inspect` o `recover` sobre el diario original. No preparar otra autorización para resolver una respuesta perdida. Para leer tras sustituir Vercel, configurar `recoveryOrigin`, su lista explícita `allowedRecoveryOrigins` y un transporte `recoveryFetch` de sólo GET. El pedido y la autorización conservan su origen original.

## Vendedor y soporte

Enviar la ficha nueva desde «Mis servicios», publicar el desafío de control en el well-known del proveedor y completar la revisión manual antes de activarla. El proveedor sigue alojado por su desarrollador. El Guionista de aceptación utiliza el alias estable ya existente y conserva sus rutas anteriores.

El trabajador guarda intención antes de reclamar, el inicio antes de invocar el generador y el texto/hash antes de registrar entrega. Ante una respuesta de proveedor perdida declara `execution-uncertain`. Ante una entrega cuyo acuse se pierde puede reenviar explícitamente el mismo texto conservado; no vuelve a llamar al generador.

Soporte debe guardar identificador de pedido, intento, estado y despliegue. Un pago confirmado con `delivery-failed` sigue siendo un pago confirmado y una entrega fallida. Una liquidación incierta conserva la evidencia; nunca se resuelve cobrando otra vez. El botón de pausa compartida impide nuevas compras y mantiene consultas, entregas y revocaciones.

El ejecutor hospedado conserva su informe durable `x402-hosted-agent-http.json` junto al paquete privado, fuera de Git. Lo guarda antes de cada efecto y después de cada respuesta; exportar únicamente su evidencia saneada al expediente. Un intento pendiente tras un cierre inesperado conserva su reserva y se recupera mediante lecturas, sin reiniciar los contadores.

## Configuración del candidato

Además de la configuración Redis y de espacios existente:

```text
BAZAAR_X402_MARKETPLACE_ENABLED=true
STELLAR_X402_FACILITATOR_URL=https://channels.openzeppelin.com/x402/testnet
STELLAR_X402_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_X402_FACILITATOR_API_KEY=<secreto privado existente>
BAZAAR_ACCEPTANCE_METER=true
BAZAAR_ACCEPTANCE_X402=true
BAZAAR_ACCEPTANCE_STORAGE_CAPS_JSON=<cinco particiones medidas del manifiesto>
BAZAAR_ACCEPTANCE_CATALOG_VALUE_CAPS_JSON=<dos IDs y sus cotas medidas de valor>
```

También se requiere habilitar compras y comprobar la pausa compartida. Los flags x402 legacy permanecen desactivados. La reversión puede cerrar el flag nuevo y las compras, conservando lectura de ambos formatos. USDT0 y mainnet siguen rechazados.

El espacio privado de liquidación es `BAZAAR_MARKET_PREFIX + ":x402-settlements:state"`. La prueba firmada se guarda allí, separada del pedido visible. El prefijo proporciona separación lógica; la credencial Redis continúa teniendo acceso a toda la base.

Las dos fichas del catálogo comparten una asignación total: se cuentan ambos valores, claves, índice y miembros. La retirada compara el valor exacto guardado y añade una marca, conservando todos los campos anteriores. Un conflicto detiene el cambio sin reintento.

## Condiciones pendientes de aceptación hospedada

- Captura manual real de Chrome con HAR y NetLog validada antes de pagar, incluidos redirecciones, respuesta parcial y conexiones persistentes.
- SHA final revisado, manifiesto congelado, despliegues protegidos exactos y configuración del facilitador comprobada.
- Medición del recorrido local completo dentro de 120 solicitudes, 400 intercambios Redis, 2.400 comandos, 49.164 bytes almacenados y 16/32 MiB de payloads; reservas para navegador, recuperación y cierre.
- Dos compras nuevas como máximo, fondos existentes, cero Friendbot, trustlines y faucet adicionales.
- Recuperación exacta de los cuatro pedidos después de sustituir Vercel; aislamiento, acceso, pausa, teclado, móvil y zoom real al 200 %.
- Retirada de las fichas sintéticas y revocación de A conservando los registros y el acceso de B; revisión independiente y publicación sólo después de pasar los controles.

No se han enviado invitaciones. Freighter y Privy no forman parte de la aceptación de esta fase.

Referencias: [x402 sobre Stellar](https://developers.stellar.org/docs/build/agentic-payments/x402/built-on-stellar), [cabeceras HTTP 402](https://docs.x402.org/core-concepts/http-402).
