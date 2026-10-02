$ErrorActionPreference = 'Stop'
$taskNode = 'C:\Users\MGC\AppData\Local\Temp\bazaar-node22-review\node.exe'
$taskCli = Join-Path $env:TEMP 'bazaar-vercel-cli-preview\node_modules\vercel\dist\index.js'
$taskAuthDir = Join-Path $env:TEMP 'bazaar-vercel-auth-preview'
$env:VERCEL_TELEMETRY_DISABLED = '1'
$taskFlags = [ordered]@{
 NEXT_PUBLIC_BAZAAR_MARKETPLACE='true'
 BAZAAR_ENABLE_OPEN_WORKSPACES='false'
 BAZAAR_ENABLE_MARKETPLACE='false'
 BAZAAR_ENABLE_MARKET_PURCHASES='false'
 BAZAAR_WORKSPACE_ADMISSION='invite-only'
 BAZAAR_WORKSPACE_PUBLIC_ORIGIN='vercel-preview'
 BAZAAR_ENABLE_SELF_LISTING_INTAKE='false'
 BAZAAR_ENABLE_PROVIDER_REVIEW_ADMIN='false'
 BAZAAR_ENABLE_PUBLIC_PROVIDER_REVIEW='false'
 BAZAAR_ENABLE_PROVIDER_ACTIVATION='false'
 BAZAAR_ENABLE_REGISTRY_MUTATIONS='false'
 X402_PILOT_PAYMENTS_ENABLED='false'
 X402_LEGACY_PAYMENTS_ENABLED='false'
 X402_ENABLE_LOCAL_PAYER='false'
 NEXT_PUBLIC_X402_XLM_PILOT='false'
 BAZAAR_WORKSPACE_REDIS_REST_URL=''
 BAZAAR_WORKSPACE_REDIS_REST_TOKEN=''
 BAZAAR_REVIEW_REDIS_REST_URL=''
 BAZAAR_REVIEW_REDIS_REST_TOKEN=''
 UPSTASH_REDIS_REST_URL=''
 UPSTASH_REDIS_REST_TOKEN=''
}
$taskSha = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) {throw 'SOURCE_SHA_UNAVAILABLE'}
$taskAudit = Get-Content -Raw -LiteralPath docs/evidence/sprint-marketplace/vercel-preview-upload-audit.json | ConvertFrom-Json
$taskManifest = [ordered]@{
 phase='closed-preview'; sourceSha=$taskSha; projectId='prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3'; teamId='team_XjolcoWJ9V9yamVnCdpC7EMY'
 uploadFingerprint=$taskAudit.payloadFingerprint; fileCount=$taskAudit.fileCount; bytes=$taskAudit.totalBytes
 effects=@{deploymentCreates=1;productionChanges=0;redisRequests=0;redisKeys=@();payments=0;invitations=0;protectionChanges=0}
 limits=@{deploymentCreates=1;statusReads=6;httpChecks=8;httpTimeoutSeconds=12;httpRetries=0}
 flags=$taskFlags
}
$taskManifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath docs/evidence/sprint-marketplace/closed-preview-manifest.json -Encoding utf8
& $taskNode docs/evidence/sprint-marketplace/audit-preview-upload.mjs
if ($LASTEXITCODE -ne 0) {throw 'UPLOAD_AUDIT_FAILED'}
$taskArgs = @($taskCli,'deploy','--project','prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3','--scope','cabscryptocontacto-6028s-projects','--global-config',$taskAuthDir,'--yes','--no-wait','--json')
foreach ($taskFlag in $taskFlags.GetEnumerator()) {
 $taskArgs += @('--env',($taskFlag.Key+'='+$taskFlag.Value),'--build-env',($taskFlag.Key+'='+$taskFlag.Value))
}
& $taskNode @taskArgs | Set-Content -LiteralPath docs/evidence/sprint-marketplace/closed-preview-create.json -Encoding utf8
if ($LASTEXITCODE -ne 0) {throw 'DEPLOYMENT_CREATION_UNCONFIRMED_DO_NOT_RETRY'}
Write-Output 'Preview creation response saved. Read its deployment ID before any follow-up.'
