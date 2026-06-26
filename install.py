#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KroomDrive Installer
Detects all dependencies, configures environment, sets up PM2 for production.
Usage: python3 install.py
"""

import os
import sys
import json
import shutil
import secrets
import platform
import subprocess
import socket
import getpass
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
BACKEND_DIR = ROOT / "backend"
SYSTEM = platform.system()  # Windows / Linux / Darwin

# Detect if running non-interactively (piped from curl | bash | python)
IS_TTY = sys.stdin.isatty()


# ─── Terminal colors ──────────────────────────────────────────────────────────

NO_COLOR = not sys.stdout.isatty() or SYSTEM == "Windows" and not os.environ.get("WT_SESSION")

def _c(code, text):
    if NO_COLOR:
        return text
    return f"\033[{code}m{text}\033[0m"

def bold(t):   return _c("1", t)
def red(t):    return _c("91", t)
def green(t):  return _c("92", t)
def yellow(t): return _c("93", t)
def blue(t):   return _c("94", t)
def cyan(t):   return _c("96", t)
def gray(t):   return _c("90", t)

def ok(msg):    print(f"  {green('✓')}  {msg}")
def fail(msg):  print(f"  {red('✗')}  {red(msg)}")
def warn(msg):  print(f"  {yellow('!')}  {yellow(msg)}")
def info(msg):  print(f"  {blue('i')}  {msg}")
def step(n, title): print(f"\n  {bold(cyan(f'[{n}]'))} {bold(title)}")

def ask(prompt, default=""):
    suffix = f" [{default}]" if default else ""
    if not IS_TTY:
        # Non-interactive: just use default
        val = default
        print(f"      {gray('›')} {prompt}{gray(suffix)}: {cyan(val) if val else gray('(default)')}")
        return val
    try:
        val = input(f"      {gray('›')} {prompt}{gray(suffix)}: ").strip()
        return val if val else default
    except (KeyboardInterrupt, EOFError):
        print()
        sys.exit(0)

def ask_bool(prompt, default=True):
    hint = "[Y/n]" if default else "[y/N]"
    val = ask(f"{prompt} {hint}", "Y" if default else "N").lower()
    return val in ("y", "yes", "1", "true")

def ask_secret(prompt):
    if not IS_TTY:
        # Non-interactive: generate a random password
        import secrets as _s
        val = _s.token_urlsafe(16)
        print(f"      {gray('›')} {prompt}: {gray('(auto-generated)')}")
        return val
    try:
        val = getpass.getpass(f"      {gray('›')} {prompt}: ").strip()
        return val
    except (KeyboardInterrupt, EOFError):
        print()
        sys.exit(0)


def banner():
    print(f"""
{cyan(bold("  KroomDrive Installer"))}
  {gray("Self-hosted multi-user SSH file manager")}
  {gray("─" * 42)}
""")


# ─── Dependency detection ─────────────────────────────────────────────────────

class Dep:
    """Represents a detected dependency with version info."""
    def __init__(self, name, cmd, required, version_flag="--version",
                 install_url="", install_hint="", min_version=None):
        self.name        = name
        self.cmd         = cmd
        self.required    = required
        self.version_flag = version_flag
        self.install_url = install_url
        self.install_hint = install_hint
        self.min_version = min_version  # tuple e.g. (18,) for Node 18+
        self.found       = False
        self.version     = None
        self.version_raw = ""
        self.path        = ""

    def detect(self):
        path = shutil.which(self.cmd)
        if not path:
            self.found = False
            return self

        self.found = True
        self.path  = path

        try:
            r = subprocess.run(
                [self.cmd, self.version_flag],
                capture_output=True, text=True, timeout=10
            )
            raw = (r.stdout or r.stderr).strip().split("\n")[0]
            self.version_raw = raw[:80]
            # Extract semver-like numbers
            import re
            m = re.search(r"(\d+)\.(\d+)\.?(\d*)", raw)
            if m:
                self.version = tuple(int(x) for x in m.groups() if x)
        except Exception:
            self.version_raw = "unknown"

        # Min version check
        if self.min_version and self.version:
            if self.version < self.min_version:
                self.found = False  # Treat as missing (too old)
                self.version_raw = f"{self.version_raw} (need {'.'.join(map(str, self.min_version))}+)"

        return self


DEPS = [
    Dep("Node.js",      "node",         required=True,
        version_flag="--version",
        min_version=(18,),
        install_url="https://nodejs.org",
        install_hint="Install Node.js 18+ from https://nodejs.org"),
    Dep("npm",          "npm",          required=True,
        version_flag="--version",
        install_hint="Included with Node.js"),
    Dep("git",          "git",          required=False,
        version_flag="--version",
        install_hint="Install git: https://git-scm.com"),
    Dep("PM2",          "pm2",          required=False,
        version_flag="--version",
        install_hint="Will be installed automatically if you choose PM2 mode"),
    Dep("cloudflared",  "cloudflared",  required=False,
        version_flag="--version",
        install_url="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
        install_hint="Optional — only needed for Cloudflare Tunnel SSH connections"),
    Dep("nginx",        "nginx",        required=False,
        version_flag="-v",
        install_hint="Optional — for production reverse proxy"),
]


def run_detection():
    """Detect all dependencies and return results."""
    results = {}
    for dep in DEPS:
        dep.detect()
        results[dep.cmd] = dep
    return results


def print_dep_table(deps):
    """Print a formatted dependency table."""
    print()
    print(f"  {'Dependency':<16} {'Status':<12} Version")
    print(f"  {'─'*16} {'─'*12} {'─'*30}")
    for dep in DEPS:
        if dep.found:
            status = green("✓  found")
            ver = gray(dep.version_raw[:35])
        elif dep.required:
            status = red("✗  MISSING")
            ver = red("required")
        else:
            status = yellow("–  not found")
            ver = gray("optional")
        print(f"  {dep.name:<16} {status:<20} {ver}")
    print()


def abort_if_missing(deps):
    missing = [d for d in DEPS if d.required and not d.found]
    if missing:
        print()
        for d in missing:
            fail(f"{d.name} is required but not found.")
            if d.install_hint:
                print(f"     {gray(d.install_hint)}")
        print()
        sys.exit(1)


# ─── Port utilities ───────────────────────────────────────────────────────────

def port_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) != 0


def next_free(preferred, step=1, count=30):
    if port_free(preferred):
        return preferred
    for i in range(1, count + 1):
        p = preferred + i * step
        if 1024 < p < 65535 and port_free(p):
            return p
    return preferred


# ─── npm helpers ─────────────────────────────────────────────────────────────

def npm_install(cwd, label):
    info(f"Installing {label} npm packages…")
    r = subprocess.run(
        ["npm", "install", "--no-audit", "--no-fund", "--prefer-offline"],
        cwd=str(cwd), capture_output=True, text=True
    )
    if r.returncode != 0:
        fail(f"npm install failed for {label}")
        print(r.stderr[-600:])
        sys.exit(1)
    ok(f"{label} packages installed")


def npm_global_install(pkg):
    """Install a global npm package."""
    info(f"Installing {pkg} globally…")
    r = subprocess.run(
        ["npm", "install", "-g", pkg, "--no-audit", "--no-fund"],
        capture_output=True, text=True
    )
    if r.returncode != 0:
        fail(f"Failed to install {pkg}: {r.stderr[-300:]}")
        sys.exit(1)
    ok(f"{pkg} installed globally")


# ─── PM2 ecosystem config ─────────────────────────────────────────────────────

def write_pm2_config(frontend_port, backend_port):
    cfg = {
        "apps": [
            {
                "name":          "kroomdrive-backend",
                "script":        "src/index.js",
                "cwd":           str(BACKEND_DIR),
                "instances":     1,
                "exec_mode":     "fork",
                "watch":         False,
                "autorestart":   True,
                "restart_delay": 3000,
                "max_restarts":  10,
                "env": {
                    "NODE_ENV": "production"
                },
                "error_file":    str(BACKEND_DIR / "data" / "pm2-error.log"),
                "out_file":      str(BACKEND_DIR / "data" / "pm2-out.log"),
                "merge_logs":    True,
                "log_date_format": "YYYY-MM-DD HH:mm:ss"
            },
            {
                "name":          "kroomdrive-frontend",
                "script":        "node_modules/.bin/vite",
                "args":          f"--port {frontend_port} --host 0.0.0.0",
                "cwd":           str(ROOT),
                "instances":     1,
                "exec_mode":     "fork",
                "watch":         False,
                "autorestart":   True,
                "restart_delay": 3000,
                "max_restarts":  10,
                "env": {
                    "NODE_ENV": "development"
                },
                "error_file":    str(ROOT / "pm2-fe-error.log"),
                "out_file":      str(ROOT / "pm2-fe-out.log"),
                "merge_logs":    True
            }
        ]
    }
    path = ROOT / "ecosystem.config.json"
    path.write_text(json.dumps(cfg, indent=2))
    ok(f"PM2 ecosystem config: {path.name}")
    return path


# ─── Launch scripts ───────────────────────────────────────────────────────────

def write_dev_scripts(frontend_port, backend_port):
    """Simple dev-mode launch scripts (no PM2)."""
    if SYSTEM == "Windows":
        s = ROOT / "start-dev.bat"
        s.write_text(f"@echo off\ntitle KroomDrive Dev\n"
                     f"start \"Backend\" cmd /k \"cd /d %~dp0backend && npm run dev\"\n"
                     f"timeout /t 2 /nobreak >nul\n"
                     f"start \"Frontend\" cmd /k \"cd /d %~dp0 && npm run dev\"\n")
        ok("Dev launch script: start-dev.bat")
    else:
        s = ROOT / "start-dev.sh"
        s.write_text(f"""#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/backend" && npm run dev &
sleep 1
cd "$ROOT" && npm run dev &
echo "KroomDrive running — http://localhost:{frontend_port}"
echo "Press Ctrl+C to stop."
trap "kill 0" INT TERM; wait
""")
        s.chmod(0o755)
        ok("Dev launch script: start-dev.sh")


def write_pm2_scripts():
    """Scripts that use PM2."""
    if SYSTEM == "Windows":
        (ROOT / "start.bat").write_text(
            "@echo off\necho Starting KroomDrive via PM2...\n"
            "pm2 start ecosystem.config.json\npm2 save\n"
            "echo Done. Use: pm2 logs kroomdrive-backend\n"
        )
        (ROOT / "stop.bat").write_text(
            "@echo off\npm2 stop ecosystem.config.json\necho Stopped.\n"
        )
        ok("PM2 scripts: start.bat / stop.bat")
    else:
        start = ROOT / "start.sh"
        start.write_text(
            "#!/usr/bin/env bash\n"
            "cd \"$(dirname \"$0\")\"\n"
            "echo 'Starting KroomDrive via PM2...'\n"
            "pm2 start ecosystem.config.json\n"
            "pm2 save\n"
            "echo 'Use: pm2 logs   |   pm2 status   |   ./stop.sh'\n"
        )
        start.chmod(0o755)

        stop = ROOT / "stop.sh"
        stop.write_text(
            "#!/usr/bin/env bash\n"
            "cd \"$(dirname \"$0\")\"\n"
            "pm2 stop ecosystem.config.json && echo 'Stopped.'\n"
        )
        stop.chmod(0o755)

        restart = ROOT / "restart.sh"
        restart.write_text(
            "#!/usr/bin/env bash\n"
            "cd \"$(dirname \"$0\")\"\n"
            "pm2 restart ecosystem.config.json && echo 'Restarted.'\n"
        )
        restart.chmod(0o755)
        ok("PM2 scripts: start.sh / stop.sh / restart.sh")


def write_env_files(frontend_port, backend_port, admin_user,
                    admin_pass, jwt_secret, cors_origin):
    fe_env = ROOT / ".env"
    fe_env.write_text(
        f"# KroomDrive frontend — generated by install.py\n"
        f"VITE_PORT={frontend_port}\n"
        f"VITE_BACKEND_URL=http://localhost:{backend_port}\n"
    )
    ok(f"Frontend .env → {fe_env}")

    be_env = BACKEND_DIR / ".env"
    be_env.write_text(
        f"# KroomDrive backend — generated by install.py\n"
        f"# KEEP SECRET — never commit this file!\n\n"
        f"PORT={backend_port}\n\n"
        f"# JWT — randomly generated\n"
        f"JWT_SECRET={jwt_secret}\n"
        f"JWT_EXPIRES_IN=24h\n\n"
        f"# Paths\n"
        f"DB_PATH=./data/kroomdrive.db\n"
        f"UPLOAD_TEMP_DIR=./data/uploads\n\n"
        f"# CORS — set to your domain in production\n"
        f"CORS_ORIGIN={cors_origin}\n\n"
        f"# First-run admin account\n"
        f"ADMIN_USERNAME={admin_user}\n"
        f"ADMIN_PASSWORD={admin_pass}\n"
    )
    ok(f"Backend  .env → {be_env}")


# ─── Startup + systemd helper ─────────────────────────────────────────────────

def offer_pm2_startup(use_pm2):
    """Offer to register PM2 as system startup service."""
    if not use_pm2 or SYSTEM == "Windows":
        return
    print()
    if ask_bool("Register PM2 to auto-start on system reboot?", default=False):
        print()
        info("Running: pm2 startup")
        r = subprocess.run(["pm2", "startup"], capture_output=True, text=True)
        output = (r.stdout + r.stderr).strip()
        # PM2 startup often prints a sudo command to run
        lines = [l for l in output.split("\n") if "sudo" in l.lower() or "pm2" in l.lower()]
        if lines:
            print()
            warn("PM2 may require you to run the following command as root:")
            for l in lines[:3]:
                print(f"  {cyan(l.strip())}")
        else:
            ok("PM2 startup registered")
        print()
        subprocess.run(["pm2", "save"], capture_output=True)
        ok("PM2 process list saved")


def pm2_start_now(eco_path):
    """Start KroomDrive via PM2 immediately after install."""
    info("Starting KroomDrive with PM2…")
    r = subprocess.run(
        ["pm2", "start", str(eco_path)],
        capture_output=True, text=True
    )
    if r.returncode == 0:
        ok("KroomDrive started via PM2")
        subprocess.run(["pm2", "save"], capture_output=True)
        ok("PM2 process list saved")
        return True
    else:
        warn(f"PM2 start failed: {r.stderr[-200:]}")
        return False


# ─── Main installer ───────────────────────────────────────────────────────────

def main():
    banner()

    # ── Step 1: Detect dependencies ───────────────────────────────────────────
    step(1, "Detecting dependencies")
    info("Scanning your system…")
    deps = run_detection()
    print_dep_table(deps)
    abort_if_missing(deps)

    # PM2 special case: offer to install if missing
    has_pm2 = deps["pm2"].found
    if not has_pm2:
        warn("PM2 not found. It provides auto-restart and process management.")
        if ask_bool("Install PM2 globally now?", default=True):
            npm_global_install("pm2")
            deps["pm2"].detect()
            has_pm2 = deps["pm2"].found
            if not has_pm2:
                warn("PM2 install succeeded but not found in PATH yet. "
                     "You may need to open a new terminal and re-run.")
                has_pm2 = False

    # ── Step 2: Ports ─────────────────────────────────────────────────────────
    step(2, "Port configuration")

    fe_port = next_free(4343)
    be_port = next_free(4344)

    if fe_port != 4343: warn(f"Port 4343 busy → using {fe_port} for frontend")
    else:               ok(f"Frontend port: {fe_port}")
    if be_port != 4344: warn(f"Port 4344 busy → using {be_port} for backend")
    else:               ok(f"Backend  port: {be_port}")

    if ask_bool("\n  Change ports?", default=False):
        try:
            fe_port = int(ask("Frontend port", str(fe_port)))
            be_port = int(ask("Backend  port", str(be_port)))
            if fe_port == be_port:
                fail("Frontend and backend ports must be different")
                sys.exit(1)
        except ValueError:
            fail("Invalid port number")
            sys.exit(1)

    # ── Step 3: Run mode ──────────────────────────────────────────────────────
    step(3, "Run mode")
    if not IS_TTY:
        info("Non-interactive mode — using PM2 if available, dev mode otherwise.")
        use_pm2 = has_pm2
        ok(f"Mode: {'PM2 (production)' if use_pm2 else 'Dev (simple)'}")
    else:
        print(f"  {gray('PM2')}  — managed process, auto-restart, logs, startup on reboot {green('(recommended)')}")
        print(f"  {gray('Dev')}  — simple background shell processes, easy for development")
        print()
        use_pm2 = has_pm2 and ask_bool("Use PM2?", default=True)
        ok(f"Mode: {'PM2 (production)' if use_pm2 else 'Dev (simple)'}")

    # ── Step 4: Admin account ─────────────────────────────────────────────────
    step(4, "Admin account")
    if IS_TTY:
        info("This seeds the first admin user. Only used on the very first run.")
        print()
        admin_user = ask("Admin username", "admin")
        while True:
            admin_pass = ask_secret("Admin password (min 8 chars)")
            if len(admin_pass) < 8:
                warn("Password must be at least 8 characters")
                continue
            admin_pass2 = ask_secret("Confirm password")
            if admin_pass != admin_pass2:
                warn("Passwords do not match, try again")
                continue
            break
    else:
        admin_user = "admin"
        admin_pass = secrets.token_urlsafe(16)
        warn("Non-interactive mode — admin credentials auto-generated:")
        print(f"      Username : {cyan(admin_user)}")
        print(f"      Password : {cyan(admin_pass)}")
        print(f"      {yellow('Save this password! You can change it later in Admin Console.')}")
    ok(f"Username: {admin_user}")
    ok("Password: set")

    # ── Step 5: CORS ──────────────────────────────────────────────────────────
    step(5, "Allowed origins (CORS)")
    if IS_TTY:
        print(f"  {gray('*')}               — allow all (fine for local/home use)")
        print(f"  {gray('https://x.com')} — restrict to your domain (production)")
        print()
        cors = ask("CORS origin", "*")
    else:
        cors = "*"
        ok(f"CORS origin: {cors} (default)")

    # ── Step 6: Security keys ─────────────────────────────────────────────────
    step(6, "Generating security keys")
    jwt_secret = secrets.token_hex(64)
    ok(f"JWT secret generated (128-char hex)")

    # ── Step 7: Install npm packages ──────────────────────────────────────────
    step(7, "Installing npm packages")
    npm_install(ROOT, "Frontend")
    npm_install(BACKEND_DIR, "Backend")

    # ── Step 8: Directories & env files ──────────────────────────────────────
    step(8, "Setting up directories and config files")
    (BACKEND_DIR / "data" / "uploads").mkdir(parents=True, exist_ok=True)
    ok("Data directories ready")
    write_env_files(fe_port, be_port, admin_user, admin_pass, jwt_secret, cors)

    # ── Step 9: PM2 / scripts ─────────────────────────────────────────────────
    step(9, "Creating launch scripts")
    if use_pm2:
        eco = write_pm2_config(fe_port, be_port)
        write_pm2_scripts()
    else:
        write_dev_scripts(fe_port, be_port)

    # ── Step 10: Start now? ───────────────────────────────────────────────────
    started = False
    if use_pm2:
        step(10, "Starting KroomDrive")
        should_start = True if not IS_TTY else ask_bool("Start KroomDrive now via PM2?", default=True)
        if should_start:
            started = pm2_start_now(eco)
        if IS_TTY:
            offer_pm2_startup(use_pm2)
        elif SYSTEM != "Windows":
            # Auto-register startup in non-interactive mode
            info("Registering PM2 startup service…")
            subprocess.run(["pm2", "startup"], capture_output=True)
            subprocess.run(["pm2", "save"], capture_output=True)
            ok("PM2 startup registered")

    # ── Done ──────────────────────────────────────────────────────────────────
    launch_cmd = ("start.bat" if SYSTEM == "Windows"
                  else ("pm2 start ecosystem.config.json" if use_pm2 else "./start-dev.sh"))

    print(f"""
  {bold(green("─" * 52))}
  {bold(green("  Installation complete!"))}
  {bold(green("─" * 52))}
""")

    if started:
        print(f"  {bold('KroomDrive is running:')}")
        print(f"  {cyan(f'http://localhost:{fe_port}')}")
    else:
        print(f"  {bold('Start KroomDrive:')}")
        print(f"  {cyan(launch_cmd)}")
        print()
        print(f"  {bold('Then open:')}")
        print(f"  {cyan(f'http://localhost:{fe_port}')}")

    print(f"""
  {bold('Login:')}
    Username: {cyan(admin_user)}
    Password: {gray('(what you just set)')}

  {bold('Useful PM2 commands:')}
    {cyan('pm2 status')}              — view running processes
    {cyan('pm2 logs')}                — stream all logs
    {cyan('pm2 logs kroomdrive-backend')} — backend logs only
    {cyan('pm2 restart all')}         — restart both services
    {cyan('pm2 stop all')}            — stop both services
    {cyan('./restart.sh')}            — quick restart

  {yellow('Keep')} {bold(yellow('backend/.env'))} {yellow('secret — it contains your JWT secret.')}\n""")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n  {yellow('Installation cancelled.')}\n")
        sys.exit(0)
