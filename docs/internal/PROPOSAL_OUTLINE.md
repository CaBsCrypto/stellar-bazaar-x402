> **INTERNAL** — historical/aspirational document. Not user-facing; see README.md for current guides.
> **INTERNO** — documento histórico/aspiracional. No dirigido a usuarios; ver README.md para las guías actuales.

# Outline de propuesta SCF #45 / Instawards

## 1. One-liner

Stellar Bazaar x402 convierte rutas HTTP y herramientas MCP pagadas en un catálogo Stellar-native buscable, interoperable y medible.

## 2. Problema

Los compradores necesitan conocer de antemano proveedores y URLs. Metadata fragmentada, ausencia de búsqueda por intención y validación inconsistente frenan la adopción.

## 3. Solución y diferenciación

Discovery-first: recursos pagos, no perfiles. Índice offchain, ingest desde extensión validada, search evaluado, HTTP + MCP y camino no custodial mediante `@x402/stellar`. Complementa Carmelita como infraestructura consumible.

## 4. Demo Instawards

Catálogo bilingüe, filtros, detalle, DeFi quote de ejemplo y flujo completamente simulado discover→result. Contratos y threat model hacen visible el camino desde mock a testnet.

## 5. Plan de 30 días

Contrato/fixtures → search/ranking → MCP/errors → conformance skeleton/evidence. Stretch: `exact` testnet con facilitator existente.

## 6. Milestones solicitables

1. Discovery POC y evaluación.
2. Integración exact testnet y helpers.
3. MCP + ingest hardened.
4. Facilitator self-hostable tras security/conformance.
5. `upto`, pubnet, audit y operational readiness.

## 7. Impacto y métricas

Tiempo a primer recurso, search success@10, recursos válidos, sellers integrados, conformance pass rate, latencia y fallos deterministas.

## 8. Open source y sostenibilidad

Apache-2.0, self-hostable, upstream-first. Hosted SLA/analytics opt-in como servicios; ranking orgánico separado de patrocinios.

## 9. Riesgos y honestidad

Scope, upstream, seguridad Soroban, sponsor abuse y dataset frío. No claims de producción/mainnet/auditoría antes de evidencia.
