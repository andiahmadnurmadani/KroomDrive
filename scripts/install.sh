#!/usr/bin/env bash
# KroomDrive — One-line installer bootstrap
# Usage: curl -fsSL https://raw.githubusercontent.com/andiahmadnurmadani/kroomdrive/main/scripts/install.sh | bash
#    or: wget -qO- https://raw.githubusercontent.com/andiahmadnurmadani/kroomdrive/main/scripts/install.sh | bash
set -e

REPO_URL="https://github.com/andiahmadnurmadani/kroomdrive"
BRANCH="main"
INSTALL_DIR="${KROOMDRIVE_DIR:-$HOME/kroomdrive}"

RED='\033[91m'; GREEN='\033[92m'; YELLOW='\033[93m'; CYAN='\033[96m'; BOLD='\033[1m'; RESET='\033[0m'
info()  { echo -e "  ${CYAN}i${RESET}  $1"; }
ok()    { echo -e "  ${GREEN}✓${RESET}  $1"; }
warn()  { echo -e "  ${YELLOW}!${RESET}  ${YELLOW}$1${RESET}"; }
fail()  { echo -e "  ${RED}✗${RESET}  ${RED}$1${RESET}"; exit 1; }
step()  { echo -e "\n  ${BOLD}${CYAN}[$1]${RESET} ${BOLD}$2${RESET}"; }

echo -e "\n${CYAN}${BOLD}  KroomDrive — Installer Bootstrap${RESET}"
echo -e "  ${CYAN}─────────────────────────────────${RESET}\n"

# ── Check Python ──────────────────────────────────────────────────────────────
step 1 "Checking Python"
if command -v python3 &>/dev/null; then
    PYTHON=python3
    ver=$(python3 --version 2>&1)
    ok "$ver"
elif command -v python &>/dev/null; then
    PYTHON=python
    ver=$(python --version 2>&1)
    ok "$ver"
else
    fail "Python 3.8+ is required. Install it from https://python.org"
fi

# Verify version >= 3.8
$PYTHON -c "import sys; sys.exit(0 if sys.version_info >= (3,8) else 1)" || \
    fail "Python 3.8+ required. You have: $($PYTHON --version)"

# ── Check git & clone ─────────────────────────────────────────────────────────
step 2 "Getting KroomDrive"
if [ -d "$INSTALL_DIR/.git" ]; then
    info "Existing installation found at $INSTALL_DIR"
    info "Pulling latest changes…"
    git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH" && ok "Updated to latest"
elif command -v git &>/dev/null; then
    info "Cloning into $INSTALL_DIR…"
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
    ok "Cloned"
else
    # No git — try downloading archive
    warn "git not found, trying to download archive…"
    ARCHIVE_URL="${REPO_URL}/archive/refs/heads/${BRANCH}.tar.gz"
    TMP=$(mktemp -d)
    if command -v curl &>/dev/null; then
        curl -fsSL "$ARCHIVE_URL" | tar -xz -C "$TMP"
    elif command -v wget &>/dev/null; then
        wget -qO- "$ARCHIVE_URL" | tar -xz -C "$TMP"
    else
        fail "Neither git, curl, nor wget found. Please install git."
    fi
    mv "$TMP"/*/ "$INSTALL_DIR" 2>/dev/null || mv "$TMP"/kroomdrive-*/ "$INSTALL_DIR"
    ok "Downloaded"
fi

# ── Run Python installer ──────────────────────────────────────────────────────
step 3 "Running KroomDrive installer"
echo -e "  ${CYAN}─────────────────────────────────${RESET}\n"
cd "$INSTALL_DIR"
exec $PYTHON install.py
