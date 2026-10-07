# Bazaar: comprador externo por MCP y x402

Conecta tu agente desde tu runtime a **https://bazaar.browns.studio/api/mcp** con
`Authorization: Bearer ACCESO_DE_AGENTE`. Bazaar conserva pedido, pago verificado
y entrega; el firmante y las claves de wallet permanecen en tu equipo. No necesitas
cuenta de Vercel ni bypass. Node 22.18+ y las dependencias del checkout bastan.

1. Descubre `GET /api/market/catalog` sin token. Elige una ficha activada y conserva
   su hash canónico y descriptor de compra.
2. Prepara una intención durable con `operationId`, ficha, hash, parámetros y
   cuenta Stellar testnet. El cliente portátil del repositorio cifra secretos y
   diarios con scrypt/AES-256-GCM; introduce acceso y seed por terminal oculta o
   pipe privado, nunca por argumentos, entorno, URLs, prompts o archivos sin cifrar.
3. Llama `create_market_order` en MCP con
   `{operationId,serviceId,cardHash,payer,input,paymentProtocol:"x402-stellar-exact-v2"}`.
   El pedido congela destinatario, activo, precio y parámetros.
4. Solicita `POST /api/market/orders/{operationId}/x402`. Valida HTTP 402,
   `PAYMENT-REQUIRED`, referencia, hashes, importe y destinatario. Cada compra es
   **0.01 USDC oficial testnet**, directamente al vendedor. El SAC es
   `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`; el emisor es
   `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`.
5. Reserva presupuesto durable antes de firmar. Conserva la autorización cifrada
   antes de transmitir una única vez `PAYMENT-SIGNATURE` al mismo endpoint. El
   cliente verifica la transferencia firmada y la comisión patrocinada de red.
6. Consulta `get_market_order({operationId})` en MCP para recuperar pago, texto o
   fallo. Pago verificado y entrega disponible son estados distintos.

El cliente ejecutable es `examples/buyer-cli.mjs`; la guía completa del checkout
es `docs/BUYER_RUNTIME_GUIDE.md`:

```sh
node examples/buyer-cli.mjs configure RUTA_PRIVADA_NUEVA
node examples/buyer-cli.mjs discover
node examples/buyer-cli.mjs prepare RUTA_PRIVADA ID_SERVICIO entrada.json
node examples/buyer-cli.mjs buy RUTA_PRIVADA UUID
node examples/buyer-cli.mjs inspect RUTA_PRIVADA UUID
node examples/buyer-cli.mjs recover RUTA_PRIVADA UUID
node examples/buyer-cli.mjs history RUTA_PRIVADA 10
node examples/buyer-cli.mjs budget RUTA_PRIVADA
```

El presupuesto predeterminado es **0.02 USDC total**. Solo el dueño puede
aumentarlo explícitamente mediante `budget-increase RUTA_PRIVADA 0.03`; las
reservas e incertidumbres previas se conservan. Este cambio no reinicia intentos
ni amplía el manifiesto de aceptación de dos compras.

Ante pérdida de respuesta, conserva el almacén y UUID y consulta el mismo pedido.
Nunca regeneres firma, reenvíes pago ni reinicialices presupuesto para recuperar.
Los errores de capacidad también requieren lectura; no son una autorización para
reintentar. El historial privado pagina por defecto 10 resultados y admite hasta
20, con el cursor de la página anterior. Las consultas no firman ni pagan.
