# Wallets y comisiones de la demo

Documentación de los cortes nativos Testnet de Bazaar `4f250cd` y `633e31e`, con una nueva comprobación de cadena el **2026-10-11 UTC**. Las compras se realizaron en previews protegidas y sus evidencias conservan el candidato correspondiente. Este archivo es documentación interna excluida del despliegue; no habilita funciones, publica una versión ni autoriza transacciones.

## Qué paga cada persona ahora

El marketplace nativo anuncia **`feeBps: 0`**. La compra mediante `/api/market/orders/{id}/x402` transfiere el importe completo de USDC Testnet directamente a la wallet del vendedor declarada en la ficha. **La wallet administradora no recibe una comisión en este flujo.**

La ficha revisada fija el destino público del vendedor, el precio y el activo. Cada orden conserva esa ficha y su `cardHash`, además de la wallet pública pagadora elegida por el comprador. El comprador firma en su propio entorno; Bazaar comprueba que la autorización y la transacción coinciden con esa orden. Bazaar no necesita ni almacena las seeds o claves privadas de compradores o vendedores y no recibe primero los fondos para repartirlos después.

La vinculación previa de wallet con una cuenta es **opcional**. El pagador sigue siendo obligatorio e inmutable en cada orden. Las cuentas de comprador y vendedor deben ser distintas para comprar, pero el código actual no exige unicidad global de wallets pagadoras ni impone `payer != destination`. La compra autorizada de esta demo utilizó wallets distintas para demostrar participantes separados; esa elección de prueba no es una restricción ya implementada.

Una dirección pública en la ficha acredita el destino declarado, **no el control de esa wallet**. La prueba HTTP/DNS de control del endpoint acredita control del dominio del servicio. Una no sustituye la otra. El vendedor conserva el control de su propia wallet; demostrarlo requiere una prueba de firma correspondiente, sin entregar la clave privada.

Fuentes del candidato: `lib/mcp-onboarding-server.ts:114` (`feeBps: 0`); `lib/marketplace.ts:38,54,111,118,120` (pagador, ficha, vinculación opcional y separación de cuentas); `lib/marketplace-x402.ts:70,80–83` (un único destino y una transferencia exacta).

## Comisión de Bazaar y comisión de red son diferentes

`areFeesSponsored: true` en el desafío x402 anuncia patrocinio de la **comisión de red** de la operación. No representa una comisión comercial de Bazaar, no reparte USDC con la administradora y no cubre el consumo de Vercel, Redis/Upstash o R2.

| Concepto en el candidato actual | Quién lo autoriza o cubre |
|---|---|
| Precio del servicio en USDC Testnet | El comprador firma con su propia wallet; el importe va al vendedor |
| Comisión de red en XLM Testnet | El facilitador externo patrocina la liquidación anunciada por x402 |
| Ingreso comercial de Bazaar | `0`: el reparto con una tesorería no está habilitado |

El runtime fija el facilitador `https://channels.openzeppelin.com/x402/testnet` en `lib/marketplace-x402.ts`. **No hay una wallet de Bazaar configurada para financiar gas en este flujo.** El comprador conserva su firmante y autoriza su transferencia de USDC; el patrocinio de red no permite al operador firmar por las wallets de otras personas. La [guía oficial de pagos x402 de Stellar](https://developers.stellar.org/docs/tools/cli/agent-cli/guides/pay-for-apis-x402) describe la liquidación patrocinada por el facilitador y cómo comprobar sus eventos y comisiones después del pago.

La firma de una auth entry autoriza la invocación concreta —en esta compra, `transfer(from, to, amount)`— y su nonce y vencimiento por ledger. El facilitador puede reconstruir y firmar la transacción que paga la comisión. **La auth entry del comprador no firma un límite de comisión patrocinada.** Esta separación entre autorización y envío está documentada en [Signing Soroban contract invocations](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations).

El parámetro **`maxSponsoredFeeStroops` es un control del cliente local**: rechaza una simulación o transacción propuesta cuyo fee exceda el valor permitido antes de firmar. No configura un presupuesto de Bazaar, no reserva fondos de su tesorería y no impone un tope a la comisión efectiva de la transacción que el facilitador reconstruya. La comisión real sólo se comprueba en el resultado de liquidación; no debe confundirse con la estimación local.

La primera preparación de la compra de `0.01 USDC` se detuvo por este control local: la simulación dio `735723 + 100 = 735823` stroops (`0.0735823 XLM` Testnet), frente al límite de `50000`. Ese intento no firmó ni envió el pago. El usuario autorizó después continuar la misma orden con un límite local de `1000000` stroops (`0.1 XLM` Testnet), y la compra se confirmó y entregó. La [evidencia de preparación](evidence/hackathon-payment-preflight-2026-10-10.json) conserva el fallo anterior; el estado actual se documenta en [la compra confirmada](HACKATHON_NEXT_PURCHASE.md). No queda pendiente esa autorización adicional.

En la liquidación real de la transacción `15d976c56f86bf8b104f7dbaa9d9b803d773ec3b61811eace8436d1e521812d0`, ledger `5130123`, el fee bump declaró `33370` stroops y cobró **`23169` stroops (`0.0023169 XLM` Testnet)**. Lo pagó `GA6THKUY2XJZOBRFMEQMMEADSCQLCZ2QMQWAWMMDXBTE7SARKAXVH7TL`. Los saldos XLM del comprador y vendedor no cambiaron. El precio `0.01 USDC` fue al vendedor y el ingreso comercial de Bazaar fue `0`. La estimación local previa y el fee cobrado son mediciones diferentes. El [informe consolidado](evidence/hackathon-paid-text-preview-2026-10-10.json) conserva la comprobación pública de cadena y los balances posteriores.

La compra posterior, autorizada por separado en la preview `ezcuo3lgv` del candidato `633e31e`, también pagó **`0.01 USDC` Testnet** directamente del comprador al vendedor. El [informe de cadena](evidence/continuous-purchase-chain-2026-10-10.json), observado el `2026-10-11T01:29:18.2697297Z`, verificó autorización del comprador y transferencia de `100000` unidades atómicas en el SAC oficial: transacción `a418e24498a988af98e2e75ed1bbdbde04fe3c9c7133a565416b4915288a97e0`, ledger `5131675`, estado `SUCCESS` y fee bump.

| Comisiones de esa segunda liquidación | Stroops | XLM Testnet |
| --- | ---: | ---: |
| Fee declarado en la transacción interna | `33264` | `0.0033264` |
| Fee declarado en el fee bump externo | `33367` | `0.0033367` |
| Fee realmente cobrado | **`23167`** | **`0.0023167`** |
| Límite de simulación del cliente local | `1000000` | `0.1` |

La cuenta que pagó XLM fue nuevamente `GA6THKUY2XJZOBRFMEQMMEADSCQLCZ2QMQWAWMMDXBTE7SARKAXVH7TL`, distinta del pagador USDC; el informe comprueba `buyerIsFeeSource:false`. **El comprador firmó su transferencia USDC y el facilitador externo pagó XLM.** El límite local de `1000000` stroops no fue una condición firmada que limitara el fee bump externo: sólo era el control de simulación/transacción propuesta del cliente. Los fees declarados y el realmente cobrado tampoco son valores intercambiables. La comprobación usó una lectura RPC y cero nuevos envíos de pago o firmas; registra la liquidación ya realizada, no otra compra. Esta evidencia no activa una wallet de gas o ingresos comerciales de Bazaar.

El reparto **99% al vendedor / 1% a Bazaar** permanece como diseño separado en `lib/fee-split-design.ts` y `contracts/fee-split-router`. La política declara `status: "design-only"`. La dirección pública propuesta de tesorería es:

```text
GDVR2KDK5DSMNYZJKNISUIOBDC6FZK3XZOIQWSS7KL4BRMD5BMW6RMCQ
```

No se confirmó aquí su control ni se habilitó como receptor del marketplace. **No existe una variable de entorno que active ese reparto en el protocolo nativo actual.** El servidor y el cliente admiten una llamada directa `transfer`; una invocación del router con dos transferencias requiere un mecanismo compatible, verificación del facilitador, firma y conciliación de ambos destinos.

Activarlo exige publicar y revisar la política, integrar el protocolo y sus recibos, y probar el reparto antes de otra autorización de compra. La nueva política debe estar incluida en una ficha/versionado revisados y su nuevo `cardHash`; no se cambian condiciones de órdenes existentes. El precio bruto podría mantenerse si el vendedor acepta el neto correspondiente. El diseño del 1% rechaza importes cuyo reparto necesite redondeo. No se ejecutó este reparto en la preparación de la demo.

## Activo y preparación de una wallet

La identidad admitida es exactamente:

| Campo | Valor |
|---|---|
| Red | `stellar:testnet` |
| Activo | `USDC` |
| Emisor oficial Testnet | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| Contrato SAC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

El vendedor debe tener la **trustline autorizada de ese emisor** y capacidad para recibir el importe. Una trustline a otro emisor, aunque también se llame USDC, no sirve. El comprador necesita ese USDC Testnet y acceso local a su firmante. Una consulta pública de saldo o trustline no demuestra que el firmante esté disponible.

La [guía oficial Stellar para x402](https://developers.stellar.org/docs/build/agentic-payments/x402/quickstart-guide) explica la preparación de la wallet Testnet y la trustline. [Stellar Lab](https://lab.stellar.org/) permite preparar las operaciones de Testnet. Las seeds se generan y conservan en el entorno del participante: no se envían a Bazaar, al operador, al historial ni a URLs o logs.

Para wallets nuevas, el [faucet de Circle](https://faucet.circle.com/) declara **20 USDC Stellar Testnet por solicitud cada dos horas**. Es una opción de preparación, no una prueba de que una solicitud se haya completado.

[Sozu Faucet](https://faucet.sozu.capital/) respondió HTTP 200 en su raíz aproximadamente a las **22:47 UTC del 2026-10-10**. Se identificó `@sozu/faucet` versión **0.2.0** en el registro npm, sin instalarlo. Esa disponibilidad no garantiza un claim ni acredita una entrega de fondos. No se solicitó financiación nueva como parte de esta documentación.

## Wallets históricas comprobadas

Las siguientes observaciones públicas de Horizon Testnet se tomaron antes de la compra autorizada. Estas consultas no necesitaron claves privadas.

| Wallet pública | Observación del 2026-10-10 UTC | USDC del emisor oficial | Trustline autorizada |
|---|---|---:|---|
| A: `GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C` | `22:48:11.422Z`, HTTP 200 | `0.0400000` | Sí |
| B: `GD454Z77ESZ5EHO6W7RE2WJCWQYKGFBS6HT2D375CYBWGHFFXOFIUWMU` | `22:48:11.567Z`, HTTP 200 | `99.9600000` | Sí |
| Destino del catálogo legado: `GBYXQUSY7WA3DUXZSANGQ3HMER2EBMOK5IYPUJV4YY2UH7QS736J62LB` | `22:48:11.711Z`, HTTP 200 | No se encontró trustline oficial | No disponible para este activo |

Después de la primera compra autorizada, A tenía `0.05 USDC` y B `99.95 USDC`. Sus saldos XLM se mantuvieron en `9999.9999900` y `9999.9999700`, respectivamente. Son balances de ese corte histórico, no de la segunda compra. El firmante existente de B se utilizó únicamente en el entorno local cifrado; no fue necesario un nuevo faucet. Los balances pueden cambiar; una transacción nueva requiere comprobar sus condiciones exactas. La dirección del catálogo legado no debe reutilizarse suponiendo que ya puede recibir el USDC oficial.

Las autorizaciones de la [primera compra confirmada](HACKATHON_NEXT_PURCHASE.md) y de la compra posterior `a418e244…` ya se consumieron. Las evidencias pertenecen a pruebas de preview protegida; la comprobación de cadena posterior aquí documentada acredita transferencia, autorización y comisión, y no sustituye la aceptación de entrega. Estos resultados no acreditan visualización pública en el navegador, imagen/video, entrega R2 ni aceptación de producción. No autorizan otra compra, cambio de destinatario, activación del reparto o publicación de producción.
