# QA HTTPS de proveedores piloto / Pilot provider HTTPS QA

Fecha de validación / Validation date: **2026-08-22**

Este informe es evidencia puntual para la vitrina del Bazaar. `HTTPS verified` sólo significa que el deployment público respondió con el contrato esperado durante esta ejecución. No certifica al proveedor, no mide reputación o seguridad, no promete disponibilidad futura y no activa pagos.

This report is point-in-time evidence for the Bazaar showcase. `HTTPS verified` only means that the public deployment returned the expected contract during this run. It does not certify the provider, infer reputation or security, promise future availability, or activate payments.

## Criterios / Criteria

- URL `https://` pública, sin redirección a un host distinto del proveedor.
- `GET /` y `GET /health` respondieron `200` con JSON de identidad/estado.
- El repositorio público y el deployment pertenecen al mismo proveedor declarado.
- Para endpoints fixture invocables se hizo una llamada mínima con `example.com` o evidencia aportada por el caller; se exigió `200` JSON y ausencia de headers x402.
- Para contratos `discovery-only` no se intentaron mutaciones ni ejecución inexistente.
- Ninguna llamada usó secretos, wallets, pagos, Mainnet o datos personales.

## Resultado / Result

| Provider | Source commit | Deployment | QA surface | Honest status | Payment |
|---|---|---|---|---|---|
| Website Intelligence | `7299d04` | <https://website-intelligence-provider.vercel.app> | `/`, `/health`, `/v1/service-card`, `POST /v1/audits` → 200 JSON | fixture-live | inactive |
| Campaign Creator | `2a39053` | <https://campaign-creator-provider.vercel.app> | `/`, `/health`, `POST /api/campaign` → 200 JSON | fixture-live | inactive |
| Research Scout | `4313c37` | <https://research-scout-provider.vercel.app> | `/`, `/health`, `POST /v1/research` → 200 JSON | fixture-live | inactive |
| Video Repurpose | `294335e` | <https://video-repurpose-provider.vercel.app> | `/`, `/health` → 200 JSON | discovery-only; no durable public jobs | inactive |
| Design Brief | `8aebc91` | <https://design-brief-provider.vercel.app> | `/`, `/health`, `POST /api` → 200 JSON | fixture-live | inactive |
| Brand Identity Studio | `ce8ada8` | <https://brand-identity-studio-provider.vercel.app> | `/`, `/health` → 200 JSON | discovery-only; fixture workflow | inactive |

Los cuerpos de respuesta se comprobaron por forma y marcadores públicos; el informe no almacena payloads de usuario. Las Service Cards en `lib/pilot-cards.ts` fijan los commits completos, URLs, método/ruta y estado observado.

Response bodies were checked for shape and public markers; this report stores no user payloads. The Service Cards in `lib/pilot-cards.ts` pin full commits, URLs, method/path, and observed status.

## Límites / Limitations

- Website Intelligence no hace fetch del sitio; audita fixtures locales.
- Research Scout sintetiza sólo extractos aportados por el caller; no verifica fuentes en vivo.
- Design Brief trata la URL como metadata y no la visita.
- Video Repurpose y Brand Identity exponen discovery/health, no procesamiento externo ni almacenamiento durable.
- Campaign Creator es un generador determinista basado en fixture.
- Ninguno de los seis endpoints anuncia o exige x402 en esta integración; no se publica precio hasta que lo declare y active cada provider.
