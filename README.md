# Stellar Bazaar x402

![Stellar Bazaar x402 cover](public/brand/bazaar-cover.png)

**Spanish-first discovery for paid HTTP APIs and MCP tools on Stellar.**

**Live MVP:** [stellar-bazaar-x402.vercel.app](https://stellar-bazaar-x402.vercel.app) · [Publisher Kit](https://stellar-bazaar-x402.vercel.app/publish)

The hosted site is a public preview of the same local-MVP scope: discovery, conformance, provider drafts, and the read-only reference endpoint. It does **not** enable live x402 payments, wallets, signatures, or Stellar transactions.

Stellar Bazaar x402 is an open-source proof of concept for finding paid services, inspecting their machine-readable terms, and eventually invoking them through x402 settlement on Stellar. Bazaar indexes **services and callable routes**—not people, agent profiles, freelancers, or generic skills.

> **Current status:** local Instawards MVP. Discovery, catalogue navigation, and the deterministic read-only Swap Risk Quote endpoint work locally. There is no wallet, payment, signature, facilitator call, chain write, Testnet transaction, or financial advice. `@x402/stellar` exact payment on Testnet is the next milestone.

## What it is—and is not

Bazaar is a discovery/catalogue layer that exposes service metadata so buyers and agents can make informed choices before calling a provider. The default index is intended to remain offchain.

It is **not** a wallet, escrow, freelancer marketplace, Passport, agent-profile marketplace, generic skills directory, custodian, or buyer-policy engine. It complements rather than competes with Carmelita, a separate multichain trust/payment product that could consume Bazaar as a client later.

## Working MVP

- Spanish-first responsive landing and searchable HTTP/MCP catalogue.
- Service details with route template, inputs, outputs, network, asset, scheme, and declared price.
- One real local reference provider: `GET /api/reference/swap-risk`.
- Deterministic read-only Swap Risk Quote with structured `200` and `400` responses.
- Three conspicuous catalogue fixtures to demonstrate the target breadth.
- Deterministic natural-language ranking with visible scores/reasons and structured filters.
- Local Publisher Kit at `/publish` that validates and generates a copyable service-card manifest.
- Discovery APIs at `/api/discovery/resources` and `/api/discovery/search` with MCP-ready structured responses.
- No payment or network side effects.

The reference provider is intentionally in-process for delivery speed and is marked for extraction into a separate service after the MVP.

## Architecture

```mermaid
flowchart LR
  S["Provider service"] -->|"service card + discovery metadata"| I["Bazaar offchain index"]
  B["Buyer / agent"] -->|"intent + filters"| D["Bazaar discovery UI / API"]
  D --> I
  I -->|"policy-relevant metadata"| B
  B -->|"local call today"| R["Read-only reference endpoint"]
  B -. "future: signed payment authorization" .-> F["Existing x402 facilitator"]
  F -. "future: verify / settle via @x402/stellar" .-> T["Stellar Testnet"]
  R -->|"structured result"| B
```

Bazaar does not sign or custody. The future facilitator boundary consumes Apache-2.0 `@x402/stellar`; this project will not reimplement its verify/settle logic.

## Buyer / agent flow

```mermaid
flowchart LR
  A["Discover service"] --> B["Inspect network, asset, scheme, price, route, I/O"]
  B --> C["Apply buyer policy outside Bazaar"]
  C -. "future Testnet" .-> D["Authorize + x402 exact payment"]
  C -->|"current local MVP"| E["Call read-only endpoint"]
  D -.-> E
  E --> F["Structured result"]
```

## Provider flow

```mermaid
flowchart LR
  A["Publish service card"] --> B["Attach validated discovery metadata"]
  B -. "future Testnet" .-> C["Receive first valid x402 payment"]
  C -.-> D["Indexed with validation outcome"]
  B -->|"current MVP"| E["Local reference listing"]
```

## Run locally

Para reproducir el flujo x402 exact validado exclusivamente en Stellar Testnet, consulta [docs/DEMO_TESTNET.md](docs/DEMO_TESTNET.md). El sitio público actual sigue siendo el MVP de discovery; esta rama no está desplegada en producción.

The external-provider sprint adds a truthful contract-only record for the independent Quote repository and a real read-only MCP discovery endpoint. See [external E2E evidence](docs/EXTERNAL_PROVIDER_E2E.md) and [MCP capabilities](docs/MCP_DISCOVERY.md). It does not claim the standalone provider is deployed or x402-enabled.

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The working service is at `/resources/swap-risk-quote`; its endpoint is:

```text
GET /api/reference/swap-risk?pair=XLM%2FUSDC&amount=2500&side=buy
```

Providers can open `/publish` to create a local, non-indexed draft. They retain pricing, payment destination, service terms, and responsibility for delivering results. Automatic indexing is future work and will require a valid x402 discovery extension—not a form submission.

Discovery examples:

```text
GET /api/discovery/resources?kind=http&scheme=exact&maxPrice=0.03
GET /api/discovery/search?query=riesgo%20swap&kind=http
```

Validation:

```bash
npm run typecheck
npm run build
```

## Security and trust boundaries

- Bazaar does not custody funds or maintain buyer balances.
- Bazaar never signs payment authorizations; consent belongs to the buyer client/wallet.
- Bazaar exposes metadata but does not enforce buyer allowlists, budgets, or approval policy.
- The current endpoint is deterministic, read-only, bounded, and informational—not financial advice.
- No secrets or environment configuration are required for this MVP.
- Real payment claims require conformance evidence; production/pubnet claims additionally require security review and audit.
- OpenZeppelin Relayer/plugin AGPL code is not a code or dependency base for this project.

## Roadmap

1. **Current:** discovery UI, catalogue contracts, deterministic local Swap Risk Quote.
2. **Next:** `exact` payment on `stellar:testnet` using an existing facilitator and `@x402/stellar`; USDC default.
3. **Discovery hardening:** validated PaymentPayload extension, route-template integrity, evaluated search/ranking, deterministic extension outcomes, HTTP + MCP helpers.
4. **Facilitator:** permissively licensed self-hostable `/verify`, `/settle`, `/supported` only after auth-entry security and conformance work.
5. **Later:** Stellar `upto`, any SEP-41 token, pubnet, operational readiness, external audit, and upstream contribution.

## Documentation

- [Project bible](docs/PROJECT_BIBLE.md)
- [RFP coverage matrix](docs/RFP_COVERAGE.md)
- [Architecture diagrams](docs/ARCHITECTURE.md)
- [Proposal outline](docs/PROPOSAL_OUTLINE.md)
- [Discovery contract draft](docs/DISCOVERY_CONTRACT.md)
- [MCP discovery surface](docs/MCP_DISCOVERY.md)

## Deployment

The public MVP is deployed at [https://stellar-bazaar-x402.vercel.app](https://stellar-bazaar-x402.vercel.app) and connected to this GitHub repository. Production deployments track the repository through Vercel Git integration. You can also run the exact project locally using the steps above.

## License

Project code and original documentation are licensed under [Apache-2.0](LICENSE). Dependencies retain their respective licenses.
