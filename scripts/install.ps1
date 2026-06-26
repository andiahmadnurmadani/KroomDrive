# KroomDrive — One-line installer bootstrap for Windows PowerShell
# Usage: iwr -useb https://raw.githubusercontent.com/andiahmadnurmadani/kroomdrive/main/scripts/install.ps1 | iex
#    or: irm https://raw.githubusercontent.com/andiahmadnurmadani/kroomdrive/main/scripts/install.ps1 | iex

$ErrorActionPreference = "Stop"
$REPO_URL  = "https://github.com/andiahmadnurmadani/kroomdrive"
$BRANCH    = "main"
$INSTALL_DIR = if ($env:KROOMDRIVE_DIR) { $env:KROOMDRIVE_DIR } else { "$HOME\kroomdrive" }

function Write-Step($n, $msg) { Write-Host "`n  [$n] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)       { Write-Host "  + $msg" -ForegroundColor Green }
function Write-Info($msg)     { Write-Host "  i $msg" -ForegroundColor Blue }
function Write-Warn($msg)     { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Write-Fail($msg)     { Write-Host "  x $msg" -ForegroundColor Red; exit 1 }

Write-Host "`n  KroomDrive -- Installer Bootstrap" -ForegroundColor Cyan
Write-Host "  -----------------------------------`n"

# ── Check Python ──────────────────────────────────────────────────────────────
Write-Step 1 "Checking Python"
$python = $null
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python 3\.([\d]+)") {
            if ([int]$Matches[1] -ge 8) { $python = $cmd; Write-Ok "$ver"; break }
            else { Write-Warn "Python 3.8+ required, found: $ver" }
        }
    } catch {}
}
if (-not $python) {
    Write-Fail "Python 3.8+ not found. Install from https://python.org and check 'Add to PATH'"
}

# ── Clone or update ───────────────────────────────────────────────────────────
Write-Step 2 "Getting KroomDrive"
if (Test-Path "$INSTALL_DIR\.git") {
    Write-Info "Existing install at $INSTALL_DIR — updating…"
    git -C $INSTALL_DIR pull --ff-only origin $BRANCH
    Write-Ok "Updated"
} elseif (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Info "Cloning into $INSTALL_DIR…"
    git clone --depth 1 --branch $BRANCH $REPO_URL $INSTALL_DIR
    Write-Ok "Cloned"
} else {
    # Download ZIP
    Write-Warn "git not found — downloading ZIP archive…"
    $zip = [System.IO.Path]::GetTempFileName() + ".zip"
    $archiveUrl = "$REPO_URL/archive/refs/heads/$BRANCH.zip"
    Invoke-WebRequest -Uri $archiveUrl -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath "$HOME\kroomdrive_tmp" -Force
    $extracted = Get-ChildItem "$HOME\kroomdrive_tmp" -Directory | Select-Object -First 1
    Move-Item $extracted.FullName $INSTALL_DIR -Force
    Remove-Item $zip, "$HOME\kroomdrive_tmp" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Ok "Downloaded"
}

# ── Run Python installer ──────────────────────────────────────────────────────
Write-Step 3 "Running KroomDrive installer"
Write-Host "  -----------------------------------`n"
Set-Location $INSTALL_DIR
& $python install.py
