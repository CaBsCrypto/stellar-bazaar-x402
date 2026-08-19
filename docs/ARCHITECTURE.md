# Arquitectura y flujos

## Producto objetivo

```mermaid
flowchart LR
  S["Seller HTTP API / MCP tool"] -->|"PaymentPayload + discovery extension"| I["Ingest + schema / routeTemplate validator"]
  I -->|"accepted / warning / rejected / quarantined"| X["Offchain versioned index"]
  B["Buyer or Carmelita as client"] --> D["Discovery API / MCP server"]
  D --> X
  B -->|"paid request"| S
  S -->|"402 payment requirements"| B
  B -->|"signed authorization"| F["x402 Stellar facilitator"]
  F -->|"verify / settle via @x402/stellar"| L["Stellar testnet / pubnet"]
  F -->|"structured outcome"| S
  S -->|"service result"| B
```

El Bazaar no firma ni custodia fondos. El facilitator es un límite separado; `@x402/stellar` conserva la responsabilidad protocolaria de verify/settle.

## Flujo x402 implementado (Testnet)

```mermaid
sequenceDiagram
  participant B as Buyer / agent (server-only)
  participant S as Resource server (Bazaar)
  participant F as Facilitador alojado (OpenZeppelin, Testnet)
  B->>S: GET /api/x402/swap-risk (sin firma)
  S-->>B: HTTP 402 + PAYMENT-REQUIRED (x402 v2 exact)
  B->>B: Firma auth entry Ed25519 con @x402/stellar (server-only)
  B->>S: Reintento con PAYMENT-SIGNATURE
  S->>F: verify / settle (@x402/stellar)
  F-->>S: Settlement confirmado en ledger
  S-->>B: HTTP 200 + PAYMENT-RESPONSE + quote determinista
```

Flujo verificado en Testnet: 3 settlements confirmados (evidencia en README, ledgers `4212660`/`4214612`/`4214711`). El Bazaar no firma ni custodia fondos: la firma ocurre server-only en el cliente del comprador; verify/settle los ejecuta el facilitador alojado.

## Trust boundaries

```mermaid
flowchart TB
  subgraph Untrusted["Untrusted inputs"]
    M["Seller metadata"]
    Q["Buyer query / MCP input"]
  end
  subgraph Bazaar["Bazaar boundary"]
    V["Validation + quarantine"]
    IDX["Offchain index"]
    R["Retrieval + ranking"]
  end
  subgraph Payment["Payment boundary — IMPLEMENTED (Testnet)"]
    SDK["@x402/stellar"]
    FAC["Non-custodial facilitator"]
    NET["Stellar network"]
  end
  M --> V --> IDX --> R
  Q --> R
  FAC --> SDK --> NET
  R -. "resource metadata only" .-> FAC
```
