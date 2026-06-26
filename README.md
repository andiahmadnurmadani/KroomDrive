<div align="center">

<!-- Logo / Banner -->
<img src="https://raw.githubusercontent.com/andiahmadnurmadani/KroomDrive/main/public/banner.png" alt="KroomDrive Banner" width="100%" />

<br/>

# KroomDrive

**Self-hosted, multi-user SSH file manager**  
Built with ❤️ by [KroomBox](https://kroombox.com)

<br/>

[![GitHub release](https://img.shields.io/github/v/release/andiahmadnurmadani/kroomdrive?style=flat-square&color=4318FF&label=version)](https://github.com/andiahmadnurmadani/KroomDrive/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-4318FF?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Python](https://img.shields.io/badge/python-3.8%2B-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![KroomBox](https://img.shields.io/badge/by-KroomBox-E1306C?style=flat-square&logo=instagram&logoColor=white)](https://instagram.com/kroombox)

<br/>

[🌐 Website](https://kroombox.com) &nbsp;·&nbsp;
[📸 Instagram](https://instagram.com/kroombox) &nbsp;·&nbsp;
[🐛 Issues](https://github.com/andiahmadnurmadani/KroomDrive/issues) &nbsp;·&nbsp;
[⭐ Star this repo](https://github.com/andiahmadnurmadani/KroomDrive)

</div>

---

## ✨ What is KroomDrive?

KroomDrive is a **self-hosted file manager** that lets you browse, upload, and manage files on any remote Linux/macOS/NAS server — directly from your browser. No cloud. No subscription. Your data stays on your own servers.

<div align="center">
<br/>

<!-- Main Screenshot -->
<img src="https://raw.githubusercontent.com/andiahmadnurmadani/KroomDrive/main/public/screenshot-main.png" alt="KroomDrive Dashboard" width="90%" style="border-radius:12px" />

<br/><br/>

</div>

## 🚀 Features

<table>
<tr>
<td width="50%">

**📁 File Management**
- Browse, upload, download files via SSH/SFTP
- Copy, move, rename, delete with trash support
- Real-time progress for bulk operations
- Archive extraction (zip, tar)

**👥 Multi-User**
- Role-based access control (admin / user)
- Per-user folder permissions (Read / Write / Delete)
- Storage quota enforcement
- User-scoped real-time events (WebSocket)

**🔀 Git Integration**
- Floating panel with pull / push / fetch
- Commit, branch switch, diff viewer
- Private repo support (PAT tokens)
- Auto-detect `.git` repositories

</td>
<td width="50%">

**🖥 Multi-Server**
- Connect unlimited remote servers
- Direct SSH or **Cloudflare Tunnel**
- Auto-detects OS (Linux, macOS, Synology, QNAP, TrueNAS)

**🎨 Modern UI**
- Clean dashboard design
- Collapsible sidebar
- Draggable, resizable Git panel
- Grid & list view modes

**🔒 Secure**
- JWT authentication
- Per-user session isolation
- All data on your own infrastructure
- No third-party cloud involved

</td>
</tr>
</table>

<div align="center">
<br/>

<!-- Grid Screenshots -->
<img src="https://raw.githubusercontent.com/andiahmadnurmadani/KroomDrive/main/public/screenshot-admin.png" alt="Admin Console" width="45%" style="border-radius:10px; margin:6px" />
&nbsp;
<img src="https://raw.githubusercontent.com/andiahmadnurmadani/KroomDrive/main/public/screenshot-git.png" alt="Git Panel" width="45%" style="border-radius:10px; margin:6px" />

<sub>Admin Console · Git Integration Panel</sub>

<br/><br/>

</div>

---

## ⚡ Quick Install

> **Prerequisites:** Python 3.8+ &nbsp;·&nbsp; Node.js 18+

<table>
<tr>
<th>Platform</th>
<th>Command</th>
</tr>
<tr>
<td><b>Linux / macOS</b></td>
<td>

```bash
curl -fsSL https://raw.githubusercontent.com/andiahmadnurmadani/KroomDrive/main/scripts/install.sh | bash
```

</td>
</tr>
<tr>
<td><b>Linux / macOS</b><br/><sub>(wget)</sub></td>
<td>

```bash
wget -qO- https://raw.githubusercontent.com/andiahmadnurmadani/KroomDrive/main/scripts/install.sh | bash
```

</td>
</tr>
<tr>
<td><b>Windows</b><br/><sub>(PowerShell)</sub></td>
<td>

```powershell
irm https://raw.githubusercontent.com/andiahmadnurmadani/KroomDrive/main/scripts/install.ps1 | iex
```

</td>
</tr>
<tr>
<td><b>Manual</b></td>
<td>

```bash
git clone https://github.com/andiahmadnurmadani/KroomDrive
cd KroomDrive
python3 install.py
```

</td>
</tr>
</table>

The installer will:
1. 🔍 Detect Node.js, npm, git, PM2, cloudflared
2. 🔌 Auto-find available ports
3. 🔐 Generate a secure JWT secret
4. 📦 Install all npm packages
5. ⚙️ Write your `.env` configuration
6. 🚀 Set up **PM2** for auto-restart on crash/reboot

---

## 🎬 Getting Started

After installation, open your browser:

```
http://localhost:4343
```

Log in with the admin credentials you set during install, then:

| Step | Where | What to do |
|---|---|---|
| 1 | Admin Console → Servers & Storage | Add your first SSH server |
| 2 | Click **Test Connection** | Verify connectivity & detect OS |
| 3 | Define a **Storage** | Name a path on the server |
| 4 | Admin Console → Users | Create user accounts |
| 5 | Click a user → **Assign Storage** | Set folder + R/W/D permissions |

Users log in and see **only** their assigned folders.

---

## 🛠 Managing KroomDrive

```bash
./start.sh          # Start via PM2
./stop.sh           # Stop
./restart.sh        # Restart

pm2 status          # View process status
pm2 logs            # Stream all logs
pm2 logs kroomdrive-backend    # Backend logs only
```

---

## 📁 Project Structure

```
KroomDrive/
├── install.py              ← Interactive installer
├── scripts/
│   ├── install.sh          ← One-liner for Linux/macOS
│   └── install.ps1         ← One-liner for Windows
│
├── src/                    ← React frontend (TypeScript + Vite + Tailwind)
│   ├── components/
│   ├── contexts/
│   └── services/
│
└── backend/
    ├── data/
    │   └── kroomdrive.db   ← SQLite database
    └── src/
        ├── index.js        ← Express + Socket.IO
        ├── db.js           ← Schema + migrations
        ├── ssh.js          ← SSH/SFTP connection pool
        ├── osdetect.js     ← OS detection + adapters
        └── routes/
            ├── auth.js
            ├── users.js
            ├── servers.js
            ├── files.js
            └── git.js
```

---

## ⚙️ Configuration

### Frontend `.env`

| Variable | Default | Description |
|---|---|---|
| `VITE_PORT` | `4343` | Dev server port |
| `VITE_BACKEND_URL` | `http://localhost:4344` | Backend URL |

### Backend `backend/.env`

| Variable | Required | Description |
|---|---|---|
| `PORT` | — | Backend port (default `4344`) |
| `JWT_SECRET` | ✅ | Random secret — auto-generated by installer |
| `JWT_EXPIRES_IN` | — | Token expiry (default `24h`) |
| `DB_PATH` | — | SQLite path (default `./data/kroomdrive.db`) |
| `CORS_ORIGIN` | — | Allowed origins (default `*`) |
| `ADMIN_USERNAME` | — | First admin username (first run only) |
| `ADMIN_PASSWORD` | ✅ | First admin password (first run only) |

---

## 🔒 Security

- **JWT** signed with a randomly-generated secret (never hardcoded)
- **Per-user isolation** — users can only access their assigned paths
- **User-scoped WebSocket rooms** — progress events never leak between users
- **No cloud** — everything runs on your own servers
- **`.env` files are gitignored** — credentials never committed

For production, set:
```env
CORS_ORIGIN=https://yourdomain.com
JWT_EXPIRES_IN=8h
```

---

## 🚀 Production Deployment

```bash
# Build frontend
npm run build

# Run backend with PM2 (already set up by installer)
pm2 start ecosystem.config.json
pm2 save
pm2 startup   # auto-start on reboot
```

**nginx config:**

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    root /path/to/KroomDrive/dist;
    index index.html;

    location / { try_files $uri $uri/ /index.html; }

    location /api {
        proxy_pass http://127.0.0.1:4344;
        proxy_set_header Host $host;
    }

    location /socket.io {
        proxy_pass http://127.0.0.1:4344;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 🔧 Troubleshooting

<details>
<summary><b>Port already in use</b></summary>

```bash
# Linux/macOS — find what's using the port
lsof -i :4343
# Windows
netstat -ano | findstr 4343
```

Re-run `python3 install.py` and choose different ports.

</details>

<details>
<summary><b>cloudflared not found</b></summary>

```bash
# macOS
brew install cloudflared

# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared

# Windows
winget install Cloudflare.cloudflared
```

</details>

<details>
<summary><b>Forgot admin password</b></summary>

```bash
cd backend
node -e "
const db = require('better-sqlite3')('./data/kroomdrive.db');
const bcrypt = require('bcryptjs');
db.prepare(\"UPDATE users SET password=? WHERE role='admin'\")
  .run(bcrypt.hashSync('newpassword123', 10));
console.log('Password reset to: newpassword123');
"
```

</details>

<details>
<summary><b>Update to latest version</b></summary>

```bash
git pull
npm install && cd backend && npm install && cd ..
pm2 restart all
```

</details>

---

## 📄 License

MIT — free to use, modify, and distribute.

---

<div align="center">

<br/>

Made with ❤️ by

<a href="https://kroombox.com">
  <img src="https://raw.githubusercontent.com/andiahmadnurmadani/KroomDrive/main/public/kroombox-logo.png" alt="KroomBox" height="40" />
</a>

<br/><br/>

[![Website](https://img.shields.io/badge/kroombox.com-4318FF?style=for-the-badge&logo=google-chrome&logoColor=white)](https://kroombox.com)
[![Instagram](https://img.shields.io/badge/@kroombox-E1306C?style=for-the-badge&logo=instagram&logoColor=white)](https://instagram.com/kroombox)

<br/>

<sub>© 2025 KroomBox · All rights reserved</sub>

</div>
