# Life OS Windows launcher. This file intentionally uses ASCII only so that
# Windows PowerShell 5.1 can read it regardless of the system code page.
# Run with: powershell -ExecutionPolicy Bypass -File .\life-os.ps1

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $RepoRoot "life-os\backend"
$Frontend = Join-Path $RepoRoot "life-os\frontend"
$BackendPort = 3001
$FrontendPort = 5173
$AppUrl = "http://localhost:$FrontendPort"

function Write-Step([string]$Message) { Write-Host $Message -ForegroundColor Yellow }
function Write-Ok([string]$Message) { Write-Host $Message -ForegroundColor Green }
function Write-Err([string]$Message) { Write-Host $Message -ForegroundColor Red }

Write-Host ""
Write-Host "Life OS  $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor White
Write-Host "--------------------------------"

$EnvFile = Join-Path $Backend ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Err "Missing .env file: $EnvFile"
    Write-Host "Copy it with: copy life-os\backend\.env.example life-os\backend\.env"
    Write-Host "You can keep AI_RUNTIME=none or select Codex/OpenCode."
    Read-Host "Press Enter to exit"
    exit 1
}

# The frontend reads the same local backend .env through Vite.
$ConfiguredPort = Select-String -Path $EnvFile -Pattern '^\s*PORT=(\d+)' | Select-Object -Last 1
if ($ConfiguredPort) { $BackendPort = [int]$ConfiguredPort.Matches[0].Groups[1].Value }

if (-not (Test-Path (Join-Path $Backend "node_modules"))) {
    Write-Step "Installing backend dependencies..."
    Push-Location $Backend
    npm ci --silent
    Pop-Location
}
if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
    Write-Step "Installing frontend dependencies..."
    Push-Location $Frontend
    npm ci --silent
    Pop-Location
}

foreach ($Port in @($BackendPort, $FrontendPort)) {
    $Pids = (netstat -ano | Select-String ":$Port " | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Sort-Object -Unique) | Where-Object { $_ -match '^\d+$' }
    foreach ($ProcessId in $Pids) {
        Write-Host "Freeing port $Port (pid $ProcessId)..." -ForegroundColor DarkGray
        try { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue } catch {}
    }
}
Start-Sleep -Milliseconds 500

Write-Step "Starting backend..."
$BackendJob = Start-Job -ScriptBlock {
    param($Directory)
    Set-Location $Directory
    node --env-file=.env server.js
} -ArgumentList $Backend

$Ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:$BackendPort/api/config" -UseBasicParsing -TimeoutSec 1
        $Ready = $true
        break
    } catch {}
}

if (-not $Ready) {
    Write-Err "Backend did not start. Check .env and the output above."
    Stop-Job $BackendJob -ErrorAction SilentlyContinue
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Ok "Backend running"

Write-Step "Starting frontend..."
$FrontendJob = Start-Job -ScriptBlock {
    param($Directory, $Port)
    Set-Location $Directory
    npm run dev -- --port $Port
} -ArgumentList $Frontend, $FrontendPort

Start-Sleep -Seconds 3

Write-Ok "Opening browser..."
Start-Process $AppUrl

Write-Host ""
Write-Ok "Life OS is running: $AppUrl"
Write-Host "Close this window to stop the application." -ForegroundColor DarkGray
Write-Host "--------------------------------"

try {
    while ($true) {
        Start-Sleep -Seconds 2
        Receive-Job $BackendJob -ErrorAction SilentlyContinue
        Receive-Job $FrontendJob -ErrorAction SilentlyContinue
        if ($BackendJob.State -eq 'Failed') {
            Write-Err "Backend crashed. Check the output above."
            break
        }
    }
} finally {
    Stop-Job $BackendJob, $FrontendJob -ErrorAction SilentlyContinue
    Remove-Job $BackendJob, $FrontendJob -ErrorAction SilentlyContinue
}
