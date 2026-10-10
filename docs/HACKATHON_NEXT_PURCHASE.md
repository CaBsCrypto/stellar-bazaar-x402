# Compra autorizada: preparación detenida por el límite de comisión de red

Estado del 10 de octubre de 2026. El usuario autorizó una sola compra de `0.01 USDC` Testnet y una ejecución. La preparación se detuvo antes de enviar el pago porque la simulación supera el límite local de comisión de red patrocinada. La orden sigue impagada; no se ha ejecutado ni entregado el servicio. La publicación de producción no está autorizada.

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

El intento autorizado quedó registrado en el diario cifrado y consumió su control de ejecución única. Su fase local es `authorization-uncertain`, pero no contiene transacción sin firmar, autorización firmada, payload de pago ni firma. El intento hizo cero solicitudes al mercado y dos RPC; no envió el pago. Una recuperación posterior hizo un GET a la misma orden, sin RPC ni pago, y confirmó `awaiting-payment`.

La simulación RPC de solo lectura devuelve `minResourceFee = 735723` stroops. Sumados los `100` stroops de comisión base, el importe estimado es `735823` stroops, es decir, `0.0735823 XLM` Testnet. El límite local era `50000` stroops (`0.005 XLM`), por lo que el adaptador detuvo la preparación. Esta estimación no es un cobro realizado ni una comisión de Bazaar; el precio del servicio conserva `0.01 USDC` y la comisión de Bazaar conserva `0`.

El candidato usa `https://channels.openzeppelin.com/x402/testnet` y anuncia `areFeesSponsored: true`: el facilitador externo patrocina la comisión de red. No hay una wallet de Bazaar configurada para financiar gas. Cada comprador firma la autorización de su USDC con su propia wallet; la firma de `transfer(from, to, amount)`, nonce y vencimiento no firma la comisión patrocinada. El facilitador reconstruye y firma la transacción de liquidación, como explica la [guía oficial de firmas Soroban](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations).

**`maxSponsoredFeeStroops` limita únicamente la preparación del cliente local** antes de firmar. No es un presupuesto de Bazaar ni un tope sobre la comisión efectiva de la transacción que el facilitador reconstruya. La [guía oficial x402](https://developers.stellar.org/docs/tools/cli/agent-cli/guides/pay-for-apis-x402) explica cómo comprobar la comisión liquidada; aquí aún no existe una liquidación que comprobar.

Se solicitó autorización adicional para continuar exclusivamente esta misma orden y compra, elevando sólo el límite local de preparación a `1000000` stroops (`0.1 XLM` Testnet). Esa autorización está pendiente; la consulta del usuario sobre quién financia las comisiones no constituye esa confirmación. No se ha restablecido el control consumido, creado otra orden, firmado ni reenviado un pago. La continuación deberá conservar el mismo identificador y el registro de lo ocurrido.

El adaptador limita el intento a 120 segundos, seis solicitudes al mercado y cuatro RPC, sin reintentos de pago. Su prueba sintética pasó 31 escenarios, incluida pérdida de respuesta, cambios de objetos durante la autorización y continuación restringida de una simulación fallida sin firma. La suite nativa pasó otros 51 escenarios y 21 de política de fees. Estas pruebas fueron locales, con dependencias simuladas y sin pagos ni lecturas de wallets reales.

La revisión real del diario cifrado comprobó las siete instantáneas conservadas: únicamente `prepared`, `challenge-received`, `authorization-started` y `authorization-uncertain`, sin material histórico de firma o envío. La continuación preparada exige esa comprobación, una aprobación idéntica salvo el tope local y un subcontrol consumido y sincronizado antes de preparar la firma. Conserva el control original y reutiliza la reserva única; un fallo posterior exige recuperación, sin otro pago. Preparar este código no equivale a autorizarlo ni ejecutarlo.

El firmante se mantiene local y cifrado; no se generan wallets ni se solicitan fondos a Friendbot o faucet. Las claves privadas no se envían a Bazaar, Vercel, el proveedor o MCP. La evidencia de preparación y recuperación está en [hackathon-payment-preflight-2026-10-10.json](evidence/hackathon-payment-preflight-2026-10-10.json); todavía no acredita una transacción alojada.

Después de resolver esa autorización sigue pendiente completar pago verificado, una ejecución del servicio de texto, entrega con checksum, historial privado, recuperación y aislamiento entre cuentas. No se ha validado imagen/video ni producción. Compras adicionales, financiación de wallets, reparto de comisión, contratación de planes y publicación de producción requieren su propio alcance y autorización.
