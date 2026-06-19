# dashboard

A personal developer dashboard for tracking projects, servers, and tools — with live status indicators and remote SSH actions (restart / reboot).

## Features

- Card grid with live online/offline status per item
- Category and filter views (Projects, Servers, Tools)
- Remote actions via SSH: `reboot` for servers, `restart` for Docker Compose services
- Add, edit, and delete items through the UI — changes write back to `items.yml`
- HTTP Basic Auth on all routes
- Dark mode, PWA support, connection loss detection
- Action audit log

## Quick start

```bash
cp .env.example .env
# edit .env: set DASHBOARD_USER and DASHBOARD_PASSWORD
docker compose up -d
```

Frontend is available on port 80 (configurable via `FRONTEND_PORT` in `.env`).

## Configuration

All items are defined in `config/items.yml`. Changes made through the UI are written back to this file automatically.

### Example `items.yml`

```yaml
items:
  # Plain item — no remote actions
  - id: portainer
    name: Portainer
    category: tool
    description: Docker container management UI
    url: https://portainer.example.com

  # Server — enables "Reboot" action via SSH
  - id: rpi-home
    name: Home Pi
    category: server
    description: Raspberry Pi 4
    url: https://rpi-home.local
    management:
      type: ssh-server
      host: rpi-home.local
      port: 22
      user: pi
      ssh_key: /app/config/secrets/rpi_home_key

  # Docker Compose service — enables "Restart" action via SSH
  - id: my-api
    name: My API
    category: project
    description: REST API on the Home Pi
    url: https://api.rpi-home.local
    health_check: https://api.rpi-home.local/health
    management:
      type: ssh-compose
      server_id: rpi-home        # resolves SSH credentials from this server item
      compose_dir: /home/pi/apps/my-api
      compose_service: api       # optional — omit to restart all services
```

### Management types

| Type | Action | SSH command |
|------|--------|-------------|
| `ssh-server` | Reboot | `sudo reboot` |
| `ssh-compose` | Restart | `docker compose restart [service]` |

Items without a `management` block show no action buttons.

### SSH keys

Place SSH private keys in `config/secrets/` on the host (permissions: `chmod 600`). They are mounted into the backend container read-only. Reference them by filename in the UI — the full path `/app/config/secrets/<filename>` is assembled automatically.

```
config/
├── items.yml
└── secrets/
    ├── rpi_home_key
    └── rpi_office_key
```

`config/secrets/` and `.env` are excluded from version control.

For server reboot to work, the SSH user needs passwordless sudo for reboot:

```
# /etc/sudoers.d/dashboard on the target host
pi ALL=(ALL) NOPASSWD: /sbin/reboot
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Docker Compose Stack                   │
│                                                         │
│  ┌──────────────┐  REST +   ┌────────────────────────┐  │
│  │   Frontend   │◄─Basic───►│      Backend API        │  │
│  │ (React/Vite) │   Auth    │    (Node/Express)       │  │
│  └──────────────┘           └──────────┬──────────────┘  │
│                                        │                 │
│                             reads/writes config/items.yml│
│                             runs HTTP health checks      │
│                             executes SSH commands ───────┼──► servers
│                                        │                 │
│                              ┌─────────▼──────────┐      │
│                              │  config/items.yml   │      │
│                              │  config/secrets/    │      │
│                              └─────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

- **Frontend** — React + Vite + Tailwind CSS, served by Nginx
- **Backend** — Node.js + Express; reads and writes `items.yml` directly (no database)
- **Health checks** — HTTP polling on a configurable interval (default: 60 s); results cached in memory
- **SSH actions** — fresh connection per action via the `ssh2` library, closed immediately after

## Development

```bash
# Backend (in backend/)
npm run dev        # run with --watch
npm test           # run all tests

# Frontend (in frontend/)
npm run dev        # Vite dev server
npm test           # run all tests (vitest)
```

After backend changes: `docker compose restart backend`
After frontend changes: `docker compose restart frontend`

## API

All endpoints require `Authorization: Basic <token>`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth/check` | Validate credentials |
| `GET` | `/api/items` | List all items with status |
| `POST` | `/api/items` | Create item |
| `PUT` | `/api/items/:id` | Update item |
| `DELETE` | `/api/items/:id` | Delete item |
| `GET` | `/api/items/:id/status` | Poll single item status |
| `POST` | `/api/items/:id/action/:action` | Trigger SSH action |

## Security notes

- Run behind a reverse proxy with TLS — HTTP Basic Auth is only safe over HTTPS.
- Credentials are stored in `sessionStorage` (cleared on tab close, never in `localStorage`).
- SSH key paths are restricted to `/app/config/secrets/` — arbitrary paths are rejected by the backend.
- Only `reboot` and `docker compose restart` are permitted as SSH actions; all other action names are rejected.
- The backend refuses to start if `DASHBOARD_USER` or `DASHBOARD_PASSWORD` are not set.
