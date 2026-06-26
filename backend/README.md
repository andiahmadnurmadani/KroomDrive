# KroomDrive Backend

Node.js + Express + SQLite + SSH2 backend for KroomDrive.

## Setup

```bash
cd backend
npm install
npm run dev      # development (nodemon)
npm start        # production
```

Runs on **http://localhost:3001**

## Default Admin

On first run, a default admin account is created:
- Username: `admin`
- Password: `admin123`

**Change this immediately after first login.**

## How It Works

1. **Add SSH Servers** — in Admin Console → Servers & Storage tab, add your remote Linux servers (IP, SSH user, password or private key). Connection is tested on save.
2. **Define Storages** — create named storage definitions pointing to paths on those servers (e.g. `/home/files`).
3. **Create Users** — in Admin Console → Users tab.
4. **Assign Access** — click a user → "Assign Storage" to grant them access to a path with read/write/delete permissions and optional quota.

## Architecture

```
browser ──► Vite Dev (localhost:3000)
                │  proxy /api, /socket.io
                ▼
         Express (localhost:3001)
                │  JWT auth, SQLite
                │
                ▼
         SSH/SFTP pool ──► Linux Server 1
                       ──► Linux Server 2
                       ──► Linux Server N
```

## Database (SQLite)

Tables: `users`, `servers`, `storages`, `user_permissions`, `trash`

Location: `./data/kroomdrive.db`

## Environment Variables (.env)

```
PORT=3001
JWT_SECRET=change-this-in-production
JWT_EXPIRES_IN=24h
DB_PATH=./data/kroomdrive.db
UPLOAD_TEMP_DIR=./data/uploads
```
