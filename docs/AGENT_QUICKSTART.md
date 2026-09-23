# Agent quickstart / Inicio rápido de agentes

## Read-only MCP discovery

Connect to `POST /api/mcp`, initialize with protocol `2025-11-25`, then use the seven read-only tools documented in [MCP_DISCOVERY.md](MCP_DISCOVERY.md). The endpoint never writes, signs, pays or executes providers.

```typescript
import { BazaarAgentClient } from "@/lib/bazaar-agent-client";

const client = new BazaarAgentClient({
  baseUrl: "http://127.0.0.1:3000",
  maxPriceAllowedUsdc: 0.05,
  allowedNetworks: ["stellar:testnet"],
  allowedAssets: ["USDC"],
});

const cards = await client.searchServicesMCP("riesgo swap");
const decision = client.validatePaymentPolicy(cards[0]);
```

## Paid execution & reconciliation runner

For verifiable on-chain Testnet execution with receipt reconciliation, use the reference agent runner:

```bash
# Dry-run (policy checks & 402 challenge inspection without spending):
npm run agent:paid-execution

# Paid Testnet settlement (requires local X402_PAYER_SECRET):
npm run agent:paid-execution -- --execute-payment
```

To test the complete 3-actor flow (Provider Service + Bazaar Discovery + Buyer Agent Settlement) in an isolated local loopback:

```bash
npm run test:three-actors:e2e
```

Keep keys outside prompts, MCP arguments, browser bundles and logs. The checked-in Python example performs discovery and 402 inspection only; it contains no payer fallback and submits no payment.


## Fondos de prueba antes de comprar

Antes de pagar, comprueba la red Stellar Testnet, el activo exacto exigido por el servicio y el saldo disponible de la wallet que firmará.
- Si ya tiene saldo suficiente del activo correcto, continúa sin usar el faucet.
- Si falta USDC de Testnet, usa Sozu Faucet: https://faucet.sozu.capital/ . Es un servicio externo de fondos de prueba, no una compra ni una garantía de disponibilidad.
- Si ya tienes una wallet compatible, conserva esa dirección: npx @sozu/faucet@latest claim <DIRECCION_PUBLICA>. Sustituye el marcador por su dirección pública G… o C…; nunca pases claves secretas. Comprueba que tu cliente puede firmar con esa cuenta.
- Solo si no tienes wallet de pruebas, ejecuta: npx @sozu/faucet@latest claim. Crea una cuenta G…, la financia con Friendbot, añade la línea de confianza y solicita USDC.
- Una cuenta G… existente necesita la línea de confianza de Circle USDC. Si recibes trustline_required, configúrala con el firmante local de esa wallet siguiendo las indicaciones de Sozu; no generes otra wallet para evitar el error. Puede necesitar XLM de Testnet para su reserva.
- Si el resultado incluye wallet.secret, guárdala una sola vez en el almacén local de secretos del agente. No copies el JSON sin filtrar al chat, historial, MCP ni registros públicos; informa solo la dirección pública y el resultado. Nunca pidas al humano su clave secreta.
- Tras la solicitud, vuelve a verificar red, contrato/emisor del activo y saldo; no basta el nombre USDC. Puedes consultar la dirección en https://stellar.expert/explorer/testnet. Si falla el faucet o no alcanza el saldo, informa el bloqueo y no intentes pagar ni repetir solicitudes indefinidamente.
Recibir fondos de prueba no autoriza una compra: respeta el presupuesto y las condiciones de la tarea.

Conectar MCP no configura un firmante ni concede presupuesto. Consulta esta guía para los fondos y `/HISTORY_CONNECTION.md` para registrar entregas privadas.

Friendbot (https://friendbot.stellar.org) permite financiar cuentas de pruebas con XLM para las reservas y comisiones. Tener XLM no significa que un servicio lo acepte como pago: comprueba siempre el activo declarado. No cambies de activo ni repitas el pago después de iniciarlo.
