<#
Local Windows PowerShell 5.1 handoff only. SavePending, Save and Complete consume
one JSON object from stdin. Check never uses the network. Execute must be chosen
explicitly after the separate authorization; it removes the exact encrypted
profile afterward and stores only a reviewed public report. No create API here.

The default private path is .vercel/redis-validation-secrets.dpapi. SyntheticNonce
only selects an isolated local test file in that same directory; Execute rejects
it. Secrets are never command arguments, environment values or console output.

Invocation: powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass
  -File scripts/invoke-redis-isolated-validation.ps1 -Mode <mode>
The policy option applies only to that process; no machine setting is changed.
Supply private JSON over a trusted producer's pipe, never an argv literal or a
plaintext file. SavePending protects the idempotency UUID before a future API
request. Complete binds the ready response to the same UUID, label and dates.
Save refuses an existing profile. Check requires ready; it has no network path.
Execute does not create a database or renew its lifetime, and is the only mode
that invokes Redis. It requires a new evidence filename and has no retry loop.
An unconfirmed Execute cannot certify cleanup of remote keys; expiry remains the
backstop. Local encrypted cleanup does not prove deletion of the remote database.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('SavePending', 'Save', 'Complete', 'Check', 'Execute')]
    [string] $Mode,
    [ValidatePattern('^[a-f0-9]{32}$')]
    [string] $SyntheticNonce
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$taskFailureCode = 'REDIS_VALIDATION_LOCAL_FAILED'
$taskPrivatePath = $null
$taskEvidencePath = $null
$taskLockPath = $null
$taskLockStream = $null
$taskClearBytes = $null
$taskEncryptedBytes = $null
$taskProfile = $null
$taskReport = $null
$taskExecuteEntered = $false
$taskPrivateValidated = $false
$taskExitCode = 1

function Assert-LocalPath([string] $Path, [bool] $Directory, [bool] $MustExist, [long] $MaxBytes = 65536) {
    $full = [IO.Path]::GetFullPath($Path)
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'LOCAL_PATH_REJECTED' }
            $resolved = (Resolve-Path -LiteralPath $cursor).ProviderPath
            if (-not [string]::Equals($resolved, $cursor, [StringComparison]::OrdinalIgnoreCase)) { throw 'LOCAL_PATH_REJECTED' }
        }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
    if ($MustExist -and -not (Test-Path -LiteralPath $full)) { throw 'LOCAL_PATH_REQUIRED' }
    if (Test-Path -LiteralPath $full) {
        $item = Get-Item -LiteralPath $full -Force
        if ([bool]$item.PSIsContainer -ne $Directory) { throw 'LOCAL_PATH_REJECTED' }
        if (-not $Directory -and $item.Length -gt $MaxBytes) { throw 'LOCAL_FILE_TOO_LARGE' }
    }
    return $full
}

function New-PrivateFile([string] $Path) {
    $null = Assert-LocalPath $Path $false $false
    if (Test-Path -LiteralPath $Path) { throw 'EXISTING_PRIVATE_FILE' }
    $security = New-Object Security.AccessControl.FileSecurity
    $security.SetAccessRuleProtection($true, $false)
    $security.SetOwner($taskUserSid)
    foreach ($sid in @($taskUserSid, $taskSystemSid)) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, [Security.AccessControl.FileSystemRights]::FullControl, [Security.AccessControl.AccessControlType]::Allow)
        $security.AddAccessRule($rule)
    }
    # File security is assigned atomically at creation, before any bytes exist.
    return New-Object IO.FileStream($Path, [IO.FileMode]::CreateNew, [Security.AccessControl.FileSystemRights]::FullControl, [IO.FileShare]::None, 4096, [IO.FileOptions]::WriteThrough, $security)
}

function Assert-PrivateFile([string] $Path) {
    $null = Assert-LocalPath $Path $false $true
    $security = [IO.File]::GetAccessControl($Path)
    if (-not $security.AreAccessRulesProtected -or $security.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $taskUserSid.Value) { throw 'PRIVATE_ACL_REQUIRED' }
    $rules = @($security.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if ($rules.Count -ne 2) { throw 'PRIVATE_ACL_REQUIRED' }
    foreach ($rule in $rules) {
        if ($rule.IdentityReference.Value -notin @($taskUserSid.Value, $taskSystemSid.Value) -or $rule.IsInherited -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or $rule.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) { throw 'PRIVATE_ACL_REQUIRED' }
    }
}

function Read-PrivateStdin {
    $builder = New-Object Text.StringBuilder
    $buffer = New-Object char[] 2048
    try {
        while (($count = [Console]::In.Read($buffer, 0, $buffer.Length)) -gt 0) {
            if ($builder.Length + $count -gt 16384) { throw 'PRIVATE_INPUT_TOO_LARGE' }
            $null = $builder.Append($buffer, 0, $count)
            [Array]::Clear($buffer, 0, $buffer.Length)
        }
        $value = $builder.ToString()
        if ([string]::IsNullOrWhiteSpace($value) -or $taskUtf8.GetByteCount($value) -gt 16384) { throw 'PRIVATE_INPUT_REQUIRED' }
        return $value
    } finally { [Array]::Clear($buffer, 0, $buffer.Length); $null = $builder.Clear() }
}

function Invoke-ProfileValidator([string] $Json, [string] $Operation) {
    if ($Operation -notin @('--validate-profile', '--validate-pending-profile', '--execute')) { throw 'LOCAL_OPERATION_REJECTED' }
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $taskNode
    $start.Arguments = '"' + $taskValidator + '" ' + $Operation + ' --temporary-profile-stdin'
    $start.WorkingDirectory = $taskCheckout
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = New-Object Text.UTF8Encoding($false, $true)
    $start.StandardErrorEncoding = New-Object Text.UTF8Encoding($false, $true)
    # No credential or inherited preload configuration enters the child.
    $start.EnvironmentVariables.Clear()
    foreach ($name in @('SystemRoot', 'WINDIR')) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if ($value) { $start.EnvironmentVariables[$name] = $value }
    }
    $child = New-Object Diagnostics.Process
    $child.StartInfo = $start
    $childStarted = $false
    $outputBuffer = $null
    $errorBuffer = $null
    $outputBuilder = $null
    try {
        if (-not $child.Start()) { throw 'LOCAL_CHILD_UNAVAILABLE' }
        $childStarted = $true
        $outputBuffer = New-Object char[] 2048
        $errorBuffer = New-Object char[] 2048
        $outputBuilder = New-Object Text.StringBuilder
        $outputTask = $child.StandardOutput.ReadAsync($outputBuffer, 0, $outputBuffer.Length)
        $errorTask = $child.StandardError.ReadAsync($errorBuffer, 0, $errorBuffer.Length)
        $stdinBytes = $taskUtf8.GetBytes($Json)
        try { $child.StandardInput.BaseStream.Write($stdinBytes, 0, $stdinBytes.Length); $child.StandardInput.BaseStream.Flush() }
        finally { [Array]::Clear($stdinBytes, 0, $stdinBytes.Length) }
        $child.StandardInput.Close()
        $timeout = if ($Operation -eq '--execute') { 600000 } else { 30000 }
        $elapsed = [Diagnostics.Stopwatch]::StartNew()
        $errorCharacters = 0
        while ($null -ne $outputTask -or $null -ne $errorTask) {
            if ($elapsed.ElapsedMilliseconds -gt $timeout) { $child.Kill(); throw 'LOCAL_CHILD_UNCONFIRMED' }
            if ($null -ne $outputTask -and $outputTask.IsCompleted) {
                $count = $outputTask.GetAwaiter().GetResult()
                if ($count -eq 0) { $outputTask = $null }
                else {
                    if ($outputBuilder.Length + $count -gt 16384) { $child.Kill(); throw 'LOCAL_CHILD_UNCONFIRMED' }
                    $null = $outputBuilder.Append($outputBuffer, 0, $count)
                    [Array]::Clear($outputBuffer, 0, $outputBuffer.Length)
                    $outputTask = $child.StandardOutput.ReadAsync($outputBuffer, 0, $outputBuffer.Length)
                }
            }
            if ($null -ne $errorTask -and $errorTask.IsCompleted) {
                $count = $errorTask.GetAwaiter().GetResult()
                if ($count -eq 0) { $errorTask = $null }
                else {
                    $errorCharacters += $count
                    [Array]::Clear($errorBuffer, 0, $errorBuffer.Length)
                    if ($errorCharacters -gt 65536) { $child.Kill(); throw 'LOCAL_CHILD_UNCONFIRMED' }
                    $errorTask = $child.StandardError.ReadAsync($errorBuffer, 0, $errorBuffer.Length)
                }
            }
            if ($null -ne $outputTask -or $null -ne $errorTask) { Start-Sleep -Milliseconds 10 }
        }
        if (-not $child.WaitForExit([Math]::Max(1, $timeout - [int]$elapsed.ElapsedMilliseconds))) { $child.Kill(); throw 'LOCAL_CHILD_UNCONFIRMED' }
        $output = $outputBuilder.ToString()
        $result = ConvertFrom-Json -InputObject $output
        if ($Operation -ne '--execute' -and ($child.ExitCode -ne 0 -or $result.status -ne 'PASS' -or $result.profileValid -ne $true -or $result.networkUsed -ne $false)) { throw 'PROFILE_REJECTED' }
        return @{ Result = $result; ExitCode = $child.ExitCode }
    } finally {
        if ($childStarted -and -not $child.HasExited) { $child.Kill(); $child.WaitForExit() }
        $child.Dispose(); $Json = $null; $output = $null
        if ($outputBuffer) { [Array]::Clear($outputBuffer, 0, $outputBuffer.Length) }
        if ($errorBuffer) { [Array]::Clear($errorBuffer, 0, $errorBuffer.Length) }
        if ($outputBuilder) { $null = $outputBuilder.Clear() }
    }
}

function Read-EncryptedProfile([string] $Path) {
    Assert-PrivateFile $Path
    $cipher = [IO.File]::ReadAllBytes($Path)
    $clear = $null
    try {
        $clear = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $taskEntropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        if ($clear.Length -eq 0 -or $clear.Length -gt 16384) { throw 'PRIVATE_PROFILE_REJECTED' }
        return $taskUtf8.GetString($clear)
    } finally { [Array]::Clear($cipher, 0, $cipher.Length); if ($clear) { [Array]::Clear($clear, 0, $clear.Length) } }
}

function Write-EncryptedProfile([string] $Path, [string] $Json) {
    $clear = $taskUtf8.GetBytes($Json)
    $cipher = $null
    $stream = $null
    try {
        $cipher = [Security.Cryptography.ProtectedData]::Protect($clear, $taskEntropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $stream = New-PrivateFile $Path
        $stream.Write($cipher, 0, $cipher.Length)
        $stream.Flush($true)
    } finally { if ($stream) { $stream.Dispose() }; [Array]::Clear($clear, 0, $clear.Length); if ($cipher) { [Array]::Clear($cipher, 0, $cipher.Length) } }
}

function New-LocalReport([string] $Action, $Profile) {
    return [ordered]@{status = 'PASS'; action = $Action; profileValid = $true; phase = $Profile.phase; expiresAt = $Profile.expiresAt; basis = $Profile.basis; networkUsed = $false}
}

function Sanitize-ExecutionReport($Result, [int] $ExitCode) {
    # Fixed fields and exact expected values only. Never forward child diagnostics,
    # URL, token, database UUID, label, arbitrary strings or raw stderr/stdout.
    $safe = [ordered]@{status = 'FAIL'; code = 'REDIS_VALIDATION_UNCONFIRMED'; networkUsed = $taskExecuteEntered; realPayments = 0; isolatedSyntheticKeysRemoved = $false}
    if ($ExitCode -eq 0 -and $Result.status -eq 'PASS') {
        $safe = [ordered]@{status = 'PASS'; category = 'Local application with temporary exclusive Upstash Redis'; networkUsed = $true; realPayments = 0; r2Validated = $false; profileExpiresAt = $taskProfile.expiresAt; profileBasis = $taskProfile.basis}
        $fixedNumbers = @{syntheticAccounts = 2; retentionDays = 7; sharedMinuteCap = 120; perAccountMinuteCap = 60}
        foreach ($name in $fixedNumbers.Keys) {
            if ($Result.$name -ne $fixedNumbers[$name]) { throw 'PUBLIC_REPORT_REJECTED' }
            $safe[$name] = $fixedNumbers[$name]
        }
        foreach ($name in @('persistedAfterProcessRestart', 'expiredReplayCannotRevive', 'atomicByteAccounting', 'privateAccountIsolation', 'recoveryWhenAdmissionsClosed', 'concurrentAtomicQuota', 'isolatedSyntheticKeysRemoved')) {
            if ($Result.$name -isnot [bool] -or -not $Result.$name) { throw 'PUBLIC_REPORT_REJECTED' }
            $safe[$name] = $true
        }
        if ($Result.redisExchanges -isnot [long] -and $Result.redisExchanges -isnot [int]) { throw 'PUBLIC_REPORT_REJECTED' }
        if ($Result.redisExchanges -lt 0 -or $Result.redisExchanges -gt 100000) { throw 'PUBLIC_REPORT_REJECTED' }
        $safe.redisExchanges = $Result.redisExchanges
    } elseif ($Result.status -eq 'FAIL') {
        if ($Result.PSObject.Properties.Name -contains 'networkUsed' -and $Result.networkUsed -is [bool]) { $safe.networkUsed = $Result.networkUsed }
        if ($Result.PSObject.Properties.Name -contains 'isolatedSyntheticKeysRemoved' -and $Result.isolatedSyntheticKeysRemoved -is [bool]) { $safe.isolatedSyntheticKeysRemoved = $Result.isolatedSyntheticKeysRemoved }
    }
    return $safe
}

try {
    if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSEdition -ne 'Desktop' -or $env:VERCEL -or $env:VERCEL_ENV -or $env:NODE_ENV -eq 'production') { throw 'LOCAL_WINDOWS_REQUIRED' }
    if ($Mode -eq 'Execute' -and $SyntheticNonce) { throw 'SYNTHETIC_EXECUTION_REJECTED' }
    Add-Type -AssemblyName System.Security
    $taskUserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $taskSystemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
    $taskEntropy = [Text.Encoding]::UTF8.GetBytes('bazaar-redis-validation:v1')
    $taskUtf8 = New-Object Text.UTF8Encoding($false, $true)
    $taskCheckout = Assert-LocalPath ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))) $true $true
    $null = Assert-LocalPath (Join-Path $taskCheckout 'package.json') $false $true
    $taskValidator = Assert-LocalPath (Join-Path $taskCheckout 'scripts\validate-workspace-redis-isolated.mjs') $false $true
    $taskNode = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Path
    $null = Assert-LocalPath $taskNode $false $true 268435456
    $taskPrivateDirectory = Assert-LocalPath (Join-Path $taskCheckout '.vercel') $true $true
    $stem = if ($SyntheticNonce) { 'redis-validation-synthetic-' + $SyntheticNonce } else { 'redis-validation-secrets' }
    $taskPrivatePath = Assert-LocalPath (Join-Path $taskPrivateDirectory ($stem + '.dpapi')) $false $false
    $taskEvidencePath = Assert-LocalPath (Join-Path $taskPrivateDirectory 'redis-validation-evidence.json') $false $false
    $taskLockPath = Assert-LocalPath (Join-Path $taskPrivateDirectory ($stem + '.lock')) $false $false
    $taskLockStream = New-PrivateFile $taskLockPath

    if ($Mode -in @('SavePending', 'Save', 'Complete')) {
        if ($Mode -ne 'Complete' -and (Test-Path -LiteralPath $taskPrivatePath)) { throw 'EXISTING_PRIVATE_FILE' }
        $taskJson = Read-PrivateStdin
        $operation = if ($Mode -eq 'SavePending') { '--validate-pending-profile' } else { '--validate-profile' }
        $validation = Invoke-ProfileValidator $taskJson $operation
        $taskProfile = ConvertFrom-Json -InputObject $taskJson
        if ($Mode -eq 'Complete') {
            $pendingJson = Read-EncryptedProfile $taskPrivatePath
            $null = Invoke-ProfileValidator $pendingJson '--validate-pending-profile'
            $pending = ConvertFrom-Json -InputObject $pendingJson
            foreach ($name in @('version', 'purpose', 'mode', 'databaseId', 'localLabel', 'createdAt', 'expiresAt', 'basis')) {
                if ($taskProfile.$name -cne $pending.$name) { throw 'PRIVATE_BINDING_CHANGED' }
            }
            $replacement = Join-Path $taskPrivateDirectory ($stem + '.replacement-' + [Guid]::NewGuid().ToString('N') + '.dpapi')
            try {
                Write-EncryptedProfile $replacement $taskJson
                Assert-PrivateFile $taskPrivatePath
                [IO.File]::Replace($replacement, $taskPrivatePath, [Management.Automation.Language.NullString]::Value)
                Assert-PrivateFile $taskPrivatePath
            } finally { if (Test-Path -LiteralPath $replacement) { $null = Assert-LocalPath $replacement $false $true; Remove-Item -LiteralPath $replacement -Force } }
            $pendingJson = $null; $pending = $null
        } else { Write-EncryptedProfile $taskPrivatePath $taskJson }
        $taskReport = New-LocalReport $Mode $taskProfile
        $taskExitCode = 0
    } else {
        Assert-PrivateFile $taskPrivatePath
        $taskPrivateValidated = $true
        if ($Mode -eq 'Execute' -and (Test-Path -LiteralPath $taskEvidencePath)) { throw 'EXISTING_EVIDENCE_FILE' }
        $taskJson = Read-EncryptedProfile $taskPrivatePath
        $validation = Invoke-ProfileValidator $taskJson '--validate-profile'
        $taskProfile = ConvertFrom-Json -InputObject $taskJson
        if ($Mode -eq 'Check') { $taskReport = New-LocalReport 'Check' $taskProfile; $taskExitCode = 0 }
        else {
            $taskExecuteEntered = $true
            $execution = Invoke-ProfileValidator $taskJson '--execute'
            $taskReport = Sanitize-ExecutionReport $execution.Result $execution.ExitCode
            if ($taskReport.status -eq 'PASS') { $taskExitCode = 0 }
        }
    }
} catch {
    $taskReport = [ordered]@{status = 'FAIL'; code = $taskFailureCode; networkUsed = $taskExecuteEntered; realPayments = 0}
    if ($taskExecuteEntered) { $taskReport.isolatedSyntheticKeysRemoved = $false }
} finally {
    $taskJson = $null; $taskProfile = $null; $pendingJson = $null; $pending = $null
    if ($Mode -eq 'Execute' -and $taskPrivateValidated -and $taskExecuteEntered) {
        try {
            Assert-PrivateFile $taskPrivatePath
            Remove-Item -LiteralPath $taskPrivatePath -Force
            $taskReport.encryptedProfileRemoved = -not (Test-Path -LiteralPath $taskPrivatePath)
            if (-not $taskReport.encryptedProfileRemoved) { throw 'PRIVATE_DELETE_UNCONFIRMED' }
        } catch { $taskReport = [ordered]@{status = 'FAIL'; code = 'REDIS_VALIDATION_LOCAL_CLEANUP_FAILED'; networkUsed = $taskExecuteEntered; realPayments = 0; encryptedProfileRemoved = $false}; $taskExitCode = 1 }
        try {
            $bytes = [Text.Encoding]::UTF8.GetBytes(($taskReport | ConvertTo-Json -Compress -Depth 4) + "`n")
            $evidence = New-PrivateFile $taskEvidencePath
            try { $evidence.Write($bytes, 0, $bytes.Length); $evidence.Flush($true) } finally { $evidence.Dispose(); [Array]::Clear($bytes, 0, $bytes.Length) }
        } catch { $taskReport.status = 'FAIL'; $taskReport.code = 'REDIS_VALIDATION_EVIDENCE_UNCONFIRMED'; $taskExitCode = 1 }
    }
    if ($taskLockStream) {
        $taskLockStream.Dispose()
        try { $null = Assert-LocalPath $taskLockPath $false $true; Remove-Item -LiteralPath $taskLockPath -Force } catch { $taskReport.status = 'FAIL'; $taskReport.code = 'REDIS_VALIDATION_LOCAL_CLEANUP_FAILED'; $taskExitCode = 1 }
    }
}
[Console]::Out.WriteLine(($taskReport | ConvertTo-Json -Compress -Depth 4))
exit $taskExitCode
