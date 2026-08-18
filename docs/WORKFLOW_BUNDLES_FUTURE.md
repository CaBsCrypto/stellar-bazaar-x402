# Paquetes de capacidades / Workflow Bundles (future spec)

Status: **schema + read-only fixtures implemented (2026-08-18)**. No runner, execution or payment exists.

## Estado implementado / Implemented state

- JSON Schema TypeScript `bazaar.workflow-bundle/v1` en `lib/workflow-bundle.ts` con 15 reglas de conformance deterministas: version, id estable, services únicos/conocidos, stages secuenciales 0..n-1, detección de ciclos en handoff, approval gates con efecto, artifacts válidos, handoff artifact, precio por proveedor con asset/network/scheme/monto válidos y estados reconocidos.
- Dos fixtures read-only en `lib/workflow-bundles.ts`: `brand-identity-bundle` (3 etapas con approval gate en la etapa 1) y `campaign-launch-bundle` (2 etapas).
- Superficie MCP read-only: `list_workflow_bundles` y `get_workflow_bundle` (conformance incluida, `execution:false`).
- Suite `npm run test:workflow:bundle`: 2 fixtures conformantes + 13 casos negativos (ciclo, capacidad fantasma, servicio desconocido, duplicados, órdenes no secuenciales, assets mixtos, scheme inválido, monto con precisión excesiva, media type malformado, pubnet, estado desconocido, approval gate sin efecto, versión antigua) + envelope `BUNDLE_NOT_FOUND`.
- Límites respetados: sin runner, sin fetch de URLs arbitrarias, sin firma, sin wallet, sin escrow, sin pago multi-servicio; metadata de proveedores no confiable.

## Propósito / Purpose

Un `Workflow Bundle` representa un objetivo que puede requerir varias capacidades publicadas. Es una composición de service cards y resultados intermedios, no un perfil de agente, empleo, marketplace de freelancers ni contrato de escrow.

A `Workflow Bundle` represents an objective that may require several published capabilities. It composes service cards and intermediate artifacts; it is not an agent profile, employment relationship, freelancer marketplace, or escrow contract.

## Modelo propuesto / Proposed model

- `version`: identificador estable del schema, por ejemplo `bazaar.workflow-bundle/v1`.
- `id`, `title.es`, `title.en`, `objective.es`, `objective.en`: identidad y objetivo legibles.
- `services[]`: referencias versionadas a service cards; nunca código copiado ni URLs arbitrarias.
- `stages[]`: orden, capability requerida, input esperado, output artifact y estado.
- `handoffArtifact`: tipo, media type, schema/version y reglas mínimas de integridad para pasar un resultado a la etapa siguiente.
- `approvalGate` opcional: etapa donde un comprador o su agente debe aprobar explícitamente antes de continuar. Bazaar no firma ni aprueba por ellos.
- `aggregatePrice`: desglose por proveedor, asset/network/scheme, total calculable y estado (`estimate`, `quoted`, `partially-paid`, `paid`). Una estimación nunca se presenta como cobro.
- `status`: estado agregado derivado de las etapas (`draft`, `ready`, `running`, `awaiting-approval`, `partial`, `complete`, `failed`).
- `policy`: campos para allowlists, presupuesto, expiración y tratamiento de artifacts que el cliente debe evaluar fuera de Bazaar.

## Ejemplo: Identidad de marca / Brand Identity

Objetivo: producir una base de identidad visual verificable a partir de evidencia y decisiones explícitas.

1. **Estrategia e investigación / Strategy and research** — un Research Scout genera un artifact de fuentes, audiencia y posicionamiento.
2. **Brief** — Design Brief transforma esa evidencia en un brief bilingüe y versionado.
3. **Aprobación opcional / Optional approval** — el comprador revisa el brief; Bazaar solo expone que el gate está pendiente o aprobado.
4. **Visuales / Visual output** — capacidades separadas producen propuestas de logo, portada y sistema visual usando el brief aprobado.
5. **Handoff final** — un manifest referencia artifacts, versiones, proveedores y estados; no implica que Bazaar sea autor, empleador o custodio.

El precio agregado mostraría cada precio declarado por el proveedor y el total por asset/red. No combinaría assets incompatibles ni ocultaría pagos parciales, fallidos o todavía no autorizados.

## Límites P0 / P0 boundaries

- Discovery remains read-only: search, inspect, validate metadata, and report current capability/payment status.
- No generic workflow runner, arbitrary URL fetcher, signing, wallet, custody, escrow, automatic approval, or multi-service settlement.
- No claim that a bundle is executable until every provider endpoint, contract, payment requirement, artifact schema, and negative path is independently verified.
- Provider metadata remains untrusted data. A bundle does not certify quality, safety, reputation, or completion.
- Any future execution must be isolated behind explicit buyer policy, consent, deterministic errors, idempotency/replay controls, and receipt reconciliation.

## Ruta futura / Future path

1. Define JSON Schema and conformance outcomes for bundles and handoff artifacts.
2. Add read-only catalogue/search representation and fixture-only examples.
3. Build local tests for missing stages, cycles, incompatible assets/networks, malformed artifacts, stale versions, and approval-gate bypass.
4. Validate one provider-owned, non-paid local composition.
5. Only after security and x402 conformance review, consider a separately scoped manual Testnet execution experiment.
