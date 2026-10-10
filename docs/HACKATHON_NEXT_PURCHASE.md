# Compra Testnet confirmada y entrega de texto validada en preview

Estado del 10 de octubre de 2026. La única compra autorizada de `0.01 USDC` Testnet se confirmó; el proveedor ejecutó una vez y entregó texto. Se comprobó la entrega, el historial privado, la recuperación desde procesos nuevos y el rechazo de una tercera cuenta. El entorno continúa siendo una preview protegida. No se ha publicado ni validado producción.

El [informe consolidado de la compra](evidence/hackathon-paid-text-preview-2026-10-10.json), registrado a las `23:20:51.157Z`, conserva el resultado `PASS_PROTECTED_PREVIEW_TEXT`, el candidato, las autorizaciones utilizadas y las comprobaciones alojadas.

| Condición | Valor fijado |
|---|---|
| Código de aplicación | `4f250cd175832634b4abb2abb3528e4cd7786cee` |
| Entorno | Preview protegida, `dpl_HtP5qLv2yHbFJxVgukQqBqAN95YC` |
| Servicio revisado | `guionista-bazaar-pilot-text-funded-v1`, guion algorítmico de texto |
| Versión de ficha | `c1714ebdf43c10b14016906919f00db4fcedb784a72df0de6e9579edf0195bbf` |
| Orden única | `7d646868-a5c1-4b54-8df7-cd8ef21b34ff` |
| Cantidad y total | Una compra, `0.01 USDC`, `100000` unidades de siete decimales |
| Red | `stellar:testnet` |
| Comprador | `GD454Z77ESZ5EHO6W7RE2WJCWQYKGFBS6HT2D375CYBWGHFFXOFIUWMU` |
| Vendedor | `GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C` |
| Comisión de Bazaar | `0`; importe completo al vendedor |
| Firma | Sólo el firmante de pruebas local existente, cifrado mediante DPAPI |

El activo es el USDC Testnet de Circle, emisor `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, SAC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`. Antes de la compra, las dos wallets tenían trustline autorizada en la consulta pública del 10 de octubre, a las 22:48 UTC. La compradora tenía `99.9600000 USDC`; no fue necesaria una nueva solicitud al faucet.

La ficha fue presentada por MCP; su control HTTPS se comprobó con un desafío nuevo y se aprobó y activó únicamente en el namespace sintético de preview. El HTTP 402 fijó pagador, precio, activo, destino, ficha, entrada y recurso. El agente vendedor vio inicialmente la orden impagada sin ejecutarla, y la ejecutó una vez después del pago verificado. La ficha anterior cuyo destino no tenía la trustline se retiró del catálogo de pruebas; sus órdenes permanecen recuperables.

## Resultado alojado comprobado

La continuación autorizada devolvió `CONFIRMED`, con una solicitud al mercado y tres RPC. La transacción es `15d976c56f86bf8b104f7dbaa9d9b803d773ec3b61811eace8436d1e521812d0`; la orden fija `paymentVerifiedAt = 2026-10-10T23:16:45.875Z`. La comprobación pública de la cadena pasó: hash recalculado, firma verificada, ledger `5130123` y liquidación mediante fee bump. Su transacción interior es `82d3e5270627dabba15f76579b09bfe4dbf490a53a3f63afd6ed582f00faced2`.

El vendedor completó un único intento, `33c8eda7-ad69-411d-a7b5-1c5462efbf50`, con una ejecución del proveedor y diez solicitudes MCP. La orden quedó `delivered`, con texto de `484` caracteres, SHA-256 `d9c2535f4f2769c697127c58fadcc0100554c5e40a97bf25a219e66b84cf268b` y referencia `bazaar-order:7d646868-a5c1-4b54-8df7-cd8ef21b34ff`. Este archivo registra longitud e integridad; no copia el resultado privado.

La aceptación del comprador pasó con siete solicitudes MCP: entrega e integridad correctas, compra listada y tres consultas en su historial. El contenido vence en `2026-10-17T22:58:39.021Z`; esa fecha conservada no se amplió por el pago, las lecturas o la recuperación.

Desde un proceso nuevo, el comprador recuperó la misma orden pagada y entregada mediante un GET, sin RPC, firma o pago, y obtuvo el mismo checksum. Otro proceso del vendedor recuperó el mismo intento con seis solicitudes MCP y cero ejecuciones o pagos. La prueba de privacidad pasó con dieciséis solicitudes MCP: una tercera cuenta obtuvo `404` al intentar acceder a la orden y no recibió las órdenes ni consultas del comprador. El vendedor conservó su acceso legítimo de venta y su historial de consultas siguió en cero.

## Detención previa y continuación controlada

El primer intento consumió su control de ejecución única y se detuvo en `authorization-uncertain`. En ese punto, el diario no contenía transacción sin firmar, autorización firmada, payload de pago ni firma. El intento hizo cero solicitudes al mercado y dos RPC; no envió el pago. Una recuperación mediante GET confirmó entonces `awaiting-payment`. Estos son estados históricos anteriores a la continuación y al pago confirmado.

La simulación RPC de solo lectura devolvió `minResourceFee = 735723` stroops. Sumados los `100` stroops de comisión base, la estimación fue `735823` stroops (`0.0735823 XLM` Testnet). El límite local inicial era `50000` stroops (`0.005 XLM`), por lo que el adaptador detuvo aquella preparación. Esta estimación no fue un cobro ni una comisión de Bazaar; el precio del servicio conservó `0.01 USDC` y la comisión de Bazaar `0`.

El candidato usa `https://channels.openzeppelin.com/x402/testnet` y anuncia `areFeesSponsored: true`: el facilitador externo patrocina la comisión de red. No hay una wallet de Bazaar configurada para financiar gas. Cada comprador firma la autorización de su USDC con su propia wallet; la firma de `transfer(from, to, amount)`, nonce y vencimiento no firma la comisión patrocinada. El facilitador reconstruye y firma la transacción de liquidación, como explica la [guía oficial de firmas Soroban](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations).

**`maxSponsoredFeeStroops` limita únicamente la preparación del cliente local** antes de firmar. No es un presupuesto de Bazaar ni un tope sobre la comisión efectiva de la transacción que el facilitador reconstruye. La [guía oficial x402](https://developers.stellar.org/docs/tools/cli/agent-cli/guides/pay-for-apis-x402) explica cómo comprobar la liquidación, eventos y comisiones.

En esta liquidación, la cuenta que pagó el fee bump fue `GA6THKUY2XJZOBRFMEQMMEADSCQLCZ2QMQWAWMMDXBTE7SARKAXVH7TL`. La comisión declarada fue `33370` stroops; la comisión efectivamente cobrada fue `23169` stroops (`0.0023169 XLM` Testnet). El comprador pasó de `99.96` a `99.95 USDC` y el vendedor de `0.04` a `0.05 USDC`. Sus saldos XLM se mantuvieron respectivamente en `9999.9999700` y `9999.9999900`. Bazaar recibió comisión comercial `0`.

El usuario autorizó expresamente continuar exclusivamente esta misma orden y compra, elevando sólo el límite local de preparación a `1000000` stroops (`0.1 XLM` Testnet). Esa autorización ya se utilizó y no queda pendiente. La continuación conservó el mismo identificador, precio, pagador y destinatario; no creó otra orden ni repitió un pago.

El adaptador limita el intento a 120 segundos, seis solicitudes al mercado y cuatro RPC, sin reintentos de pago. Su prueba sintética pasó 31 escenarios, incluida pérdida de respuesta, cambios de objetos durante la autorización y continuación restringida de una simulación fallida sin firma. La suite nativa pasó otros 51 escenarios y 21 de política de fees. Estas pruebas fueron locales, con dependencias simuladas y sin pagos ni lecturas de wallets reales.

Antes de continuar, la revisión real del diario cifrado comprobó las siete instantáneas del intento detenido: únicamente `prepared`, `challenge-received`, `authorization-started` y `authorization-uncertain`, sin material histórico de firma o envío. La continuación comprobó una aprobación idéntica salvo el tope local y consumió un subcontrol durable antes de preparar la firma. Conservó el control original y reutilizó la reserva única. La recuperación posterior de comprador y vendedor no repitió el pago ni la ejecución.

El firmante permaneció local y cifrado; no se generaron wallets ni solicitaron fondos a Friendbot o faucet. Las claves privadas no se enviaron a Bazaar, Vercel, el proveedor o MCP. La [evidencia de preparación](evidence/hackathon-payment-preflight-2026-10-10.json) conserva el estado histórico anterior a la continuación y al pago; no representa el estado actual de la compra.

La aceptación obtenida corresponde a texto por MCP/HTTP en una preview protegida. Todavía no acredita el recorrido público desde QR, la visualización en el navegador, imagen/video ni entregas privadas R2 vinculadas a esta compra. La publicación y comprobación externa de producción siguen pendientes de su autorización separada. Esta compra consumida no autoriza otras compras, ejecuciones, financiación de wallets o reparto de comisión.
