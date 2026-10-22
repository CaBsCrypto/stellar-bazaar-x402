param([switch]$Execute)
$ErrorActionPreference='Stop'
# Operator-reviewed, ignored wrapper. Only an explicit invocation reads DPAPI;
# credentials travel to the bounded child through stdin, never argv/env/stdout.
$taskChild=$null;$taskBytes=$null;$taskNetwork='unconfirmed'
try {
 if(-not $Execute){throw 'EXPLICIT_EXECUTION_REQUIRED'}
 $taskHelperRoot=if($PSScriptRoot){[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.vercel'))}else{if((Get-Location).Path -ne 'C:\Users\MGC\Documents\ChatGPT\Bazaarx402\beta-open-build'){throw 'PATH_UNCONFIRMED'};'C:\Users\MGC\Documents\ChatGPT\Bazaarx402\beta-open-build\.vercel'}
 $taskRoot=[IO.Path]::GetFullPath((Join-Path $taskHelperRoot '..'))
 $taskProtected=[IO.Path]::GetFullPath((Join-Path $taskHelperRoot 'hosted-seller-redis-validation.dpapi'))
 $taskHelper=[IO.Path]::GetFullPath((Join-Path $taskRoot 'scripts/validate-continuous-redis-real.mjs'))
 if($taskRoot -ne 'C:\Users\MGC\Documents\ChatGPT\Bazaarx402\beta-open-build' -or $taskProtected -ne (Join-Path $taskRoot '.vercel\hosted-seller-redis-validation.dpapi') -or $taskHelper -ne (Join-Path $taskRoot 'scripts\validate-continuous-redis-real.mjs')){throw 'PATH_UNCONFIRMED'}
 foreach($taskPath in @($taskRoot,$taskHelperRoot,$taskProtected,$taskHelper)){$taskItem=Get-Item -LiteralPath $taskPath -Force;if($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PATH_UNCONFIRMED'}}
 if((Get-Item -LiteralPath $taskProtected).Length -gt 65536){throw 'PROFILE_UNCONFIRMED'}
 $taskSecure=Get-Content -LiteralPath $taskProtected -Raw|ConvertTo-SecureString
 $taskStored=((New-Object PSCredential('synthetic-seller-capacity-validation',$taskSecure)).GetNetworkCredential().Password|ConvertFrom-Json)
 if($taskStored.url -ne 'https://smooth-dory-323957.upstash.io' -or $taskStored.token -isnot [string] -or $taskStored.token -notmatch '^[\x21-\x7e]{20,4096}$'){throw 'PROFILE_UNCONFIRMED'}
 $taskPacket=@{url=$taskStored.url;token=$taskStored.token}
 $taskInfo=New-Object Diagnostics.ProcessStartInfo
 $taskInfo.FileName=(Get-Command node -CommandType Application | Select-Object -First 1).Source
 $taskInfo.Arguments='--experimental-strip-types scripts/validate-continuous-redis-real.mjs --execute'
 $taskInfo.WorkingDirectory=$taskRoot;$taskInfo.UseShellExecute=$false;$taskInfo.CreateNoWindow=$true
 $taskInfo.RedirectStandardInput=$true;$taskInfo.RedirectStandardOutput=$true;$taskInfo.RedirectStandardError=$true
 $taskInfo.StandardOutputEncoding=New-Object Text.UTF8Encoding($false);$taskInfo.StandardErrorEncoding=New-Object Text.UTF8Encoding($false)
 $taskInfo.EnvironmentVariables.Clear()
 foreach($taskEnvName in @('SystemRoot','WINDIR','TEMP','TMP')){$taskEnvValue=[Environment]::GetEnvironmentVariable($taskEnvName);if($taskEnvValue){$taskInfo.EnvironmentVariables[$taskEnvName]=$taskEnvValue}}
 $taskInfo.EnvironmentVariables['NODE_ENV']='test'
 $taskChild=New-Object Diagnostics.Process;$taskChild.StartInfo=$taskInfo
 [void]$taskChild.Start();$taskOutput=$taskChild.StandardOutput.ReadToEndAsync();$taskError=$taskChild.StandardError.ReadToEndAsync()
 $taskBytes=[Text.Encoding]::UTF8.GetBytes(($taskPacket|ConvertTo-Json -Depth 3 -Compress))
 $taskChild.StandardInput.BaseStream.Write($taskBytes,0,$taskBytes.Length);$taskChild.StandardInput.Close();[Array]::Clear($taskBytes,0,$taskBytes.Length)
 $taskBytes=$null;$taskPacket=$null;$taskStored=$null;$taskSecure=$null
 if(-not $taskChild.WaitForExit(220000)){$taskChild.Kill();throw 'BOUNDED_VALIDATION_UNCONFIRMED'}
 if($taskOutput.Result.Length -gt 32768){throw 'OUTPUT_UNCONFIRMED'}
 $taskRaw=$taskOutput.Result|ConvertFrom-Json
 if($taskRaw.status -notin @('PASS','FAIL') -or $taskRaw.networkUsed -isnot [bool] -or $taskRaw.realPayments -ne 0 -or $taskRaw.providerExecutions -ne 0){throw 'OUTPUT_UNCONFIRMED'}
 $taskNetwork=$taskRaw.networkUsed
 if($taskRaw.status -eq 'PASS'){
  if($taskRaw.category -ne 'Real Redis isolated seller capacity and joint CAS validation' -or (-not ($taskRaw.restRequests -is [long] -or $taskRaw.restRequests -is [int])) -or $taskRaw.restRequests -lt 1 -or $taskRaw.restRequests -gt 150 -or $taskRaw.exactOwnedKeyCount -ne 3 -or $taskRaw.exactOwnedKeysDeleted -ne 3 -or $taskRaw.isolatedSyntheticKeysRemoved -ne $true -or $taskRaw.realRedisLuaVerified -ne $true -or $taskChild.ExitCode -ne 0){throw 'OUTPUT_UNCONFIRMED'}
  $taskCheckNames=@('freshThreeKeyNamespace','ownedServiceReportPersisted','reportReplayDoesNotExtendExpiryOrWrite','otherOwnerReportRejectedBeforeLua','missingCapacityCreatesNoOrderOrWrite','expiredCapacityCreatesNoOrderOrWrite','twoStoresTwoServicesOneSellerPendingWinner','challengeDoesNotConsumeDailyExecution','realLuaAtomicallyCommitsMarketSettlementAndReservation','lostAckRecoveredByReadWithoutSecondAttempt','uncertainMetadataPreservesAttemptAndCounter','realLuaGuardRejectsStaleExpectedOwnDocument','redisTimeRejectsPastDeadlineWithoutClientClockValidation','fiftiethExecutionOnOneServiceBlocksOtherServiceSameOwner')
  if(@($taskRaw.checks.PSObject.Properties).Count -ne $taskCheckNames.Count){throw 'OUTPUT_UNCONFIRMED'}
  foreach($taskCheckName in $taskCheckNames){if($taskRaw.checks.$taskCheckName -isnot [bool] -or $taskRaw.checks.$taskCheckName -ne $true){throw 'OUTPUT_UNCONFIRMED'}}
  @{status='PASS';checksPassed=$taskCheckNames.Count;restRequests=[int]$taskRaw.restRequests;networkUsed=$true;realRedisLuaVerified=$true;isolatedSyntheticKeysRemoved=$true;exactOwnedKeysDeleted=3;realPayments=0;providerExecutions=0;evidence='docs/evidence/continuous-redis-real-2026-10-11.json'}|ConvertTo-Json -Compress
 }else{
  $taskFailureCodes=@('EXECUTION_FLAG_REQUIRED','LOCAL_RUNTIME_REQUIRED','INPUT_INVALID','INPUT_TIMEOUT','SOURCE_MISMATCH','EVIDENCE_EXISTS','EVIDENCE_PATH_INVALID','FIXTURE_TOO_LARGE','KEY_COLLISION','REST_BOUND','DEADLINE','TARGET_REJECTED','REDIS_REQUEST_FAILED','TTL_UNCONFIRMED','CAS_RESULT_INVALID','RACE_TIMEOUT','ASSERTION_FAILED','SYNTHETIC_ACK_LOST','CAPACITY_WRITE_UNCONFIRMED','CLEANUP_UNCONFIRMED','EVIDENCE_WRITE_FAILED')
  $taskCode=if($taskRaw.code -in $taskFailureCodes){[string]$taskRaw.code}else{'VALIDATION_UNCONFIRMED'}
  @{status='FAIL';code=$taskCode;networkUsed=$taskNetwork;isolatedSyntheticKeysRemoved=($taskRaw.isolatedSyntheticKeysRemoved -eq $true);realPayments=0;providerExecutions=0}|ConvertTo-Json -Compress
  exit 1
 }
}catch {
 @{status='FAIL';code='WRAPPER_UNCONFIRMED';networkUsed=$taskNetwork;isolatedSyntheticKeysRemoved=$false;realPayments=0;providerExecutions=0}|ConvertTo-Json -Compress
 exit 1
}finally {
 if($taskBytes){[Array]::Clear($taskBytes,0,$taskBytes.Length)}
 $taskBytes=$null;$taskPacket=$null;$taskStored=$null;$taskSecure=$null
 if($taskChild){try{if(-not $taskChild.HasExited){$taskChild.Kill()}}catch{};$taskChild.Dispose()}
}
