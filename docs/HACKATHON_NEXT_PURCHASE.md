# Prueba de compra pendiente de autorización

Preparación del 10 de octubre de 2026. Esta propuesta no autoriza el pago ni la publicación de producción.

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

El activo es el USDC Testnet de Circle, emisor `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, SAC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`. Las dos wallets tenían trustline autorizada en la consulta pública del 10 de octubre, a las 22:48 UTC. La compradora tenía `99.9600000 USDC`; no es necesaria una nueva solicitud al faucet para este importe observado.

La ficha fue presentada por MCP, su control HTTPS se comprobó con un desafío nuevo y se aprobó y activó únicamente en el namespace sintético de preview. La orden está impagada y su HTTP 402 coincide con pagador, precio, activo, destino, ficha, entrada y recurso. El agente vendedor vio esa orden mediante el SDK MCP y no la ejecutó. La ficha anterior cuyo destino no tenía la trustline se retiró del catálogo de pruebas; sus órdenes permanecen recuperables.

Después de una autorización expresa se permitirá una firma y un único envío de pago para esta orden. El adaptador local usa el diario cifrado existente, comprueba la dirección del firmante y conserva una reserva durable antes de firmar. No genera otra wallet ni ejecuta los helpers de provisión, Friendbot o faucet. No envía claves privadas a Bazaar, Vercel, el proveedor o MCP.

El pago usa la comisión de red patrocinada indicada por el HTTP 402; la preparación limita el recurso patrocinado a `50000` stroops. El adaptador de compra limita el intento a 120 segundos, seis solicitudes al mercado y cuatro RPC, sin reintentos de pago. Una respuesta incierta obliga a recuperar por la misma orden mediante GET; no se vuelve a firmar ni a cobrar. La prueba sintética del adaptador pasó 20 escenarios, incluida pérdida de respuesta y cambios de objetos durante la autorización. Esto todavía no acredita una transacción alojada.

La aceptación posterior incluye una ejecución del servicio de texto, entrega con checksum, historial privado, recuperación y rechazo de la otra cuenta. No incluye imagen/video, compras adicionales, financiación de wallets, reparto de comisión, contratación de planes o publicación de producción. Estas acciones tienen su propio alcance y autorización.
