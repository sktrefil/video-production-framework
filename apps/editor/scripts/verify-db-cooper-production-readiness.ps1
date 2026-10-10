param()

$ErrorActionPreference = 'Stop'
$editorRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $editorRoot '..\..')).Path
$projectWorkspace = (Resolve-Path -LiteralPath (Join-Path $editorRoot 'output\db-cooper-v3\canonical-workspace')).Path
$priorWorkspaceRoot = [Environment]::GetEnvironmentVariable('VPF_WORKSPACE_ROOT', 'Process')
Remove-Item Env:VPF_WORKSPACE_ROOT -ErrorAction SilentlyContinue

$envFile = Join-Path $repositoryRoot '.env'
if (Test-Path -LiteralPath $envFile) {
    foreach ($line in Get-Content -LiteralPath $envFile -Encoding utf8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) { continue }
        $parts = $trimmed.Split('=', 2)
        $key = $parts[0].Trim() -replace '^export\s+', ''
        $value = $parts[1].Trim().Trim('"').Trim("'")
        if ($key -and -not [Environment]::GetEnvironmentVariable($key, 'Process')) {
            [Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
}

$checks = @(
    @{ Name = 'build'; Command = @('npm', 'run', 'build') },
    @{ Name = 'typecheck'; Command = @('npm', 'run', 'typecheck') },
    @{ Name = 'tests'; Command = @('npm', 'test') },
    @{ Name = 'LONGFORM E2E'; Command = @('npm', 'run', 'check:e2e') },
    @{ Name = 'pilot-readiness CI'; Command = @('npm', 'run', 'check:pilot-readiness') },
    @{ Name = 'Cooper project preflight'; Command = @('node', 'cli/vpf/dist/entry.js', 'pilot', 'preflight', 'db_cooper_1971_4m30_v3', '--min-free-gb', '0') }
)

Push-Location -LiteralPath $repositoryRoot
try {
    foreach ($check in $checks) {
        Write-Host "CHECK $($check.Name)"
        if ($check.Name -eq 'Cooper project preflight') {
            $env:VPF_WORKSPACE_ROOT = $projectWorkspace
        } else {
            Remove-Item Env:VPF_WORKSPACE_ROOT -ErrorAction SilentlyContinue
        }
        $program = $check.Command[0]
        $arguments = @($check.Command | Select-Object -Skip 1)
        & $program @arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$($check.Name) failed with exit code $LASTEXITCODE. CL01 media generation remains on hold."
        }
    }
    Write-Host 'PASS: required CI checks and Cooper project preflight are green.'
} finally {
    if ($null -eq $priorWorkspaceRoot) {
        Remove-Item Env:VPF_WORKSPACE_ROOT -ErrorAction SilentlyContinue
    } else {
        $env:VPF_WORKSPACE_ROOT = $priorWorkspaceRoot
    }
    Pop-Location
}
