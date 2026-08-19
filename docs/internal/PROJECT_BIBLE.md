> **INTERNAL** — historical/aspirational document. Not user-facing; see README.md for current guides.
> **INTERNO** — documento histórico/aspiracional. No dirigido a usuarios; ver README.md para las guías actuales.

# Project Bible — Stellar Bazaar x402

## 1. Tesis de producto

El Bazaar es la capa de descubrimiento para servicios pagos sobre x402 en Stellar. Responde “¿qué endpoint o herramienta puede resolver esta tarea, bajo qué precio y contrato?” y devuelve recursos invocables. No responde “¿qué persona o agente debo contratar?”.

El índice es offchain por defecto para mantener búsquedas económicas, rápidas y corregibles. La evidencia de pago y settlement vive en el flujo x402/Stellar; el catálogo no debe convertirse en fuente de verdad financiera.

## 2. Dos horizontes, sin confundirlos

### Producto ideal terminado

- Facilitador permisivamente licenciado y self-hostable para `stellar:testnet` y `stellar:pubnet`.
- Basado en Apache-2.0 `@x402/stellar`; consume su verificación y settlement, no los reimplementa.
- `/verify`, `/settle`, `/supported`; no custodial; fee sponsorship explícito.
- Comprobación estricta de Soroban authorization entries, asset/amount/network/recipient/expiry y prevención de replay.
- Cualquier token SEP-41, con USDC como default de experiencia, no como hardcode.
- Esquemas `exact` y un futuro esquema Stellar `upto` alineado y contribuido upstream.
- Descubrimiento HTTP + MCP, catálogo automático validado, helpers seller/buyer, conformance suite y operación observable.
- Auditoría externa y claims públicos limitados a evidencia reproducible.

### Instawards POC realista — 30 días

El entregable honesto es una demostración de la capa de descubrimiento: catálogo/search mock, contrato de extensión, ranking evaluable, validación de route templates, errores deterministas, UX completa simulada y plan de integración testnet. Si el tiempo y dependencias upstream lo permiten, el stretch goal es una ruta `exact` en testnet usando un facilitador existente. El POC no promete facilitador propio, pubnet, auditoría ni seguridad production-grade.

## 3. Usuarios y jobs-to-be-done

- **Buyer developer:** encontrar una API pagada compatible, inspeccionar contrato/precio y generar una llamada reproducible.
- **Agente/MCP client:** buscar por intención, recibir candidatos estructurados y ejecutar una herramienta con fallos deterministas.
- **Seller developer:** publicar metadata válida junto a su PaymentPayload y verificar cómo se cataloga.
- **Operator/reviewer:** auditar procedencia, health, conformance y outcomes de catalogación.
- **Carmelita (futuro cliente):** consumir discovery; mantiene fuera de este proyecto identidad, confianza y orquestación multichain.

## 4. Arquitectura de referencia

1. Sellers exponen recursos x402 y una discovery extension versionada.
2. Ingest valida firma/procedencia cuando aplique, schema, network, payment scheme y `routeTemplate`.
3. Un índice offchain conserva versiones, timestamps, estado y motivos de rechazo.
4. `/discovery/resources` aplica filtros deterministas.
5. `/discovery/search` combina retrieval lexical/semantic, señales de integridad y cursor estable; puede entregar `partialResults`.
6. Buyer/MCP client selecciona un recurso y realiza la llamada x402.
7. Facilitator valida/autorizaciones y liquida con `@x402/stellar`; Bazaar observa outcomes, no custodia fondos.

Ver diagramas en [ARCHITECTURE.md](ARCHITECTURE.md).

## 5. Diseño de discovery

### Recursos y filtros

`GET /discovery/resources` debería admitir `kind`, `network`, `scheme`, `asset`, `provider`, `tag`, `maxAmount`, `status`, `cursor` y `limit`. El cursor es opaco y estable dentro de una versión de índice.

### Búsqueda natural

`GET /discovery/search?query=...&cursor=...` retorna `results`, `nextCursor`, `partialResults`, `rankingVersion` y diagnósticos no sensibles. Ranking inicial evaluable:

`score = 0.40 intentMatch + 0.20 schemaQuality + 0.15 integrity + 0.10 freshness + 0.10 availability + 0.05 priceFit`

Precio nunca domina relevancia. La evaluación usa un golden set versionado con NDCG@10, Recall@10, MRR y tasa de resultados inválidos. Señales pagadas o manipulables no deben convertirse en relevancia oculta.

### Catalogación automática

Sólo se ingiere metadata de una discovery extension validada en el `PaymentPayload`. `routeTemplate` debe ser relativo o pertenecer al origen declarado, usar parámetros permitidos, impedir traversal/credentials/fragments y corresponder a un payment requirement observable. Cada intento produce un outcome `EXTENSION-RESPONSES`: `accepted`, `accepted_with_warnings`, `rejected` o `quarantined`, con códigos estables y sin filtrar secretos.

## 6. MCP discovery server

Herramientas futuras:

- `search_paid_services(query, filters, cursor)` → candidatos estructurados.
- `get_paid_service(resourceId)` → contrato y requisitos.
- `call_paid_service(resourceId, input, authorization)` → quote/payment/call; nunca firma sin consentimiento del host.

Errores: `{ code, message, retryable, stage, details? }`. Códigos sugeridos: `INVALID_QUERY`, `RESOURCE_NOT_FOUND`, `QUOTE_CHANGED`, `AUTH_REQUIRED`, `PAYMENT_REJECTED`, `SETTLEMENT_PENDING`, `UPSTREAM_TIMEOUT`, `PARTIAL_RESULTS`. Un mismo fallo debe mapear igual en HTTP y MCP.

## 7. Threat model

| Amenaza | Impacto | Control previsto |
|---|---|---|
| Metadata/routeTemplate malicioso | SSRF, phishing, llamadas inesperadas | allowlist de esquemas, origin binding, canonicalización, no redirects en ingest |
| Auth entry demasiado amplia | gasto/token/contrato no autorizado | comparación estricta de invocation tree, token, amount, recipient, nonce, expiry y network |
| Replay / settlement duplicado | doble pago o estado ambiguo | idempotency keys, replay store, ledger bounds, hashes de payload |
| Sybil/spam de catálogo | ranking degradado | cuotas, provenance, health signals, quarantine; no pay-to-rank oculto |
| Manipulación de ranking | servicio inseguro promovido | ranking versionado, golden set, explanations y métricas públicas |
| Quote cambia tras autorización | cobro no consentido | binding quote→authorization, expiración corta, `QUOTE_CHANGED` |
| Fee sponsorship abusado | drenaje del sponsor | budgets por seller/route, simulations, límites y circuit breaker |
| Token engañoso | pago en asset incorrecto | issuer+contract ID explícitos; allowlists UI; USDC sólo default |
| Fuga de queries/inputs | privacidad/competencia | minimización, retención corta, redacción, opt-out de telemetry |
| Dependencia/facilitator comprometido | pagos o disponibilidad | pinning/SBOM, separación de roles, multi-operator readiness |

El POC sólo demuestra controles de interfaz y validaciones locales; no prueba controles criptográficos.

## 8. Privacidad y compliance

- No indexar perfiles personales ni inferir identidad de compradores.
- Guardar sólo queries agregadas/redactadas necesarias para evaluar search; ofrecer modo sin logs.
- No registrar PaymentPayload completo, firmas, inputs MCP sensibles ni headers de autorización.
- Definir retención, borrado, acceso y región antes de operar públicamente.
- Los sellers responden por legalidad de servicios y datos; el Bazaar necesita takedown, provenance y política de contenido.
- Servicios DeFi presentan datos/estimaciones, no asesoramiento; jurisdicción, sanctions screening y obligaciones específicas requieren counsel antes de pubnet.

## 9. Conformance y evidencia

Una suite futura debe ejecutar fixtures positivos/negativos contra facilitator y SDK:

- Protocol: `/verify`, `/settle`, `/supported`, content types, status/error mapping e idempotencia.
- Stellar: exact amount, `upto`, SEP-41 variants, decimals, issuer/contract, testnet/pubnet passphrase.
- Soroban: invocation tree exacto, expiration ledger, signer, nonce, fee sponsor y mutation tests.
- Discovery: extension schema, routeTemplate, duplicate/version/conflict, EXTENSION-RESPONSES.
- MCP: schemas, deterministic errors, cancellation/timeouts y no firma implícita.

Cada claim se vincula a commit, test vector, transcript/redacted ledger explorer evidence y versión upstream. Compatibilidad no se declara hasta pasar esos gates.

## 10. Roadmap de 30 días

- **Días 1–5:** contrato discovery, arquitectura, fixtures, UX y matriz RFP.
- **Días 6–12:** endpoints mock, filtros, search/ranking baseline, validators y golden queries.
- **Días 13–18:** MCP discovery mock, helpers y errores compartidos; demo end-to-end simulada.
- **Días 19–24:** conformance harness skeleton, threat-model review, observability plan.
- **Días 25–30:** evidencia, video/demo, proposal; stretch: `exact` testnet con facilitator existente.

Milestone posterior 1: integración real testnet exact. Milestone 2: discovery hardened + MCP. Milestone 3: facilitator self-hostable tras security/conformance. Milestone 4: `upto`, pubnet, audit y operational readiness.

## 11. Riesgos y decisiones

- **Spec/upstream cambia:** adapters finos, versiones explícitas y tests contra release pinneado.
- **`upto` no estandarizado:** mantener experimental y no afirmar compatibilidad hasta aceptación upstream.
- **Scope de 30 días:** discovery es el núcleo; facilitator propio queda fuera.
- **Search sin corpus suficiente:** publicar golden set y admitir límites; `partialResults` hace degradación visible.
- **Economía de sponsor:** presupuestos y rate limits antes de operación real.
- **Licencias:** Apache-2.0 para lo propio; inventario/SBOM y revisión de cada dependencia. OpenZeppelin Relayer/plugin es AGPL y no será base, dependencia ni fuente copiada.

## 12. Operación y sostenibilidad

El índice base puede ser gratuito y self-hostable. Opciones sostenibles sin corromper ranking: hosted index con SLA, analytics opt-in para sellers, verificación operativa claramente etiquetada y soporte empresarial. Patrocinios deben ser visibles y jamás mezclarse con relevancia orgánica. SLOs, runbooks, backup/restore, incident response, key rotation, cost caps y on-call son prerequisitos para “production”.

## 13. Definición de éxito

POC: un reviewer entiende en menos de tres minutos qué se indexa, encuentra un servicio HTTP/MCP, ve por qué rankea y completa el flujo mock sin confundirlo con pago real. Producto: conformance reproducible, settlement real auditado, catálogo íntegro y búsqueda medida, con claims respaldados por evidencia.
