param([switch]$Execute)
$ErrorActionPreference='Stop'
$freeChild=$null;$freeBytes=$null
try {
 if(-not $Execute){throw 'EXPLICIT_EXECUTION_REQUIRED'}
 $freeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
 if($freeRoot -ne 'C:\Users\MGC\Documents\ChatGPT\Bazaarx402\beta-open-build'){throw 'PATH_UNCONFIRMED'}
 $freeProfile=Join-Path $freeRoot '.vercel/hosted-seller-redis-validation.dpapi'
 $freeHelper=Join-Path $freeRoot 'scripts/read-on-demand-preview-state.mjs'
 foreach($freePath in @($freeRoot,$freeProfile,$freeHelper)){$freeItem=Get-Item -LiteralPath $freePath -Force;if($freeItem.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PATH_UNCONFIRMED'}}
 if((Get-Item -LiteralPath $freeProfile).Length -gt 65536){throw 'PROFILE_UNCONFIRMED'}
 $freeSecure=Get-Content -LiteralPath $freeProfile -Raw|ConvertTo-SecureString
 $freeStored=((New-Object PSCredential('free-demo-read-only-budget',$freeSecure)).GetNetworkCredential().Password|ConvertFrom-Json)
 if($freeStored.url -ne 'https://smooth-dory-323957.upstash.io' -or $freeStored.token -isnot [string] -or $freeStored.token -notmatch '^[\x21-\x7e]{20,4096}$'){throw 'PROFILE_UNCONFIRMED'}
 $freePacket=@{url=$freeStored.url;token=$freeStored.token}
 $freeInfo=New-Object Diagnostics.ProcessStartInfo
 $freeInfo.FileName=(Get-Command node -CommandType Application|Select-Object -First 1).Source
 $freeInfo.Arguments='--experimental-strip-types scripts/read-on-demand-preview-state.mjs --execute'
 $freeInfo.WorkingDirectory=$freeRoot;$freeInfo.UseShellExecute=$false;$freeInfo.CreateNoWindow=$true
 $freeInfo.RedirectStandardInput=$true;$freeInfo.RedirectStandardOutput=$true;$freeInfo.RedirectStandardError=$true
 $freeInfo.StandardOutputEncoding=New-Object Text.UTF8Encoding($false)
 $freeInfo.EnvironmentVariables.Clear()
 foreach($freeEnvName in @('SystemRoot','WINDIR','TEMP','TMP')){$freeEnvValue=[Environment]::GetEnvironmentVariable($freeEnvName);if($freeEnvValue){$freeInfo.EnvironmentVariables[$freeEnvName]=$freeEnvValue}}
 $freeChild=New-Object Diagnostics.Process;$freeChild.StartInfo=$freeInfo
 [void]$freeChild.Start();$freeOutput=$freeChild.StandardOutput.ReadToEndAsync();$freeError=$freeChild.StandardError.ReadToEndAsync()
 $freeBytes=[Text.Encoding]::UTF8.GetBytes(($freePacket|ConvertTo-Json -Depth 3 -Compress))
 $freeChild.StandardInput.BaseStream.Write($freeBytes,0,$freeBytes.Length);$freeChild.StandardInput.Close();[Array]::Clear($freeBytes,0,$freeBytes.Length)
 $freeBytes=$null;$freePacket=$null;$freeStored=$null;$freeSecure=$null
 if(-not $freeChild.WaitForExit(20000)){$freeChild.Kill();throw 'READ_UNCONFIRMED'}
 if($freeOutput.Result.Length -gt 4096){throw 'OUTPUT_UNCONFIRMED'}
 $freeReport=$freeOutput.Result|ConvertFrom-Json
 if($freeChild.ExitCode -ne 0 -or $freeReport.status -ne 'PASS_READ_ONLY_PREVIEW_BUDGET' -or $freeReport.restRequests -ne 1 -or $freeReport.redisWrites -ne 0 -or $freeReport.realPayments -ne 0 -or $freeReport.productionPublished -ne $false){throw 'READ_UNCONFIRMED'}
 $freeReport|ConvertTo-Json -Depth 5 -Compress
} catch {
 @{status='UNCONFIRMED';code='PREVIEW_BUDGET_READ_UNCONFIRMED';realPayments=0;productionPublished=$false;cronActivated=$false}|ConvertTo-Json -Compress
 exit 1
} finally {
 if($freeBytes){[Array]::Clear($freeBytes,0,$freeBytes.Length)}
 if($freeChild){try{if(-not $freeChild.HasExited){$freeChild.Kill()}}catch{};$freeChild.Dispose()}
}
