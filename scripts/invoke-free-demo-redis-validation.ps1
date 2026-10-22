param([switch]$Execute)
$ErrorActionPreference='Stop'
# Existing DPAPI profile only; private values travel to the bounded child stdin.
$freeChild=$null;$freeBytes=$null
try {
 if(-not $Execute){throw 'EXPLICIT_EXECUTION_REQUIRED'}
 $freeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
 $freeProfile=[IO.Path]::GetFullPath((Join-Path $freeRoot '.vercel/hosted-seller-redis-validation.dpapi'))
 $freeHelper=[IO.Path]::GetFullPath((Join-Path $freeRoot 'scripts/validate-free-demo-redis-real.mjs'))
 if($freeRoot -ne 'C:\Users\MGC\Documents\ChatGPT\Bazaarx402\beta-open-build'){throw 'PATH_UNCONFIRMED'}
 foreach($freePath in @($freeRoot,$freeProfile,$freeHelper)){$freeItem=Get-Item -LiteralPath $freePath -Force;if($freeItem.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PATH_UNCONFIRMED'}}
 if((Get-Item -LiteralPath $freeProfile).Length -gt 65536){throw 'PROFILE_UNCONFIRMED'}
 $freeSecure=Get-Content -LiteralPath $freeProfile -Raw|ConvertTo-SecureString
 $freeStored=((New-Object PSCredential('free-demo-isolated-validation',$freeSecure)).GetNetworkCredential().Password|ConvertFrom-Json)
 if($freeStored.url -ne 'https://smooth-dory-323957.upstash.io' -or $freeStored.token -isnot [string] -or $freeStored.token -notmatch '^[\x21-\x7e]{20,4096}$'){throw 'PROFILE_UNCONFIRMED'}
 $freePacket=@{url=$freeStored.url;token=$freeStored.token}
 $freeInfo=New-Object Diagnostics.ProcessStartInfo
 $freeInfo.FileName=(Get-Command node -CommandType Application|Select-Object -First 1).Source
 $freeInfo.Arguments='--experimental-strip-types scripts/validate-free-demo-redis-real.mjs --execute'
 $freeInfo.WorkingDirectory=$freeRoot;$freeInfo.UseShellExecute=$false;$freeInfo.CreateNoWindow=$true
 $freeInfo.RedirectStandardInput=$true;$freeInfo.RedirectStandardOutput=$true;$freeInfo.RedirectStandardError=$true
 $freeInfo.StandardOutputEncoding=New-Object Text.UTF8Encoding($false);$freeInfo.StandardErrorEncoding=New-Object Text.UTF8Encoding($false)
 $freeInfo.EnvironmentVariables.Clear()
 foreach($freeEnvName in @('SystemRoot','WINDIR','TEMP','TMP')){$freeEnvValue=[Environment]::GetEnvironmentVariable($freeEnvName);if($freeEnvValue){$freeInfo.EnvironmentVariables[$freeEnvName]=$freeEnvValue}}
 $freeInfo.EnvironmentVariables['NODE_ENV']='test'
 $freeChild=New-Object Diagnostics.Process;$freeChild.StartInfo=$freeInfo
 [void]$freeChild.Start();$freeOutput=$freeChild.StandardOutput.ReadToEndAsync();$freeError=$freeChild.StandardError.ReadToEndAsync()
 $freeBytes=[Text.Encoding]::UTF8.GetBytes(($freePacket|ConvertTo-Json -Depth 3 -Compress))
 $freeChild.StandardInput.BaseStream.Write($freeBytes,0,$freeBytes.Length);$freeChild.StandardInput.Close();[Array]::Clear($freeBytes,0,$freeBytes.Length)
 $freeBytes=$null;$freePacket=$null;$freeStored=$null;$freeSecure=$null
 if(-not $freeChild.WaitForExit(80000)){$freeChild.Kill();throw 'VALIDATION_UNCONFIRMED'}
 if($freeOutput.Result.Length -gt 32768){throw 'OUTPUT_UNCONFIRMED'}
 $freeReport=$freeOutput.Result|ConvertFrom-Json
 if($freeReport.status -notin @('PASS','FAIL') -or $freeReport.realPayments -ne 0 -or $freeReport.providerExecutions -ne 0){throw 'OUTPUT_UNCONFIRMED'}
 if($freeReport.status -eq 'PASS'){
  if($freeChild.ExitCode -ne 0 -or $freeReport.networkUsed -ne $true -or $freeReport.restRequests -gt 40 -or $freeReport.conservativeRedisCommandsUpperBound -gt 100 -or $freeReport.exactOwnedKeysDeleted -ne 1 -or $freeReport.isolatedSyntheticKeysRemoved -ne $true){throw 'OUTPUT_UNCONFIRMED'}
  $freeNames=@('freshSingleKey','eightConcurrentOneWinner','redisTimeRecorded','noExpiryOrRolloverReset','restartDeniedWithoutWrite','authenticatedTransportFallbackSingleLua','invalidCredentialCannotUseRecovery','lostAcknowledgementNeverReplayed','readAndRetryDoNotSetTtl','malformedLedgerFailsWithoutWrite','redisClockRegressionFailsClosed')
  foreach($freeName in $freeNames){if($freeReport.checks.$freeName -ne $true){throw 'OUTPUT_UNCONFIRMED'}}
  @{status='PASS';checks=$freeNames.Count;restRequests=[int]$freeReport.restRequests;conservativeRedisCommandsUpperBound=[int]$freeReport.conservativeRedisCommandsUpperBound;evalCalls=[int]$freeReport.evalCalls;networkUsed=$true;exactOwnedKeysDeleted=1;realPayments=0;providerExecutions=0;evidence='docs/evidence/free-demo-redis-real-2026-10-11.json'}|ConvertTo-Json -Compress
 }else{
  @{status='FAIL';code='ISOLATED_VALIDATION_UNCONFIRMED';networkUsed=($freeReport.networkUsed -eq $true);isolatedSyntheticKeysRemoved=($freeReport.isolatedSyntheticKeysRemoved -eq $true);realPayments=0;providerExecutions=0}|ConvertTo-Json -Compress
  exit 1
 }
}catch {
 @{status='FAIL';code='WRAPPER_UNCONFIRMED';networkUsed='unconfirmed';realPayments=0;providerExecutions=0}|ConvertTo-Json -Compress
 exit 1
}finally {
 if($freeBytes){[Array]::Clear($freeBytes,0,$freeBytes.Length)}
 $freeBytes=$null;$freePacket=$null;$freeStored=$null;$freeSecure=$null
 if($freeChild){try{if(-not $freeChild.HasExited){$freeChild.Kill()}}catch{};$freeChild.Dispose()}
}
