# Demo reproducible — x402 exact en Stellar Testnet

Esta guía reproduce el recorrido **local y Testnet** del Swap Risk Quote. No es Mainnet, producción, auditoría ni recomendación financiera.

## Recorrido

1. **Discover:** abre el catálogo y selecciona `Swap Risk Quote`.
2. **402:** llama `GET /api/x402/swap-risk?pair=XLM%2FUSDC&amount=2500&side=buy` sin firma. La respuesta es HTTP `402` con `PAYMENT-REQUIRED` x402 v2.
3. **Authorize:** el cliente local server-only usa el payer Testnet para firmar la auth entry Soroban. Ninguna seed, API key o auth payload llega al navegador.
4. **Pay:** el cliente reintenta con `PAYMENT-SIGNATURE`; el resource server verifica y liquida mediante el facilitador alojado Testnet.
5. **Result:** solo un settlement exitoso devuelve el quote determinista y `PAYMENT-RESPONSE`.
6. **Receipt:** la UI muestra red, esquema, importe amigable y atomic, ledger, timestamp y hash público. Las direcciones se abrevian por defecto.

## Preparación de wallets de prueba

`npm run x402:setup-wallets` crea dos wallets dedicadas exclusivamente a Testnet, usa Friendbot oficial para XLM y configura trustlines USDC Testnet. Las seeds se guardan en `.env.x402.local`, que Git ignora. Fondea únicamente la dirección pública del payer mediante el Circle Faucet oficial. Nunca copies seeds al navegador, Vercel, Git, logs o chat.

Variables server-only documentadas en `.env.example`:

- `STELLAR_X402_FACILITATOR_URL`
- `STELLAR_X402_FACILITATOR_API_KEY`
- `X402_SELLER_ADDRESS`
- `X402_PAYER_SECRET` solo para cliente/demo local

No uses prefijos `NEXT_PUBLIC_` para secretos.

## Evidencia exacta

- Red: `stellar:testnet`
- Esquema: `exact`
- Activo SEP-41 USDC: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`
- Importe: `10000` atomic = `0.001 USDC`
- Transacción (Inner Soroban): `43f3ea344b5ba0f4e0de88237f91c765adc90c110827282320bd3b7aa2013602`
- Transacción (Outer Fee-Bump): `4498c958c148b98d6b9424168e12eea43352f3bb12a56558d30f50984563f05f`
- Ledger: `4212660`
- Timestamp: `2026-08-18T20:36:25Z`
- Delta confirmado: payer `-0.0010000 USDC`; seller `+0.0010000 USDC`

## Validación sin crear otro pago

Ejecuta `npm run test:x402:protocol` contra el servidor configurado. Comprueba 402, header requerido y rechazo de firma manipulada. `npm run typecheck` y `npm run build` no crean transacciones.

`npm run x402:test-client` **sí crea una autorización y puede liquidar un nuevo pago Testnet**. Ejecútalo solamente con autorización y saldo de prueba.

## Troubleshooting

- `fetch failed` / `VERIFY_TRANSPORT_ERROR`: el proceso del resource server no tiene acceso saliente HTTPS al facilitador. Corrige la política de red y reinicia el proceso; no es evidencia de firma inválida.
- `X402_SERVER_NOT_CONFIGURED`: faltan URL/key del facilitador o dirección pública del seller server-side.
- `PAYMENT_REQUIREMENTS_MISMATCH`: la firma no coincide con red, esquema, activo, monto, destino o URL canónica.
- `MALFORMED_PAYMENT_SIGNATURE`: header ausente o no decodificable.
- `VerifyError` o `SettleError`: conserva únicamente código/mensaje redactado; comprueba expiración, replay, saldo, auth entry y requisitos antes de autorizar otro intento.

## Límites

El POC no implementa wallet, custodia, escrow, Mainnet, facilitador propio, auditoría ni garantía de disponibilidad. El catálogo trata metadata de proveedores como datos no confiables y no certifica seguridad, reputación, popularidad o compras.

Consulta [SECURITY_QA.md](SECURITY_QA.md) para controles del branch y riesgos residuales de dependencias que deben resolverse antes de producción.
