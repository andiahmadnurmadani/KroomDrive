# KroomDrive

**Self-hosted, multi-user file manager with SSH/SFTP access.**  
Connect any number of remote Linux, macOS, NAS, or FreeBSD servers, manage files through a clean web UI, and give each user access to exactly the folders they need.

---

## Quick Install

> **Requires:** Python 3.8+ and Node.js 18+

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/andiahmadnurmadani/kroomdrive/main/scripts/install.sh | bash
```

or with `wget`:

```bash
wget -qO- https://raw.githubusercontent.com/andiahmadnurmadani/kroomdrive/main/scripts/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/andiahmadnurmadani/kroomdrive/main/scripts/install.ps1 | iex
```

### Clone manually then install

```bash
git clone https://github.com/andiahmadnurmadani/kroomdrive
cd kroomdrive
python3 install.py
```

The installer handles everything — detects dependencies, installs npm packages, configures environment, sets up PM2.

---

## After install — starting KroomDrive

```bash
./start.sh          # start (PM2 mode)
./stop.sh           # stop
./restart.sh        # restart
pm2 logs            # view logs
pm2 status          # view process status
```

Then open `http://localhost:4343` (or the port you chose during install).

---

## Features

- 🗂 **File management** — Browse, upload, download, copy, move, rename, delete via SSH/SFTP
- 👥 **Multi-user** — Role-based access control; admin assigns per-user folder permissions (Read / Write / Delete) and storage quotas
- 🖥 **Multi-server** — Connect unlimited servers via direct SSH or **Cloudflare Tunnel**
- 🔀 **Git integration** — Floating panel with pull/push/fetch, commit, branch switch, diff viewer, private repo token support
- 🗑 **Trash / recycle bin** — Move to trash with restore; never lose files accidentally
- 📊 **Real-time progress** — Delete and extract operations show live progress via WebSocket
- 🌐 **OS auto-detection** — Adapts disk commands for Linux, macOS, Synology DSM, QNAP, TrueNAS, OpenWrt
- 🔒 **Private** — All data stays on your own infrastructure; no third-party cloud

---

## Requirements

| Requirement | Version | Notes |
|---|---|---|
| **Python** | 3.8+ | For the installer only |
| **Node.js** | 18+ | Runtime for both frontend and backend |
| **npm** | 8+ | Included with Node.js |
| **cloudflared** | Any | Optional — only for Cloudflare Tunnel connections |

---

## Installation

### One command

```bash
python3 install.py
```

The installer detects all dependencies automatically and guides you through configuration.

#### What it detects

| Dependency | Required | Notes |
|---|---|---|
| Node.js 18+ | ✅ Yes | https://nodejs.org |
| npm | ✅ Yes | Bundled with Node.js |
| git | No | For git integration features |
| PM2 | No | Offered for install if missing |
| cloudflared | No | For Cloudflare Tunnel connections |
| nginx | No | For production reverse proxy |

#### What the installer does

1. **Scans** your system for all dependencies, shows a status table
2. **Offers to install PM2** globally if not found
3. **Auto-detects free ports** (defaults: 4343 frontend, 4344 backend)
4. **Asks 4 questions** — ports, run mode, admin credentials, CORS
5. **Generates** a random 128-char JWT secret
6. **Installs** all npm packages (frontend + backend)
7. **Writes** `.env` files with your configuration
8. **Creates** launch scripts and PM2 ecosystem config
9. **Optionally starts** KroomDrive immediately via PM2
10. **Offers** to register PM2 for auto-start on system reboot

#### Run modes

| Mode | Command | Best for |
|---|---|---|
| **PM2** (recommended) | `./start.sh` | Production, VPS, always-on |
| **Dev** | `./start-dev.sh` | Local development |

---

## Starting KroomDrive

### After installation (PM2 mode)

```bash
./start.sh          # start
./stop.sh           # stop
./restart.sh        # restart

pm2 status          # view process status
pm2 logs            # stream all logs
pm2 logs kroomdrive-backend    # backend logs only
pm2 logs kroomdrive-frontend   # frontend logs only
```

### After installation (dev mode)

```bash
./start-dev.sh      # Linux/macOS
start-dev.bat       # Windows
```

### npm shortcuts (after install)

```bash
npm run start       # pm2 start
npm run stop        # pm2 stop
npm run restart     # pm2 restart
npm run logs        # pm2 logs
npm run status      # pm2 status
```

---

## First steps after login

```
Admin Console → Servers & Storage
```
1. **Add SSH Server** — enter hostname/IP, SSH username, password or private key  
   (or use Cloudflare Tunnel by selecting the Cloudflare option)
2. Click **Test Connection** to verify — OS is auto-detected
3. Define a **Storage** — give it a name and point it to a path on the server

```
Admin Console → Users
```
4. **Create users** — set username and password
5. Click a user → **Assign Storage** — choose the folder and set permissions (R/W/D) and optional quota

Users can now log in and see only their assigned folders.

---

## Project structure

```
kroomdrive/
├── install.py           ← Installer (run this first)
├── start.sh / start.bat ← Launch scripts (created by installer)
├── .env                 ← Frontend config (created by installer, gitignored)
├── .env.example         ← Template for manual setup
│
├── src/                 ← React frontend (TypeScript + Vite + Tailwind)
│   ├── components/
│   ├── contexts/
│   └── services/
│
└── backend/
    ├── .env             ← Backend secrets (created by installer, gitignored)
    ├── .env.example     ← Template for manual setup
    ├── data/
    │   ├── kroomdrive.db    ← SQLite database
    │   └── uploads/         ← Temporary upload staging
    └── src/
        ├── index.js         ← Express server + Socket.IO
        ├── db.js            ← SQLite schema + migrations
        ├── ssh.js           ← SSH/SFTP connection pool
        ├── osdetect.js      ← OS detection + command adapters
        └── routes/
            ├── auth.js
            ├── users.js
            ├── servers.js
            ├── storages.js
            ├── files.js
            └── git.js
```

---

## Manual setup (without the installer)

If you prefer to configure manually:

```bash
# 1. Install dependencies
npm install
cd backend && npm install && cd ..

# 2. Configure frontend
cp .env.example .env
# Edit .env if needed

# 3. Configure backend
cp backend/.env.example backend/.env
# Edit backend/.env — at minimum change JWT_SECRET and ADMIN_PASSWORD

# 4. Create data directories
mkdir -p backend/data/uploads

# 5. Start (two terminals)
cd backend && npm run dev   # terminal 1
npm run dev                 # terminal 2
```

---

## Environment variables

### Frontend (`.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_PORT` | `4343` | Dev server port |
| `VITE_BACKEND_URL` | `http://localhost:4344` | Backend URL for Vite proxy |

### Backend (`backend/.env`)

| Variable | Default | Required | Description |
|---|---|---|---|
| `PORT` | `4344` | — | Backend server port |
| `JWT_SECRET` | — | **Yes** | Random secret for signing tokens. Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_EXPIRES_IN` | `24h` | — | Token expiry (e.g. `8h`, `7d`) |
| `DB_PATH` | `./data/kroomdrive.db` | — | SQLite database path |
| `UPLOAD_TEMP_DIR` | `./data/uploads` | — | Temp dir for file uploads |
| `CORS_ORIGIN` | `*` | — | Allowed origins. Use your domain in production: `https://yourdomain.com` |
| `ADMIN_USERNAME` | `admin` | — | First admin username (first run only) |
| `ADMIN_PASSWORD` | — | **Yes** | First admin password (first run only, min 8 chars) |

---

## Production deployment

### Build frontend

```bash
npm run build
# Output in dist/ — serve as static files
```

### nginx config example

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend static files
    root /path/to/kroomdrive/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API to backend
    location /api {
        proxy_pass http://127.0.0.1:4344;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket for real-time progress
    location /socket.io {
        proxy_pass http://127.0.0.1:4344;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### Run backend as a service (systemd)

```ini
# /etc/systemd/system/kroomdrive.service
[Unit]
Description=KroomDrive Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/kroomdrive/backend
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
EnvironmentFile=/path/to/kroomdrive/backend/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kroomdrive
```

---

## Updating

```bash
git pull
npm install
cd backend && npm install && cd ..
# Restart the servers — database migrations run automatically on start
```

---

## Security notes

- **`JWT_SECRET`** must be a long random string in production. The installer generates one automatically.
- **`ADMIN_PASSWORD`** is only used on the very first run to seed the database. Change it via Admin Console after setup.
- **`CORS_ORIGIN`** should be set to your actual domain (`https://yourdomain.com`) in production, not `*`.
- SSH credentials and Git tokens are stored in the local SQLite database — keep `backend/data/` protected.
- Use **Personal Access Tokens** (not account passwords) for Git operations. Scope them to read/write only the repos you need.
- The `.env` files are gitignored and should **never** be committed.

---

## Troubleshooting

**Port already in use**
```bash
# Find what's using the port
lsof -i :4343   # macOS/Linux
netstat -ano | findstr 4343   # Windows
```
Re-run `python3 install.py` and choose different ports.

**`cloudflared` not found**
```
# macOS
brew install cloudflared

# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Windows
winget install Cloudflare.cloudflared
```

**Database locked / corrupted**
```bash
# Stop all servers, then
rm backend/data/kroomdrive.db
# Restart — database is recreated automatically
```

**Forgot admin password**
```bash
# Run this in the backend directory
node -e "
const db = require('better-sqlite3')('./data/kroomdrive.db');
const bcrypt = require('bcryptjs');
db.prepare(\"UPDATE users SET password=? WHERE role='admin'\").run(bcrypt.hashSync('newpassword123', 10));
console.log('Password reset to: newpassword123');
"
```

---

## License

MIT — free to use, modify, and distribute.
