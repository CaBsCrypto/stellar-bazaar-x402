# Provider catalog landing plan / Plan de catálogo de providers

## Alcance / Scope

Esta rama añade seis providers externos a una vitrina bilingüe y a las superficies existentes de discovery read-only. No añade llamadas pagadas, firma, custodia, secretos, registro automático ni ejecución arbitraria.

This branch adds six external providers to a bilingual showcase and the existing read-only discovery surfaces. It adds no paid calls, signing, custody, secrets, automatic registration, or arbitrary execution.

## Fuente canónica / Canonical source

Cada `bazaar.pilot-card/v1` en `lib/pilot-cards.ts` fija:

- repositorio público `github.com/CaBsCrypto/<provider>`;
- deployment HTTPS público declarado por el propio repositorio;
- commit completo de `main` observado el 2026-08-22;
- método/ruta expuestos por el contrato público;
- copy bilingüe derivado del README o Service Card del provider.

The exact point-in-time commits and HTTP evidence are recorded in [VERIFIED_PROVIDER_QA.md](VERIFIED_PROVIDER_QA.md).

## Gates de inclusión / Inclusion gates

1. Repositorio y deployment públicos y coherentes.
2. Raíz y health responden `200 application/json` sobre HTTPS.
3. Una operación fixture se valida cuando el deployment realmente la ofrece.
4. `discovery-only` cuando no existe ejecución pública durable.
5. Estado visible `Pilot`/`Fixture`; pago siempre `not-active` y sin precio inventado.
6. Links de repo/deployment, ES/EN completos y metadata tratada como no confiable.
7. Tests locales/CI no dependen de red; el recheck HTTPS es manual y opt-in con `VERIFY_PROVIDER_HTTPS=1`.

## Validación requerida / Required validation

```bash
npm run typecheck
npm run build
npm run test:providers:verified
npm run test:e2e:ecosystem
npm run test:mcp:onboarding
```

Para revalidar raíz y health de los seis deployments sin pagos:

```bash
VERIFY_PROVIDER_HTTPS=1 npm run test:providers:verified
```

En PowerShell: `$env:VERIFY_PROVIDER_HTTPS='1'; npm run test:providers:verified` y luego elimina esa variable de proceso.

## Fuera de alcance / Out of scope

- x402 o precios externos;
- procesamiento real de video o identidad de marca;
- jobs durables, SLA, certificación, reputación o auditoría;
- merge o deployment desde esta rama.
