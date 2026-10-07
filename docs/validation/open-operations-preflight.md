# Current operations preflight

Observed **2026-10-07 04:46:30 UTC**. This is a bounded read-only check of `stellar-bazaar-x402` (`prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3`) in `cabscryptocontacto-6028s-projects` (`team_XjolcoWJ9V9yamVnCdpC7EMY`). Authentication and target identity matched. The matching existing local link is in `mission-consolidation/.vercel/project.json`.

The current project uses **Next.js and Node.js 24.x**. Both `bazaar.browns.studio` and `stellar-bazaar-x402.vercel.app` are verified project domains with no configured redirect. Vercel authentication protection is `all_except_custom_domains`; therefore the custom domain is outside that protection setting. Password protection and trusted IP restrictions are absent. These settings do not prove application authorization or public HTTP behavior; no application endpoint was requested.

The production and preview targets returned `READY`. Their current deployment IDs are `dpl_5rbJydG46d3EaTdWFaCkspPrqems` and `dpl_CvyfxEvehFrN1rZhqV2nmcYrrjsR`. No deployment, alias or project setting was changed.

## Vercel billing

The team has an **active Pro plan**, no trial, and a **$20 included allocation**. Its subscription period is September 21 through October 21, 2026, with boundaries at 07:00 UTC. The usage query used CLI dates September 21 through October 7; the CLI interprets these as Los Angeles day boundaries and returned a window ending October 8 at 07:00 UTC. The figures are the data available when queried.

| Counter | Returned value |
| --- | ---: |
| Team effective cost, including subscription | $30.0440609996 |
| Pro subscription effective cost | $11.3333333333 |
| Build CPU effective cost | $15.918 |
| Billed cost | $0.000000001041, approximately zero at floating-point precision |
| Charge records | 40,664 |
| Effective infrastructure cost by subtraction | $18.7107276663 |
| Arithmetic estimated credit headroom | $1.2892723337 |
| Exact live credit remaining | **Unknown** |
| General spend hard cap | **Unknown** |

The headroom estimate is `$20 - (total effective cost - Pro effective cost)`. It is an inference from selected counters, not a live credit ledger. Effective costs include resources with their own allocations. Vercel's [Pro billing documentation](https://vercel.com/docs/plans/pro-plan) explains that credit applies after each resource's included allocation. The estimate and near-zero billed cost cannot confirm a zero-additional-cost margin for a new deployment or open traffic. The counters are team-wide and shared by other projects.

The parent subsequently read the existing authenticated [Vercel Usage dashboard](https://vercel.com/cabscryptocontacto-6028s-projects/~/usage) on October 7. It displays Included Credit **$18.72/$20.00**, infrastructure subtotal **$18.72**, credits applied **-$18.72**, and total **$20.00** for the subscription. Displayed credit remaining is $1.28; the conservatively rounded lower bound is **$1.27**, leaving **$0.635** in the half available for allocation before deployment/artifact and shared-consumption allowances. The dashboard says usage can lag by one hour. This current dashboard evidence supersedes the earlier arithmetic estimate for planning, while full unrounded balance and future shared consumption remain uncertain. A bounded request count still needs a compute, memory, duration, proxy and artifact-cost derivation.

## Redis

The project's Marketplace resource list returned zero resources. This does not establish that its separately configured Redis databases do not exist.

Current environment metadata confirms generic Redis and review Redis URL/token variables for production, plus dedicated workspace and review variables for preview. The Redis variables are sensitive. Dedicated workspace Redis variables were absent from the production environment pull. Variable presence does not prove the deployed backend mode or the project-to-database mapping.

The authorized production pull used `scripts/history-private-files.mjs` to create an ACL-exclusive temporary directory outside the checkout. Only selected Redis configuration was parsed in process. No candidate passed strict HTTPS Upstash endpoint validation, so dispatch stopped before a Redis `INFO` request. The temporary environment file and directory were removed. The installed CLI guidance states that sensitive values cannot be read later. No secret values, raw environment payloads, wallets or private packets were printed or committed.

The parent task subsequently inspected the existing authenticated [Upstash Details dashboard](https://console.upstash.com/redis/1f90faef-48d7-49b3-916a-c378e13a8c23/details?teamid=0) read-only on October 7. It confirms database `bazaar-validacion-20261001`, ID `1f90faef-48d7-49b3-916a-c378e13a8c23`, hostname `smooth-dory-323957.upstash.io`, Free Tier and $0.00 displayed cost. The dashboard reports 4.2k/500k monthly commands; writes 1,408 plus reads 2,766 total 4,174. It reports 7 MB/10 GB bandwidth and 51 KB/256 MB storage.

Conservative upper bounds for used quantities are 4,200 commands, 8 MiB bandwidth and 52 KiB storage. Using decimal lower bounds for displayed capacities leaves at least **495,800 commands**, **9,991,611,392 bandwidth bytes** and **255,946,752 storage bytes** at the observation time. These are current snapshot bounds, not guaranteed future balances. The existing preview Redis URL must match this hostname; the production dedicated workspace mapping remains unconfirmed. A Redis `INFO` request would establish memory/lifetime counters only and was not needed or dispatched.

The immutable [October 4 snapshot](../evidence/sprint-marketplace/usdc-redis-free-margin.json) reports database `1f90faef-48d7-49b3-916a-c378e13a8c23`, Free Tier, $0 cost, approximately 2.3k/500k monthly commands, 2 MB/10 GB bandwidth and 12 KB/256 MB storage. These rounded historical values are **not current margin evidence** and were not reused to authorize operations.

## Result

Project/domain/protection/runtime facts, Redis quota snapshot and displayed Vercel credit usage are current. Vercel's snapshot is rounded, shared and delayed; dedicated production workspace mapping and compute/request-cost derivation remain unconfirmed. The preflight does not confirm a perpetual zero-additional-cost margin or provide a complete activation checkpoint.

There were **zero remote mutations, deployments, alias changes, protection changes, resources provisioned, Redis requests, application-data requests, provider invocations or payments**. Historical evidence was left unchanged. The machine-readable fields and source commands are in [open-operations-preflight.json](open-operations-preflight.json).
