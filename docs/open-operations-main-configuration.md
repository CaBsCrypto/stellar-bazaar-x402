# Main production configuration

The public, secret-free [configuration manifest](validation/open-operations-safe-config.json) recommends the existing `stellar-bazaar-x402` project, Node 24, `https://bazaar.browns.studio` and namespace `pilot-be8432d7255e0a3b0dca564d8aa769a0`. It is a source recommendation, not evidence that remote settings have been applied. Existing protected previews and historical receipt files retain their original configuration and contents.

Runtime uses `BAZAAR_WORKSPACE_ADMISSION=open`, no invite hashes, the explicit route boundary, and both operational switches enabled. `prospectiveFlags` initially pauses workspace creation, service intake/activation and fresh purchases for production acceptance while preserving existing reads and finalization. After the operator has validated current Redis mapping, WAF limits, finite billing checkpoint and acceptance results, `afterAcceptanceOverrides` enables continuous new work. A persisted market pause must also be resolved through its existing authorized control; environment flags do not erase it. No provider or payment is invoked by this manifest.

All three acceptance switches (`BAZAAR_ACCEPTANCE_METER`, `BAZAAR_ACCEPTANCE_SALE`, `BAZAAR_ACCEPTANCE_X402`) are false in every recommended phase. The four acceptance metadata names are removed; their JSON/string values are not boolean switches. The open release retains the technical serialized-byte guards compiled in source. Native legacy payments, public review/admin and generic registry mutation routes remain closed.

Marketplace reviews use only `BAZAAR_WORKSPACE_REDIS_REST_URL/TOKEN` and the existing `BAZAAR_REVIEW_PREFIX`. Missing workspace credentials or a non-Redis review backend fail closed. Marketplace never silently uses `BAZAAR_REVIEW_REDIS_REST_*`, `UPSTASH_*` or `KV_*`; the legacy mode still uses its dedicated review configuration. No review key is renamed and no stored record is rewritten by this wiring change. Private values must be supplied through the existing operator configuration, with the endpoint checked against the current preflight hostname. The manifest contains only variable names and redacted requirements.

For local prebuild, overlay `buildOverrides` on `prospectiveFlags`, omit the names in `buildSecretNamesMustBeAbsent`, omit the private checkpoint/operator configuration and clear generic Redis credentials inherited from the shell. Keep `NEXT_PUBLIC_BAZAAR_MARKETPLACE=true` and the main public origin in build and runtime: client values are embedded at build time. The temporary server feature/operational overrides prevent build-time store effects and must not become the deployment runtime environment. Keep the runtime prefixes and main origin exact; `vercel-preview` is the protected-preview policy, not the main origin. Verify the built client mode and deployed runtime independently before activation.

## Proxy duration

Next.js 16 Proxy executes on Node.js and its public configuration documents a matcher rather than a runtime override. [Next.js Proxy reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).

The installed Next.js 16.3.1 build source emits `/_middleware` with `runtime` and `matchers` but no `maxDuration` in its functions config manifest (`node_modules/next/dist/build/index.js`). Thus an API glob set to 60 seconds and an SSR layout set to 15 seconds do not establish the Node Proxy's timeout. Set the target project's **Settings → Functions → Default Max Duration** to 60 seconds, retaining the API/SSR overrides, then inspect the generated Vercel middleware function configuration and the target project after deployment. Vercel documents the project default separately from per-function settings. [Vercel duration configuration](https://vercel.com/docs/functions/configuring-functions/duration).

The offline helper prints an exact target request plan, or only its JSON body:

```powershell
node scripts/prepare-open-operations-project-timeout.mjs
node scripts/prepare-open-operations-project-timeout.mjs --body > project-timeout.public.json
```

It does not read credentials, call Vercel or write Redis. For the operator's separately authorized configuration step, the prepared API request is PATCH `/v9/projects/prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3?teamId=team_XjolcoWJ9V9yamVnCdpC7EMY` with `{ "resourceConfig": { "functionDefaultTimeout": 60 } }`. The current CLI supports `--method PATCH --input project-timeout.public.json --scope cabscryptocontacto-6028s-projects`; retain its existing authenticated login instead of including a token in a command. This field is documented by the [Vercel update-project API](https://vercel.com/docs/rest-api/projects/update-an-existing-project). Review the current project settings before applying and verify the timeout and other resource settings afterward. The helper intentionally has no apply option.
