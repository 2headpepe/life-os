# Life OS — Windows launcher (PowerShell)
# Double-click life-os.bat, or run directly:
#   powershell -ExecutionPolicy Bypass -File .\life-os.ps1

$ErrorActionPreference = "Stop"

$RepoRoot   = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend    = Join-Path $RepoRoot "life-os\backend"
$Frontend   = Join-Path $RepoRoot "life-os\frontend"
$BackendPort  = 3001
$FrontendPort = 5173
$AppUrl     = "http://localhost:$FrontendPort"

function Write-Step([string]$msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Ok([string]$msg)   { Write-Host $msg -ForegroundColor Green  }
function Write-Err([string]$msg)  { Write-Host $msg -ForegroundColor Red    }

Write-Host ""
Write-Host "Life OS  $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor White
Write-Host "────────────────────────────────"

# ── Check .env ──────────────────────────────────────────────
$EnvFile = Join-Path $Backend ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Err "No .env file found at $EnvFile"
    Write-Host "Copy the example: copy life-os\backend\.env.example life-os\backend\.env"
    Write-Host "Then add your API key."
    Read-Host "Press Enter to exit"
    exit 1
}

# ── Install dependencies if missing ──────────────────────────
if (-not (Test-Path (Join-Path $Backend "node_modules"))) {
    Write-Step "Installing backend dependencies..."
    Push-Location $Backend
    npm install --silent
    Pop-Location
}
if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
    Write-Step "Installing frontend dependencies..."
    Push-Location $Frontend
    npm install --silent
    Pop-Location
}

# ── Free ports ───────────────────────────────────────────────
foreach ($Port in @($BackendPort, $FrontendPort)) {
    $Pids = (netstat -ano | Select-String ":$Port " | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Sort-Object -Unique) | Where-Object { $_ -match '^\d+$' }
    foreach ($Pid in $Pids) {
        Write-Host "Freeing port $Port (pid $Pid)..." -ForegroundColor DarkGray
        try { Stop-Process -Id $Pid -Force -ErrorAction SilentlyContinue } catch {}
    }
}
Start-Sleep -Milliseconds 500

# ── Start backend ─────────────────────────────────────────────
Write-Step "Starting backend..."
$BackendJob = Start-Job -ScriptBlock {
    param($Dir)
    Set-Location $Dir
    node --env-file=.env server.js
} -ArgumentList $Backend

# Wait for backend to respond (up to 10 seconds)
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

# ── Start frontend ────────────────────────────────────────────
Write-Step "Starting frontend..."
$FrontendJob = Start-Job -ScriptBlock {
    param($Dir, $Port)
    Set-Location $Dir
    npm run dev -- --port $Port
} -ArgumentList $Frontend, $FrontendPort

Start-Sleep -Seconds 3

# ── Open browser ──────────────────────────────────────────────
Write-Ok "Opening browser..."
Start-Process $AppUrl

Write-Host ""
Write-Ok "Life OS is running → $AppUrl"
Write-Host "Close this window to stop." -ForegroundColor DarkGray
Write-Host "────────────────────────────────"

# ── Keep alive, stream job output ────────────────────────────
try {
    while ($true) {
        Start-Sleep -Seconds 2
        Receive-Job $BackendJob  -ErrorAction SilentlyContinue
        Receive-Job $FrontendJob -ErrorAction SilentlyContinue
        if ($BackendJob.State -eq 'Failed') {
            Write-Err "Backend crashed. Check the output above."
            break
        }
    }
} finally {
    Stop-Job  $BackendJob,  $FrontendJob -ErrorAction SilentlyContinue
    Remove-Job $BackendJob, $FrontendJob -ErrorAction SilentlyContinue
}
