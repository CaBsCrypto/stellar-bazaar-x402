> **INTERNAL** — historical/aspirational document. Not user-facing; see README.md for current guides.
> **INTERNO** — documento histórico/aspiracional. No dirigido a usuarios; ver README.md para las guías actuales.

# Matriz de cobertura del RFP

Leyenda: **POC** significa evidencia simulada/local; nunca producción.

| Requisito | Prueba en este MVP | Milestone posterior | Evidencia exigida |
|---|---|---|---|
| Bazaar Stellar-native de servicios pagos | Catálogo HTTP/MCP y narrativa | Índice real versionado | Demo + fixtures + API transcripts |
| `GET /discovery/resources` filtros | Modelo y filtros UI/locales | Endpoint durable/cursor | Contract tests y OpenAPI |
| `GET /discovery/search` NL/cursor/partial | Search mock; diseño de respuesta | Retrieval + cursor + degradación | Golden set, NDCG/Recall/MRR |
| Ranking evaluado | Fórmula y plan | Benchmark reproducible | Dataset/version/report |
| Catalogación desde PaymentPayload extension | Contrato y outcomes documentados | Ingest/validation real | Positive/negative fixtures |
| Integridad y routeTemplate | Reglas propuestas | Validator hardened | Fuzz/property/SSRF tests |
| EXTENSION-RESPONSES | Outcomes/códigos definidos | Interop upstream | Conformance vectors |
| Spec upkeep/upstream | Versionado y roadmap | PRs/discusión upstream | Links/commits; no claim previo |
| Helpers seller/buyer | Interfaces planeadas | Packages Apache-2.0 | Typed examples/tests |
| Índice offchain default | Arquitectura documentada | Storage/replication | Schema/runbook/backup test |
| MCP search y paid-call | Recursos MCP mock | Server real | MCP inspector tests |
| Errores deterministas | Taxonomía compartida | Mapping HTTP/MCP | Snapshot/contract tests |
| `@x402/stellar` Apache-2.0 | Integración explícitamente ausente | Consumir, no reimplementar | Dependency pin + upstream tests |
| `/verify` `/settle` `/supported` | Sólo diagrama/plan | Facilitator self-hostable | Conformance suite + API evidence |
| Testnet + pubnet | No conectado | testnet primero; pubnet gated | Explorer tx + network configs |
| Soroban auth strict | Threat model | Exact invocation-tree checks | Mutation/adversarial tests + audit |
| Fee sponsorship | Riesgo/controles | Sponsor policies/budgets | Simulation, abuse tests, runbook |
| No custodial | Boundary documentado | Arquitectura de claves no custodial | Audit + data-flow review |
| SEP-41; USDC default | Fixtures rotulados | Asset abstraction | Multi-token conformance |
| `exact` + Stellar `upto` | `exact`/`upto` como metadata mock | exact testnet; upto experimental/upstream | Test vectors + acceptance upstream |
| APIs HTTP + MCP | Ambos visibles en catálogo | Ambos end-to-end | Demos y conformance |
| Operational readiness | Checklist de riesgos | SLO/metrics/on-call/DR | Game days + dashboards |
| Auditoría | Ninguna; disclaimer visible | Auditoría externa antes de claims | Reporte público y remediation |
| Docs y ejemplos | README/bible/demo | SDK guides/runbooks | Versioned docs CI |
| Licencia permisiva | Apache-2.0 | SBOM/licensing gate | LICENSE/NOTICE/scans |
| No base AGPL | No código OZ/AGPL | Mantener policy | Dependency/license audit |
