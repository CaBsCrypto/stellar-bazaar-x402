# Website Intelligence — compra externa Testnet repetible (readiness v1)

Estado actual: **GO verificado en Stellar Testnet**. El proveedor público respondió con un 402 estándar, el comprador autorizado liquidó exactamente `0.001 USDC`, el proveedor entregó el resultado y Bazaar reconcilió el recibo con la transacción confirmada. No es Mainnet, auditoría ni promesa de producción general.

## Contrato fijado

- Fuente canónica: `https://website-intelligence-provider.vercel.app/v1/service-card`.
- Transporte allowlisted, sin URLs arbitrarias: `POST https://website-intelligence-provider.vercel.app/v1/x402/audits`. Localhost se conserva solo para CI y desarrollo explícito.
- Entrega: síncrona y estructurada.
- Pago validado: x402 v2 `exact`, `stellar:testnet`, USDC Testnet SEP-41, `atomicAmount = 10000`, `assetDecimals = 7` y `payTo` aprobado. La UI puede mostrar `0.001 USDC`, pero ese texto nunca sustituye el entero atómico del protocolo.
- Challenge: TTL y timeout máximo de 60 segundos.
- Binding obligatorio: extensión `website-intelligence/request-binding` con método, ruta, `inputHash` y `cardHash` hexadecimales sin prefijo, y algoritmo `sha256-canonical-json-v1`. Cada solicitud calcula dinámicamente su propio `inputHash` y lo acompaña con una clave de idempotencia. `accepts[].extra` solo declara `areFeesSponsored`.

La metadata del proveedor se trata como datos no confiables. El validador produce un resultado determinista por regla y nunca infiere seguridad, reputación o calidad. Cualquier diferencia mantiene `paymentActive: false`.

## Preflight manual seguro

```sh
npm run x402:website-intelligence:preflight
```

El modo predeterminado solo descarga la Service Card desde la URL allowlisted y genera el reporte de readiness. No lee seeds ni API keys. Los nombres públicos opcionales están documentados en `.env.example`.

Para repetir manualmente la validación se requieren **ambos** flags explícitos:

```sh
npm run x402:website-intelligence:preflight -- --execute-one-shot --acknowledge-exactly-one-payment --acknowledge-testnet-10000-atomic
```

Los flags constituyen el gate manual y no deben automatizarse en CI. Exigen payer Testnet activo no retirado, snapshot de balance, card/request pinning y autorización expresa para exactamente un intento.

## Evidencia reconciliada

Un hash de transacción por sí solo no prueba entrega. En ambas ejecuciones el proveedor respondió `{ result, resultHash, receipt }`; Bazaar verificó estado `settled`, esquema, red, asset, destinatario, monto, método, ruta, input hash, card hash, resultado y ledger positivo.

| Ejecución | Transacción Testnet | Ledger | Monto | Entrega |
|---|---|---:|---:|---|
| Primera validación pública | [`bb47c397…514b0`](https://stellar.expert/explorer/testnet/tx/bb47c3979c7a0031314685fea118687bcba26c4eddb3bb94ceccb980180514b0) | `4424799` | `0.001 USDC` | Resultado y recibo reconciliados |
| Repetición controlada | [`f48ab37a…0f8af`](https://stellar.expert/explorer/testnet/tx/f48ab37ae53f200899c3abca732ef3f9a63d1cea0934792c16f8effa17a0f8af) | `4440845` | `0.001 USDC` | HTTP 200, un intento, resultado y recibo reconciliados |

La repetición se ejecutó con una nueva clave de idempotencia y no reutilizó la autorización anterior. El cliente comprobó el XDR firmado antes de enviarlo y falló cerrado ante cualquier diferencia de asset, destinatario o monto. No se imprimieron seeds, la clave del facilitador ni el payload de autorización.

## Cobertura CI sin secretos

`npm run test:website-intelligence:readiness` usa mocks separados de provider, facilitator, balance y ledger. Cubre 402 sin pago, resultado feliz simulado, red/asset/payTo/monto/método/ruta/input/card incorrectos, expiración, replay, timeout, receipt malformado, proveedor caído y resultado incompatible. No realiza pagos reales.

## Límites vigentes

Website Intelligence continúa siendo un piloto fixture de solo lectura. El settlement público usa almacenamiento durable y falla cerrado si faltan facilitator, destinatario, origen allowlisted o Redis. Bazaar no almacena seeds, no firma desde el navegador y no ejecuta URLs arbitrarias. Los otros cinco pilotos siguen con pago inactivo.
