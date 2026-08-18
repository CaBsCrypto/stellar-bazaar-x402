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

## Flujo demostrado en el POC

```mermaid
sequenceDiagram
  participant U as Reviewer
  participant UI as Local POC
  participant C as Static fixture catalogue
  U->>UI: Search "riesgo swap"
  UI->>C: Filter mock resources
  C-->>UI: Ranked fixture results
  U->>UI: Open service and start demo
  UI-->>U: Quote mock (0.001 USDC)
  U->>UI: Authorize mock
  UI-->>U: Settle mock
  UI-->>U: Fixture call result
  Note over UI,C: No network, wallet, signature or settlement occurs
```

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
  subgraph Payment["Payment boundary — later"]
    SDK["@x402/stellar"]
    FAC["Non-custodial facilitator"]
    NET["Stellar network"]
  end
  M --> V --> IDX --> R
  Q --> R
  FAC --> SDK --> NET
  R -. "resource metadata only" .-> FAC
```
