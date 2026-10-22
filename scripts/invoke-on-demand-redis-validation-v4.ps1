param(
 [switch]$Execute,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$SourceDigest,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedHelperSha256
)
$ErrorActionPreference='Stop'
$validationChild=$null;$validationBytes=$null
try {
 if(-not $Execute){throw 'EXPLICIT_EXECUTION_REQUIRED'}
 $validationRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
 $validationProfile=[IO.Path]::GetFullPath((Join-Path $validationRoot '.vercel/hosted-seller-redis-validation.dpapi'))
 $validationHelper=[IO.Path]::GetFullPath((Join-Path $validationRoot 'scripts/validate-on-demand-redis-real-v4.mjs'))
 if($validationRoot -ne 'C:\Users\MGC\Documents\ChatGPT\Bazaarx402\beta-open-build'){throw 'PATH_UNCONFIRMED'}
 foreach($validationPath in @($validationRoot,$validationProfile,$validationHelper)){$validationItem=Get-Item -LiteralPath $validationPath -Force;if($validationItem.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PATH_UNCONFIRMED'}}
 if((Get-Item -LiteralPath $validationProfile).Length -gt 65536 -or (Get-FileHash -LiteralPath $validationHelper -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedHelperSha256){throw 'REVIEW_UNCONFIRMED'}
 $validationSecure=Get-Content -LiteralPath $validationProfile -Raw|ConvertTo-SecureString
 $validationStored=((New-Object PSCredential('on-demand-isolated-validation',$validationSecure)).GetNetworkCredential().Password|ConvertFrom-Json)
 if($validationStored.url -ne 'https://smooth-dory-323957.upstash.io' -or $validationStored.token -isnot [string] -or $validationStored.token -notmatch '^[\x21-\x7e]{20,4096}$'){throw 'PROFILE_UNCONFIRMED'}
 $validationPacket=@{url=$validationStored.url;token=$validationStored.token}
 $validationInfo=New-Object Diagnostics.ProcessStartInfo
 $validationInfo.FileName='C:\Users\MGC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
 $validationInfo.Arguments='--experimental-strip-types scripts/validate-on-demand-redis-real-v4.mjs --execute --source-digest '+$SourceDigest
 $validationInfo.WorkingDirectory=$validationRoot;$validationInfo.UseShellExecute=$false;$validationInfo.CreateNoWindow=$true
 $validationInfo.RedirectStandardInput=$true;$validationInfo.RedirectStandardOutput=$true;$validationInfo.RedirectStandardError=$true
 $validationInfo.StandardOutputEncoding=New-Object Text.UTF8Encoding($false);$validationInfo.StandardErrorEncoding=New-Object Text.UTF8Encoding($false)
 $validationInfo.EnvironmentVariables.Clear()
 foreach($validationEnvName in @('SystemRoot','WINDIR','TEMP','TMP')){$validationEnvValue=[Environment]::GetEnvironmentVariable($validationEnvName);if($validationEnvValue){$validationInfo.EnvironmentVariables[$validationEnvName]=$validationEnvValue}}
 $validationInfo.EnvironmentVariables['NODE_ENV']='test'
 $validationChild=New-Object Diagnostics.Process;$validationChild.StartInfo=$validationInfo
 [void]$validationChild.Start();$validationOutput=$validationChild.StandardOutput.ReadToEndAsync();$validationError=$validationChild.StandardError.ReadToEndAsync()
 $validationBytes=[Text.Encoding]::UTF8.GetBytes(($validationPacket|ConvertTo-Json -Depth 3 -Compress))
 $validationChild.StandardInput.BaseStream.Write($validationBytes,0,$validationBytes.Length);$validationChild.StandardInput.Close();[Array]::Clear($validationBytes,0,$validationBytes.Length)
 $validationBytes=$null;$validationPacket=$null;$validationStored=$null;$validationSecure=$null
 if(-not $validationChild.WaitForExit(150000)){$validationChild.Kill();throw 'VALIDATION_UNCONFIRMED'}
 if($validationOutput.Result.Length -gt 65536){throw 'OUTPUT_UNCONFIRMED'}
 $validationReport=$validationOutput.Result|ConvertFrom-Json
 if($validationReport.status -notin @('PASS','FAIL') -or $validationReport.realPayments -ne 0 -or $validationReport.providerExecutions -ne 0){throw 'OUTPUT_UNCONFIRMED'}
 if($validationReport.status -eq 'PASS'){
  if($validationChild.ExitCode -ne 0 -or $validationReport.networkUsed -ne $true -or $validationReport.restRequests -gt 190 -or $validationReport.conservativeRedisCommandsUpperBound -gt 1800 -or $validationReport.isolatedKeys -ne 7 -or $validationReport.exactOwnedKeysDeleted -ne 7 -or $validationReport.isolatedSyntheticKeysRemoved -ne $true -or $validationReport.sourceDigest -ne $SourceDigest -or $validationReport.assertions -lt 40){throw 'OUTPUT_UNCONFIRMED'}
  @{status='PASS';checks=[int]$validationReport.assertions;restRequests=[int]$validationReport.restRequests;conservativeRedisCommandsUpperBound=[int]$validationReport.conservativeRedisCommandsUpperBound;evalCalls=[int]$validationReport.evalCalls;networkUsed=$true;exactOwnedKeysDeleted=7;realPayments=0;providerExecutions=0;evidence='docs/evidence/on-demand-redis-real-v4-2026-10-11.json'}|ConvertTo-Json -Compress
 }else{
  @{status='FAIL';code='ISOLATED_VALIDATION_UNCONFIRMED';stage=$validationReport.stage;networkUsed=($validationReport.networkUsed -eq $true);isolatedSyntheticKeysRemoved=($validationReport.isolatedSyntheticKeysRemoved -eq $true);realPayments=0;providerExecutions=0}|ConvertTo-Json -Compress
  exit 1
 }
}catch {
 @{status='FAIL';code='WRAPPER_UNCONFIRMED';networkUsed='unconfirmed';realPayments=0;providerExecutions=0}|ConvertTo-Json -Compress
 exit 1
}finally {
 if($validationBytes){[Array]::Clear($validationBytes,0,$validationBytes.Length)}
 $validationBytes=$null;$validationPacket=$null;$validationStored=$null;$validationSecure=$null
 if($validationChild){try{if(-not $validationChild.HasExited){$validationChild.Kill()}}catch{};$validationChild.Dispose()}
}
