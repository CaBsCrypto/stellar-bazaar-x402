$ErrorActionPreference='Stop'
$taskNode='C:\Users\MGC\AppData\Local\Temp\bazaar-node22-review\node.exe'
$taskCli=Join-Path $env:TEMP 'bazaar-vercel-cli-preview\node_modules\vercel\dist\index.js'
$taskAuth=Get-Content -Raw -LiteralPath (Join-Path $env:TEMP 'bazaar-vercel-auth-preview\auth.json') | ConvertFrom-Json
$taskDeploy=Get-Content -Raw -LiteralPath docs/evidence/sprint-marketplace/secret-preview-create.json | ConvertFrom-Json
$taskDirectory=Join-Path $env:TEMP ('bazaar-market-https-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskDirectory | Out-Null
$taskHeaders=Join-Path $taskDirectory 'headers.private.txt'
$taskBody=Join-Path $taskDirectory 'body.txt'
$env:VERCEL_TOKEN=$taskAuth.token
$env:VERCEL_TELEMETRY_DISABLED='1'
$taskResults=@()
try {
 foreach($taskCheck in @(@{path='/pilot';method='GET';expected=200},@{path='/api/market/orders';method='POST';expected=404},@{path='/api/workspaces';method='POST';expected=503},@{path='/';method='GET';expected=307})){
  $taskCurlArgs=@($taskCli,'curl',$taskCheck.path,'--deployment',$taskDeploy.deployment.url,'--','--request',$taskCheck.method,'--max-time','12','--retry','0','--silent','--show-error','--dump-header',$taskHeaders,'--output',$taskBody,'--write-out','%{http_code}')
  if($taskCheck.method -eq 'POST'){$taskCurlArgs+=@('--header','content-type: application/json','--data','{}')}
  $taskStatus=(& $taskNode @taskCurlArgs | Out-String).Trim()
  if($LASTEXITCODE -ne 0){throw 'HTTP_OUTCOME_UNCONFIRMED_DO_NOT_RETRY'}
  if($taskStatus -notmatch '^\d{3}$' -or [int]$taskStatus -ne $taskCheck.expected){throw 'HTTP_STATUS_MISMATCH'}
  $taskSafeHeaders=@(Get-Content -LiteralPath $taskHeaders | Where-Object {$_ -match '^(cache-control|referrer-policy|x-content-type-options|location):'} | ForEach-Object {[string]::Concat($_,'')})
  if(!($taskSafeHeaders -match '^cache-control:.*\bprivate\b.*\bno-store\b')){throw 'PRIVACY_HEADER_MISMATCH'}
  $taskResults+=@{path=$taskCheck.path;method=$taskCheck.method;status=[int]$taskStatus;bytes=(Get-Item -LiteralPath $taskBody).Length;headers=$taskSafeHeaders}
 }
 $taskReport=@{status='PASS';deploymentId=$taskDeploy.deployment.id;url=$taskDeploy.deployment.url;checks=$taskResults;httpRequests=$taskResults.Count;retries=0;redisRequests=0;payments=0;limitation='Closed HTTPS exposure checks only; no private workspace, MCP seller, Redis or ledger acceptance.'}
 $taskReport | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath docs/evidence/sprint-marketplace/secret-preview-http.json -Encoding utf8
 Write-Output ('PASS: '+$taskResults.Count+' closed HTTPS checks; Redis requests 0; payments 0.')
}finally{
 Remove-Item Env:VERCEL_TOKEN
 $taskAuth=$null
 foreach($taskFile in @($taskHeaders,$taskBody)){if(Test-Path -LiteralPath $taskFile){Remove-Item -LiteralPath $taskFile}}
 Remove-Item -LiteralPath $taskDirectory
}

