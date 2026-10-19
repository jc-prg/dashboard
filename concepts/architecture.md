# Dashboard — Architecture Concept

## Purpose

A personal developer dashboard that provides a unified overview of software projects, servers, and configuration tools. Every configured item is displayed as a card with its current online status, description, and a direct link. Where applicable, items expose **restart** or **reboot** actions executed remotely via SSH.

---

## Core Features

- **Item catalog**: Configurable list of items grouped by category (Projects, Servers, Tools)
- **Online status**: Each item shows a live status indicator (online / offline / unknown)
- **Item metadata**: Name, description, URL/link, category, and optional tags
- **Category filtering**: Quick filter to show only Projects, Servers, or Tools
- **Auto-refresh**: Status checks run on a configurable interval (default: 60 s)
- **Remote actions**: Per-item restart / reboot buttons — executed via SSH on Raspberry Pi hosts
- **Authentication**: HTTP Basic Auth protects every API route and the frontend from the first deployment
- **Two-factor authentication**: Email-based 2FA required for access from outside the configured intranet CIDR range; verified devices are trusted for a configurable number of days
- **Item management**: Add, edit, and delete items through the UI — changes are written back to `items.yml` immediately

---

## Item Data Model

```yaml
items:
  # Plain project / tool — no management actions
  - id: portainer
    name: Portainer
    category: tool
    description: Docker container management UI
    url: https://portainer.example.com
    tags: [docker, ops]

  # Raspberry Pi server — reboot action via SSH
  - id: rpi-home
    name: Home Pi
    category: server
    description: Raspberry Pi 4 running home automation
    url: https://rpi-home.local
    health_check: https://rpi-home.local/ping
    tags: [rpi, linux]
    management:
      type: ssh-server          # enables: reboot
      host: rpi-home.local
      port: 22
      user: pi
      ssh_key: /run/secrets/rpi_home_key   # path inside the backend container

  # App running in docker compose on a Raspberry Pi — restart action via SSH
  - id: my-api
    name: My API
    category: project
    description: REST API running in Docker on the Home Pi
    url: https://api.rpi-home.local
    health_check: https://api.rpi-home.local/health
    tags: [nodejs, docker]
    management:
      type: ssh-compose         # enables: restart (docker compose restart)
      host: rpi-home.local
      port: 22
      user: pi
      ssh_key: /run/secrets/rpi_home_key
      compose_dir: /home/pi/apps/my-api   # remote path to compose project
      compose_service: api                # optional: restarts only this service
                                          # omit to restart all services in the project
```

### `management.type` values

| Type | Available Actions | SSH Command Issued |
|------|------------------|--------------------|
| `ssh-server` | **Reboot** | `sudo reboot` |
| `ssh-compose` | **Restart** | `docker compose -f <compose_dir>/docker-compose.yml restart [service]` |

Items without a `management` block show no action buttons.

---

## SSH Credential Strategy

SSH private keys are **never stored in `items.yml`**. Instead:

- Keys are placed in `config/secrets/` on the host (outside version control).
- Mounted into the backend container as read-only files.
- The `ssh_key` field in `items.yml` references the in-container path.
- Multiple Raspberry Pi hosts can share a key or use individual keys.

```
config/
├── items.yml
└── secrets/
    ├── rpi_home_key       # private key, chmod 600
    └── rpi_office_key
```

`config/secrets/` must be listed in `.gitignore`.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Docker Compose Stack                      │
│                                                                  │
│  ┌──────────────┐   REST+   ┌──────────────────────────────────┐ │
│  │   Frontend   │◄──Basic──►│          Backend API             │ │
│  │  (React/Vite)│   Auth    │         (Node/Express)           │ │
│  │   Port 3000  │           │  [auth middleware on all routes] │ │
│  └──────────────┘           └───────┬──────────────────────────┘ │
│                                     │                            │
│                          reads config/items.yml                  │
│                          runs HTTP health checks                 │
│                          executes SSH commands ──────────────────┼──► Raspberry Pi(s)
│                                     │                            │
│                           ┌─────────▼──────────┐                │
│                           │   config/items.yml  │                │
│                           │   config/secrets/   │                │
│                           │  (bind-mounted vol) │                │
│                           └────────────────────┘                │
└──────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Technology | Role |
|-----------|------------|------|
| **Frontend** | React + Vite + Tailwind CSS | Dashboard UI, login form, card grid, status badges, action buttons |
| **Backend API** | Node.js + Express | Config loading, health checks, SSH action execution |
| **Auth middleware** | `express-basic-auth` | Validates password on every request; returns 401 on failure |
| **2FA middleware** | custom (`twoFactor.js`) | Enforces email 2FA for external IPs; skips intranet and `/api/auth/*` routes |
| **Email sender** | `nodemailer` | Sends 6-digit codes via SMTP with SSL/STARTTLS |
| **SSH client** | `ssh2` npm package | Connects to Raspberry Pi hosts, runs remote commands |
| **Config file** | `config/items.yml` | Single source of truth for all items and management config |
| **Reverse proxy** | Nginx (optional) | TLS termination and single-port access |

---

## API Endpoints (Backend)

All endpoints require a valid `Authorization: Basic <token>` header. Requests without valid credentials receive `401 Unauthorized`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/auth/check` | password | Returns 200 with `twoFactorRequired` flag; used on load and after login to decide whether 2FA is needed |
| `POST` | `/api/auth/2fa/send` | password | Generates a 6-digit code, sends it to `TWO_FA_EMAIL`, returns `{ challengeId }` |
| `POST` | `/api/auth/2fa/verify` | password | Validates `{ challengeId, code }`; on success sets `2fa_token` HttpOnly cookie and returns `{ ok: true }` |
| `GET` | `/api/items` | password + 2FA | Returns all items with current status and available actions |
| `GET` | `/api/items/:id/status` | required | Returns live status for a single item |
| `POST` | `/api/items` | required | Creates a new item and writes it to `items.yml` |
| `PUT` | `/api/items/:id` | required | Updates an existing item and writes changes to `items.yml` |
| `DELETE` | `/api/items/:id` | required | Removes an item from `items.yml` |
| `POST` | `/api/items/:id/action/restart` | required | Triggers a Docker Compose restart via SSH |
| `POST` | `/api/items/:id/action/reboot` | required | Triggers a server reboot via SSH |
| `GET` | `/api/config` | required | Returns sanitized config (secrets redacted) |

Action endpoints return immediately with a job result; the frontend re-polls status after a short delay.

### Create / Update Request Body

```json
{
  "id": "my-api",
  "name": "My API",
  "category": "project",
  "description": "REST API running in Docker on the Home Pi",
  "url": "https://api.rpi-home.local",
  "health_check": "https://api.rpi-home.local/health",
  "tags": ["nodejs", "docker"],
  "management": {
    "type": "ssh-compose",
    "host": "rpi-home.local",
    "port": 22,
    "user": "pi",
    "ssh_key": "/app/config/secrets/rpi_home_key",
    "compose_dir": "/home/pi/apps/my-api",
    "compose_service": "api"
  }
}
```

`management` may be `null` or omitted entirely for items without remote actions.
On `POST`, `id` is optional — if omitted, it is auto-generated from `name` (slugified, e.g. `"My API"` → `"my-api"`).
The backend validates uniqueness of `id` before writing.

### Item Response Shape

```json
{
  "id": "my-api",
  "name": "My API",
  "category": "project",
  "description": "REST API running in Docker on the Home Pi",
  "url": "https://api.rpi-home.local",
  "tags": ["nodejs", "docker"],
  "status": "online",
  "status_code": 200,
  "latency_ms": 38,
  "checked_at": "2026-06-19T10:00:00Z",
  "actions": ["restart"]       // [] if no management block; ["reboot"] for ssh-server
}
```

### Action Response Shape

```json
{
  "id": "my-api",
  "action": "restart",
  "success": true,
  "output": "Container my-api restarted.",
  "executed_at": "2026-06-19T10:01:00Z"
}
```

---

## Frontend UI Layout

### Login screen (shown when no valid credentials are stored)

```
┌──────────────────────────────────────────────┐
│                                              │
│            jc://dashboard/                   │
│                                              │
│         ┌────────────────────────┐           │
│  Pass   │ ••••••••               │           │
│         └────────────────────────┘           │
│                                              │
│              [ Sign in ]                     │
│                                              │
│  (error message shown here on failure)       │
└──────────────────────────────────────────────┘
```

### 2FA screen (shown after password login from an external IP)

```
┌──────────────────────────────────────────────┐
│                                              │
│            jc://dashboard/                   │
│    Two-factor verification required          │
│                                              │
│  Access from outside the intranet requires   │
│  a verification code sent to your email.     │
│                                              │
│       [ Send verification code ]             │
│                                              │
└──────────────────────────────────────────────┘

After sending:

┌──────────────────────────────────────────────┐
│                                              │
│            jc://dashboard/                   │
│    Two-factor verification required          │
│                                              │
│  A 6-digit code was sent to your email.      │
│                                              │
│         ┌────────────────────────┐           │
│  Code   │ 1 2 3 4 5 6            │           │
│         └────────────────────────┘           │
│                                              │
│              [ Verify ]                      │
│           Resend code                        │
│                                              │
└──────────────────────────────────────────────┘
```

### Dashboard (shown after successful login)

```
┌──────────────────────────────────────────────────────┐
│  Developer Dashboard       [↻] [+ Add item] [Sign out]│
│                                                      │
│  [ All ] [ Projects ] [ Servers ] [ Tools ]          │
│                                                      │
│  ┌────────────────────┐  ┌────────────────────┐      │
│  │ ● My API    project│  │ ● Home Pi   server │      │
│  │                    │  │                    │      │
│  │ REST API on the    │  │ Raspberry Pi 4 for │      │
│  │ Home Pi            │  │ home automation    │      │
│  │                    │  │                    │      │
│  │ [Open →] [Restart] │  │ [Open →] [Reboot]  │      │
│  │              [✎][✕]│  │              [✎][✕]│      │
│  └────────────────────┘  └────────────────────┘      │
│                                                      │
│  ┌────────────────────┐                              │
│  │ ● Portainer  tool  │                              │
│  │                    │                              │
│  │ Docker mgmt UI     │                              │
│  │                    │                              │
│  │ [Open →]    [✎][✕] │                              │
│  └────────────────────┘                              │
└──────────────────────────────────────────────────────┘
```

`[✎]` opens the item form pre-filled for editing.
`[✕]` shows a delete confirmation dialog, then removes the item.

**Auth flow:**
1. On app load, frontend checks `sessionStorage` for a stored Basic Auth token.
2. If found, validates it via `GET /api/auth/check`. On 401 → clears token, shows login form.
3. Login form encodes `username:password` as Base64 and sends as `Authorization: Basic <token>`.
4. On success (200) → token stored in `sessionStorage`, dashboard rendered.
5. On failure (401) → error message shown in the form.
6. "Sign out" clears `sessionStorage` and returns to login form.
7. Any subsequent API call that returns 401 (e.g. after session expiry or credential change) triggers automatic sign-out.

**Action button behavior:**
1. Click **Restart** or **Reboot** → confirmation dialog appears ("Reboot Home Pi?")
2. On confirm → POST to `/api/items/:id/action/:action` with auth header
3. Button shows spinner while request is in flight
4. On success → toast notification; status badge resets to "unknown" and re-polls
5. On failure → error toast with the returned output message

### Item Form Modal (Add / Edit)

Triggered by **[+ Add item]** or **[✎]** on a card. A modal overlays the dashboard.

```
┌──────────────────────────────────────────────────────┐
│  Add item                                       [✕]  │
│  ─────────────────────────────────────────────────   │
│  Name *          [ My API                        ]   │
│  ID              [ my-api        ] ← auto from name  │
│  Category        [ project  ▾ ]                      │
│  Description     [ REST API on the Home Pi       ]   │
│  URL *           [ https://api.rpi-home.local    ]   │
│  Health check    [ https://api.rpi-home.local/…  ]   │
│  Tags            [ nodejs, docker                ]   │
│                                                      │
│  ┌── Remote management ─────────────────────────┐    │
│  │ Type  ( None )  ( SSH server )  ( SSH compose)│    │
│  │                                               │    │
│  │  [shown when SSH server or SSH compose]       │    │
│  │  Host       [ rpi-home.local             ]   │    │
│  │  Port       [ 22  ]                          │    │
│  │  User       [ pi  ]                          │    │
│  │  SSH key    [ /app/config/secrets/rpi_key ]  │    │
│  │                                               │    │
│  │  [shown only when SSH compose]                │    │
│  │  Compose dir   [ /home/pi/apps/my-api    ]   │    │
│  │  Service       [ api   ] (optional)           │    │
│  └───────────────────────────────────────────── ┘    │
│                                                      │
│  (validation errors shown inline)                    │
│                          [ Cancel ]  [ Save item ]   │
└──────────────────────────────────────────────────────┘
```

**Form behaviour:**
- `ID` is auto-generated from `Name` as the user types (slugified: lowercase, spaces → hyphens, non-alphanumeric stripped). The user may override it manually.
- On edit, `ID` is read-only (changing an ID would break existing status cache references).
- `Tags` is a free-text field; values are split on commas and trimmed.
- The **Remote management** section collapses to `None` by default; selecting a type reveals the relevant fields.
- `SSH key` accepts a filename relative to `config/secrets/` (e.g. `rpi_home_key`) — the UI prepends the container path `/app/config/secrets/`. Keys must be placed there manually; they are never uploaded through the UI.
- On **Save**: validates required fields → `POST /api/items` (add) or `PUT /api/items/:id` (edit) → on success, modal closes and item list refreshes.
- On **Delete** (`[✕]`): confirmation dialog → `DELETE /api/items/:id` → item list refreshes.

---

## File Structure

```
dashboard/
├── concept/
│   └── architecture.md
├── config/
│   ├── items.yml
│   ├── 2fa-tokens.json       # verified device tokens (committed as {}; modified at runtime)
│   └── secrets/              # SSH keys, not committed to git
│       └── .gitkeep
├── frontend/
│   ├── Dockerfile
│   ├── index.html
│   ├── vite.config.js
│   ├── vitest.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── components/
│       │   ├── LoginForm.jsx
│       │   ├── TwoFactorForm.jsx  # 2FA code entry (send + verify steps)
│       │   ├── Dashboard.jsx
│       │   ├── ItemCard.jsx
│       │   ├── StatusBadge.jsx
│       │   ├── ActionButton.jsx
│       │   ├── CategoryFilter.jsx
│       │   ├── ItemFormModal.jsx  # add / edit form
│       │   └── DeleteButton.jsx   # delete with confirmation
│       ├── hooks/
│       │   ├── useAuth.js         # stores/clears token, exposes login/logout
│       │   └── useItems.js        # fetch, poll, triggerAction, createItem, updateItem, deleteItem
│       └── __tests__/
│           ├── LoginForm.test.jsx
│           ├── ItemCard.test.jsx
│           ├── StatusBadge.test.jsx
│           ├── ActionButton.test.jsx
│           ├── CategoryFilter.test.jsx
│           ├── ItemFormModal.test.jsx
│           ├── DeleteButton.test.jsx
│           ├── useAuth.test.js
│           └── useItems.test.js
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── jest.config.js
│   └── src/
│       ├── index.js
│       ├── config.js
│       ├── healthcheck.js
│       ├── ssh.js
│       ├── actions.js
│       ├── twoFactor.js               # CIDR check, code/token management, email sending
│       ├── middleware/
│       │   ├── auth.js                # express-basic-auth setup (password only)
│       │   └── twoFactor.js           # 2FA enforcement for external IPs
│       ├── routes/
│       │   ├── auth.js                # GET /check, POST /2fa/send, POST /2fa/verify
│       │   ├── items.js               # GET, POST, PUT, DELETE
│       │   └── actions.js
│       ├── configWriter.js            # reads + writes items.yml atomically
│       └── __tests__/
│           ├── config.test.js         # unit
│           ├── configWriter.test.js   # unit
│           ├── healthcheck.test.js    # unit
│           ├── ssh.test.js            # unit
│           ├── actions.test.js        # unit
│           ├── auth.test.js           # unit + integration
│           ├── routes.items.test.js   # integration (read + write)
│           └── routes.actions.test.js # integration
└── docker-compose.yml
```

---

## Docker Compose Configuration

```yaml
version: "3.9"

services:
  backend:
    build: ./backend
    restart: unless-stopped
    volumes:
      - ./config/items.yml:/app/config/items.yml   # read-write: UI edits write back to this file
      - ./config/secrets:/app/config/secrets:ro
    environment:
      - PORT=3001
      - CHECK_INTERVAL_SECONDS=60
      - REQUEST_TIMEOUT_MS=5000
      - SSH_CONNECT_TIMEOUT_MS=8000
      - DASHBOARD_USER=${DASHBOARD_USER}
      - DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}

  frontend:
    build: ./frontend
    restart: unless-stopped
    ports:
      - "3000:80"
    depends_on:
      - backend
    environment:
      - VITE_API_URL=http://backend:3001

networks:
  default:
    name: dashboard_net
```

Credentials and 2FA settings are supplied via a `.env` file (not committed to git):

```ini
# .env  — add to .gitignore
DASHBOARD_USER=admin
DASHBOARD_PASSWORD=changeme

# Two-factor authentication
INTRANET_CIDR=192.168.1.0/24      # requests from this range bypass 2FA
TWO_FA_EMAIL=admin@example.com    # receives the verification code
TWO_FA_VALIDITY_DAYS=30           # days a verified device is trusted

# SMTP (for sending the 2FA code)
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true                  # true = direct SSL (465), false = STARTTLS (587)
SMTP_USER=sender@example.com
SMTP_PASS="your-password"         # quote if it contains special characters
SMTP_FROM=dashboard@example.com
```

---

## Authentication

### Approach

HTTP Basic Auth is applied as an Express middleware (`express-basic-auth`) that wraps every route. The middleware performs a **timing-safe password comparison** to prevent timing attacks. No username is shown or entered — the frontend hardcodes a placeholder and sends only the password.

For access from **outside the intranet** (IP not in `INTRANET_CIDR`), a second factor is required: a 6-digit code sent to a predefined email address. Once verified, an HttpOnly cookie trusts the browser for `TWO_FA_VALIDITY_DAYS` days. Verified device tokens are persisted to `config/2fa-tokens.json` and survive backend restarts.

### Credential storage

| Location | What is stored | Notes |
|----------|---------------|-------|
| Host `.env` file | Plain-text password and SMTP credentials | Not committed to git; loaded into the backend container via Docker Compose env interpolation |
| Backend env vars | `DASHBOARD_PASSWORD` | Read at startup by the auth middleware; username is not required |
| Browser `sessionStorage` | Base64-encoded `user:password` token | Cleared on sign-out or tab close; never persisted to `localStorage` |
| Browser cookie | `2fa_token` (HttpOnly, SameSite=Strict) | Set after successful 2FA verify; expires after `TWO_FA_VALIDITY_DAYS` days |
| `config/2fa-tokens.json` | `{ token: isoExpiry, … }` | Server-side record of valid device tokens; expired entries pruned on read |

### Backend middleware

**`middleware/auth.js`** — password-only Basic Auth, applied to all routes:
```
express-basic-auth({
  authorizer: (_, pwd) => basicAuth.safeCompare(pwd, process.env.DASHBOARD_PASSWORD),
  unauthorizedResponse: { error: 'Unauthorized' }
})
```

**`middleware/twoFactor.js`** — 2FA check, applied after Basic Auth, skips all `/api/auth/*` routes:
```
if (isIntranet(req.ip))                  → pass through (no 2FA needed)
if (isDeviceTokenValid(req.cookies[…]))  → pass through (device trusted)
else                                     → 403 { error: '2FA_REQUIRED' }
```

### 2FA flow (external access)

```
1. User enters password → LoginForm → POST /api/auth/check
   Backend: basic auth ok, IP is external, no valid cookie
   → 200 { ok: true, twoFactorRequired: true }

2. Frontend shows TwoFactorForm — user clicks "Send code"
   → POST /api/auth/2fa/send  (basic auth only, no 2FA check)
   Backend: generates 6-digit code (10-min TTL), sends email via SMTP
   → 200 { challengeId: "<uuid>" }

3. User enters code → POST /api/auth/2fa/verify { challengeId, code }
   Backend: validates code, generates device token (random 32-byte hex),
   writes to 2fa-tokens.json, sets HttpOnly cookie (Max-Age = X days)
   → 200 { ok: true }

4. Frontend marks as authenticated, renders Dashboard.
   All subsequent API requests include the cookie automatically (same-origin).
```

### Intranet access

Requests from an IP matching `INTRANET_CIDR` skip 2FA entirely. Loopback addresses (`127.0.0.1`, `::1`) are always treated as intranet regardless of configuration.

### Frontend auth flow (`hooks/useAuth.js`)

```
sessionStorage key: "dashboard_token"  (value: btoa("user:password"))
```

1. App mounts → read token from `sessionStorage`
2. If token present → `GET /api/auth/check`
   - 200 `{ twoFactorRequired: false }` → render Dashboard
   - 200 `{ twoFactorRequired: true }` → render TwoFactorForm
   - 401 → clear token, render LoginForm
3. If no token → render LoginForm
4. LoginForm submit → build token, call `/api/auth/check`
   - `twoFactorRequired: false` → store token, render Dashboard
   - `twoFactorRequired: true` → store token, render TwoFactorForm
   - 401 → show "Invalid password"
5. TwoFactorForm: send code → enter code → on success call `completeTwoFactor()` → render Dashboard
6. Sign out → clear `sessionStorage` → render LoginForm
7. Any API call returning 401 → auto sign-out
8. Any API call returning 403 `2FA_REQUIRED` → render TwoFactorForm (cookie expired mid-session)

### Startup validation

On backend startup, if `DASHBOARD_PASSWORD` is missing or empty, the process exits with a clear error message rather than starting unprotected.

---

## Health Check Strategy

1. The backend reads `items.yml` on startup and watches for changes.
2. A background scheduler runs HTTP GET requests against each item's `health_check` URL (or `url` if not specified).
3. A response with HTTP 2xx/3xx within the timeout is **online**; anything else is **offline**.
4. Results are cached in memory and returned immediately on each `/api/items` request.
5. The frontend polls `/api/items` every 30 seconds by default.

---

## SSH Action Execution

```
Frontend          Backend                    Raspberry Pi
   │                  │                            │
   │  POST /action    │                            │
   │─────────────────►│                            │
   │                  │── SSH connect ────────────►│
   │                  │── exec command ───────────►│
   │                  │◄── stdout/stderr ──────────│
   │                  │── SSH close ──────────────►│
   │◄─────────────────│                            │
   │  {success, output}                            │
```

- The backend uses the `ssh2` library (non-blocking, Promise-wrapped).
- A fresh SSH connection is opened per action and closed immediately after — no persistent sessions.
- Command for `ssh-server` reboot: `sudo reboot`
- Command for `ssh-compose` restart (full project): `cd <compose_dir> && docker compose restart`
- Command for `ssh-compose` restart (single service): `cd <compose_dir> && docker compose restart <service>`
- stdout and stderr are captured and returned in the action response.
- A configurable timeout (default 8 s) aborts hung connections.

**Sudo requirement:** The `pi` user needs passwordless sudo for `reboot`. Add to `/etc/sudoers.d/dashboard` on the Pi:
```
pi ALL=(ALL) NOPASSWD: /sbin/reboot
```

---

## Item Management (CRUD)

### Write-back strategy (`configWriter.js`)

The backend never mutates the in-memory parsed config directly. Instead, every write operation follows this sequence:

1. Read the current `items.yml` from disk (always authoritative).
2. Apply the change (insert / replace / remove the item in the `items` array).
3. Serialize the result back to YAML with `js-yaml.dump()`.
4. Write to a temporary file alongside `items.yml`, then rename it atomically over the original — prevents corruption if the process crashes mid-write.
5. Return the updated item list to the caller.

This means manual edits to `items.yml` are preserved and the file never gets reformatted beyond what js-yaml produces.

### ID generation

When `id` is omitted from a `POST` body, the backend derives it from `name`:

```
slugify(name) = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
```

If the generated ID already exists, a numeric suffix is appended (`my-api-2`, `my-api-3`, …).

### Validation

All write operations validate:
- `name` and `url` are non-empty strings
- `category` is one of `project | server | tool`
- `id` matches `/^[a-z0-9-]+$/` and is unique across existing items (on create)
- If `management` is present: all SSH fields are non-empty, `type` is known, `compose_dir` present for `ssh-compose`
- `ssh_key` path must start with `/app/config/secrets/` — arbitrary filesystem paths are rejected

Validation errors are returned as `400` with a structured body:
```json
{ "error": "Validation failed", "fields": { "url": "must be a non-empty string" } }
```

### SSH key files

Keys are **never uploaded through the UI**. The `ssh_key` field accepts only a filename (e.g. `rpi_home_key`); the backend enforces the full path as `/app/config/secrets/<filename>`. The operator places keys in `config/secrets/` on the host before referencing them in the form.

---

## Configuration & Deployment

- All item definitions and management config live in `config/items.yml`.
- Items can be added, edited, and deleted through the dashboard UI — no need to edit the file manually after initial setup.
- SSH private keys go in `config/secrets/` (permissions: `chmod 600`).
- Dashboard credentials go in `.env` (`DASHBOARD_USER`, `DASHBOARD_PASSWORD`).
- Both `config/secrets/` and `.env` must be in `.gitignore`.
- Start the stack: `docker compose up -d`
- To expose externally, place a reverse proxy (Nginx, Caddy, Traefik) in front with TLS — HTTP Basic Auth is only safe over HTTPS.

---

## Testing Strategy

### Tooling

| Layer | Framework | Key Libraries |
|-------|-----------|---------------|
| Backend unit | Jest | `nock` (HTTP mocking), `jest.mock` for `ssh2` |
| Backend integration | Jest + Supertest | `nock`, `ssh2` mock, fixture YAML files |
| Frontend unit/component | Vitest + React Testing Library | `msw` (Mock Service Worker) for API mocking |
| E2E | — | Out of scope for v1; Playwright recommended when needed |

Run all tests:
```bash
# backend
cd backend && npm test

# frontend
cd frontend && npm test
```

---

### Backend — Unit Tests

#### `config.test.js`

Tests the YAML loader in isolation using fixture files in `__tests__/fixtures/`.

| Test case | Assertion |
|-----------|-----------|
| Parses valid `items.yml` with all fields | Returns correctly structured array |
| Item without `management` block | `actions` field is `[]` |
| `ssh-server` item | `actions` is `["reboot"]` |
| `ssh-compose` item | `actions` is `["restart"]` |
| Missing required field (`name`, `url`) | Throws validation error |
| Unknown `management.type` | Throws validation error |
| `ssh-compose` without `compose_dir` | Throws validation error |
| Empty `items.yml` | Returns empty array without error |
| `ssh_key` path is included in parsed config | Path string preserved as-is (resolution is runtime) |

#### `healthcheck.test.js`

Uses `nock` to intercept outbound HTTP without real network calls.

| Test case | Assertion |
|-----------|-----------|
| Target returns 200 | Status is `online`, `status_code` is 200 |
| Target returns 301 redirect | Status is `online` (2xx/3xx accepted) |
| Target returns 500 | Status is `offline` |
| Target returns 404 | Status is `offline` |
| Request times out | Status is `offline`, no unhandled rejection |
| Connection refused | Status is `offline` |
| `health_check` URL used when present | Probes `health_check`, not `url` |
| Falls back to `url` when `health_check` absent | Probes `url` |

#### `ssh.test.js`

Mocks the `ssh2` `Client` class via `jest.mock('ssh2')`.

| Test case | Assertion |
|-----------|-----------|
| Successful command execution | Resolves with `{ stdout, stderr, code: 0 }` |
| Command exits with non-zero code | Resolves with `{ code: 1, stderr }` (not rejected) |
| SSH connection timeout | Rejects with timeout error after configured ms |
| SSH authentication failure | Rejects with auth error |
| Connection is closed after command finishes | `client.end()` called exactly once |
| Connection is closed even on error | `client.end()` called in error path too |

#### `actions.test.js`

Tests command construction and action-to-type validation.

| Test case | Assertion |
|-----------|-----------|
| `ssh-server` item + `reboot` action | SSH command is `sudo reboot` |
| `ssh-compose` item + `restart`, no service | Command is `cd <dir> && docker compose restart` |
| `ssh-compose` item + `restart`, with service | Command is `cd <dir> && docker compose restart <service>` |
| `ssh-compose` item + `reboot` action | Throws — action not permitted for this type |
| `ssh-server` item + `restart` action | Throws — action not permitted for this type |
| Item without `management` block + any action | Throws — no management configured |
| Unknown action name (`purge`, `shutdown`) | Throws — not in allowed action list |

#### `auth.test.js`

Unit tests for the middleware setup, plus integration tests via Supertest.

**Middleware unit tests** (testing `middleware/auth.js` in isolation):

| Test case | Assertion |
|-----------|-----------|
| `DASHBOARD_USER` env var missing at startup | Process throws / middleware factory throws before routes are registered |
| `DASHBOARD_PASSWORD` env var missing at startup | Same as above |
| Valid credentials passed to middleware factory | Middleware created without error |

**Integration tests** (Supertest against the full Express app with env vars set):

| Test case | Expected response |
|-----------|-------------------|
| `GET /api/auth/check` with correct credentials | 200 |
| `GET /api/auth/check` with wrong password | 401, `{ error: "Unauthorized" }` |
| `GET /api/auth/check` with no `Authorization` header | 401 |
| `GET /api/items` with correct credentials | 200 |
| `GET /api/items` with no credentials | 401 |
| `GET /api/items` with wrong credentials | 401 |
| `POST /api/items/:id/action/restart` with no credentials | 401 (action not executed) |
| Credentials comparison is timing-safe | Middleware uses `safeCompare` — verified via `express-basic-auth` option |

---

### Backend — Integration Tests

Uses **Supertest** to call the Express app directly (no listening port needed). SSH and outbound HTTP are fully mocked.

#### `configWriter.test.js`

Tests the write-back module using a temporary directory so the real `items.yml` is never touched.

| Test case | Assertion |
|-----------|-----------|
| `addItem(item)` appends to items array and writes file | File on disk contains new item |
| `addItem` with duplicate id | Throws with "ID already exists" |
| `addItem` without id → id auto-generated from name | Generated id matches slugified name |
| `addItem` with id collision after slugify → suffix appended | id becomes `my-api-2` |
| `updateItem(id, data)` replaces item in place | File on disk contains updated fields, other items unchanged |
| `updateItem` with unknown id | Throws with 404 error |
| `deleteItem(id)` removes item from array | File on disk no longer contains item |
| `deleteItem` with unknown id | Throws with 404 error |
| Write is atomic: simulated crash during write | Original file unchanged |
| `ssh_key` path outside `/app/config/secrets/` | Throws validation error before writing |

#### `routes.items.test.js`

| Test case | Expected response |
|-----------|-------------------|
| `GET /api/items` with valid config | 200, array of items with `status`, `actions` fields |
| Item shape includes all required fields | `id`, `name`, `category`, `description`, `url`, `tags`, `status`, `actions` |
| `management` block stripped from item responses | `ssh_key` and SSH config not in response |
| `GET /api/items/:id/status` for known item | 200, single status object |
| `GET /api/items/:id/status` for unknown id | 404 |
| `GET /api/config` | 200, `ssh_key` values replaced with `"[redacted]"` |
| `POST /api/items` with valid body | 201, created item returned; file written |
| `POST /api/items` with missing `name` | 400, `{ error: "Validation failed", fields: { name: "..." } }` |
| `POST /api/items` with missing `url` | 400, validation error |
| `POST /api/items` with invalid `category` | 400, validation error |
| `POST /api/items` with duplicate `id` | 409, `{ error: "ID already exists" }` |
| `POST /api/items` with `ssh_key` outside secrets dir | 400, validation error |
| `POST /api/items` omitting `id` | 201, id auto-generated from name |
| `PUT /api/items/:id` with valid body | 200, updated item returned; file written |
| `PUT /api/items/:id` for unknown id | 404 |
| `PUT /api/items/:id` with invalid field | 400, validation error |
| `PUT /api/items/:id` attempting to change id | 400, "id cannot be changed" |
| `DELETE /api/items/:id` for known item | 200, `{ ok: true }` |
| `DELETE /api/items/:id` for unknown id | 404 |

#### `routes.actions.test.js`

SSH is mocked to return success or failure without real connections.

| Test case | Expected response |
|-----------|-------------------|
| `POST /api/items/rpi-home/action/reboot` (ssh-server item, SSH succeeds) | 200, `{ success: true, output: "..." }` |
| `POST /api/items/my-api/action/restart` (ssh-compose item, SSH succeeds) | 200, `{ success: true }` |
| SSH command fails (non-zero exit) | 200, `{ success: false, output: stderr }` |
| SSH connection times out | 502, `{ success: false, error: "SSH timeout" }` |
| `POST /api/items/my-api/action/reboot` (ssh-compose item, wrong action) | 400, `{ error: "action 'reboot' not available for this item" }` |
| `POST /api/items/portainer/action/restart` (no management block) | 400, `{ error: "no management configured" }` |
| `POST /api/items/unknown-id/action/restart` | 404 |
| `POST /api/items/rpi-home/action/arbitrary` | 400, `{ error: "unknown action" }` |

---

### Frontend — Component Tests

Uses **Vitest** + **React Testing Library**. API calls are intercepted by **MSW** handlers registered in test setup. MSW handlers require a valid `Authorization` header; requests without one return 401.

#### `LoginForm.test.jsx`

| Test case | Assertion |
|-----------|-----------|
| Renders username and password fields and a submit button | Elements present in DOM |
| Submit with empty fields → no API call | MSW handler not invoked |
| Submit with wrong credentials → MSW returns 401 → error message shown | Error text visible, form still rendered |
| Submit with correct credentials → MSW returns 200 → `onSuccess` callback called | Callback invoked with encoded token |
| Loading spinner shown while request is in flight | Button disabled / spinner visible |
| Password field is type `password` (not visible) | `input[type=password]` present |

#### `useAuth.test.js`

| Test case | Assertion |
|-----------|-----------|
| No token in `sessionStorage` on mount → `isAuthenticated` is false | Login form rendered |
| Token in `sessionStorage` → `GET /api/auth/check` called automatically | MSW handler invoked with correct header |
| `/api/auth/check` returns 200 → `isAuthenticated` is true | Dashboard rendered |
| `/api/auth/check` returns 401 → token cleared, `isAuthenticated` is false | Login form rendered, `sessionStorage` empty |
| `login(token)` stores token and sets `isAuthenticated` true | `sessionStorage` updated |
| `logout()` clears token and sets `isAuthenticated` false | `sessionStorage` empty |
| Any API call returning 401 triggers `logout()` | `sessionStorage` cleared, login form shown |

#### `StatusBadge.test.jsx`

| Test case | Assertion |
|-----------|-----------|
| `status="online"` | Renders green indicator, accessible label "online" |
| `status="offline"` | Renders red indicator, accessible label "offline" |
| `status="unknown"` | Renders gray indicator, accessible label "unknown" |

#### `ItemCard.test.jsx`

| Test case | Assertion |
|-----------|-----------|
| Renders item name and description | Text visible in DOM |
| Renders "Open" link with correct `href` | `<a href={item.url}>` present |
| `actions=[]` | No action buttons rendered |
| `actions=["restart"]` | "Restart" button visible, "Reboot" button absent |
| `actions=["reboot"]` | "Reboot" button visible, "Restart" button absent |
| StatusBadge receives correct status prop | Correct color rendered (via StatusBadge unit) |

#### `ActionButton.test.jsx`

| Test case | Assertion |
|-----------|-----------|
| Click "Restart" → confirmation dialog appears | Dialog text contains item name and action |
| Click "Cancel" in dialog → no API call made | MSW handler not invoked |
| Click "Confirm" → POST sent to correct endpoint | MSW handler receives request |
| Confirm clicked → button shows spinner (loading state) | Button disabled during request |
| API returns success → success toast shown | Toast message visible |
| API returns `success: false` → error toast shown | Error message from response visible |
| API call throws network error → error toast shown | Generic error message visible |

#### `CategoryFilter.test.jsx`

| Test case | Assertion |
|-----------|-----------|
| All categories shown by default | All item cards rendered |
| Click "Servers" → only server cards visible | Other cards not in DOM |
| Click "All" after filter → all cards return | All cards re-rendered |

#### `useItems.test.js`

| Test case | Assertion |
|-----------|-----------|
| On mount, fetches `/api/items` with `Authorization` header | MSW handler called, verifies header present |
| Returns loading state before fetch resolves | `loading: true` initially |
| On fetch error, returns error state | `error` is set, `items` is empty |
| `/api/items` returns 401 → triggers `logout()` | `sessionStorage` cleared, login form shown |
| Polls again after interval | MSW handler called a second time after timer advance |
| `triggerAction(id, action)` POSTs correct endpoint with auth header | MSW handler receives POST with header |
| `createItem(data)` POSTs to `/api/items` with auth header | MSW handler receives POST; returned item added to state |
| `updateItem(id, data)` PUTs to `/api/items/:id` | MSW handler receives PUT; item updated in state |
| `deleteItem(id)` sends DELETE to `/api/items/:id` | MSW handler receives DELETE; item removed from state |

#### `ItemFormModal.test.jsx`

| Test case | Assertion |
|-----------|-----------|
| Renders all base fields (name, id, category, url, description, tags) | Inputs present in DOM |
| Management type = None → SSH fields not rendered | SSH host/user/key inputs absent |
| Management type = SSH server → SSH fields visible, compose fields hidden | Correct fields shown |
| Management type = SSH compose → all SSH + compose fields visible | All fields present |
| Typing in Name auto-fills ID field | ID value matches slugified name |
| ID field is read-only in edit mode | Input has `readOnly` attribute |
| Submit with empty Name → inline validation error | Error message visible, `createItem` not called |
| Submit with empty URL → inline validation error | Error message visible |
| Submit with invalid category → inline validation error | Error message visible |
| Submit with SSH compose selected but no `compose_dir` → error | Error visible |
| Successful add → `createItem` called with correct body | MSW handler receives POST |
| Successful edit → `updateItem` called with correct body | MSW handler receives PUT |
| Cancel button → modal closes without API call | MSW handler not invoked |
| Tags typed as "nodejs, docker" → sent as `["nodejs","docker"]` | Request body has array |
| SSH key field prepends secrets path | Request body has full `/app/config/secrets/…` path |

#### `DeleteButton.test.jsx`

| Test case | Assertion |
|-----------|-----------|
| Click delete icon → confirmation dialog appears with item name | Dialog text includes item name |
| Click Cancel → no API call | MSW handler not invoked |
| Click Confirm → DELETE sent to correct endpoint | MSW handler receives request |
| Confirm clicked → button shows loading state | Button disabled during request |
| Success → success toast shown | Toast visible |
| API error → error toast shown | Error message visible |

---

### Test Fixtures

```
backend/src/__tests__/
└── fixtures/
    ├── items-valid.yml          # full valid config with all management types
    ├── items-no-management.yml  # items without management blocks
    └── items-invalid.yml        # config with missing required fields
```

---

### npm Scripts

```json
// backend/package.json
"scripts": {
  "test":         "jest",
  "test:watch":   "jest --watch",
  "test:coverage": "jest --coverage"
}

// frontend/package.json
"scripts": {
  "test":         "vitest run",
  "test:watch":   "vitest",
  "test:coverage": "vitest run --coverage"
}
```

---

## Security Considerations

- **Auth on every route**: `express-basic-auth` is applied globally before route registration — no route is accidentally left open.
- **Timing-safe comparison**: `express-basic-auth` uses constant-time comparison (`safeCompare`) to prevent timing attacks on credentials.
- **Startup guard**: The backend refuses to start if `DASHBOARD_PASSWORD` is empty, preventing an accidentally open deployment.
- **Two-factor authentication**: External access (IP outside `INTRANET_CIDR`) requires a time-limited 6-digit email code in addition to the password.
- **HttpOnly 2FA cookie**: The device trust token is stored in an HttpOnly, SameSite=Strict cookie — inaccessible to JavaScript, not vulnerable to XSS.
- **Short-lived codes**: 2FA codes expire after 10 minutes; each code is single-use (deleted on first verification attempt).
- **Persistent device tokens**: Verified device tokens survive backend restarts (stored in `config/2fa-tokens.json`); expired tokens are pruned automatically on read.
- **Forced TLS for SMTP**: Email is sent with either direct SSL (`SMTP_SECURE=true`, port 465) or forced STARTTLS (`requireTLS: true`, port 587) — opportunistic plaintext is never used.
- **`sessionStorage` over `localStorage`**: Credentials are cleared automatically when the tab is closed; they are never persisted across browser sessions.
- **No credential leakage in responses**: The `/api/config` endpoint redacts `ssh_key` values; the `management` block (including host/user) is stripped from `/api/items` responses.
- **SSH keys mounted read-only**: The backend container cannot modify key files; only `items.yml` is writable.
- **SSH key path restricted to secrets directory**: Write endpoints reject any `ssh_key` path that does not start with `/app/config/secrets/` — arbitrary filesystem paths cannot be injected via the API.
- **No SSH key upload via UI**: Keys must be placed on the host manually; the form only accepts a filename, the full path is assembled server-side.
- **Atomic file write**: `items.yml` is updated via a temp-file rename to prevent corruption; a crash mid-write leaves the original file intact.
- **No arbitrary command execution**: Only `reboot` and `docker compose restart` are permitted; action names are validated against an allowlist before any SSH command is built.
- **SSH host key verification**: Seeded from `config/known_hosts` mounted into the container.
- **`.env` and `config/secrets/` in `.gitignore`**: Credentials and keys are never committed to version control.
- **Use TLS in production**: Run behind a reverse proxy with HTTPS; HTTP Basic Auth sends credentials in Base64 (not encrypted) and is only safe over TLS.

---

## Future Enhancements (out of scope for v1)

- Notifications (email / webhook) on status change or failed action
- Action audit log (who triggered what and when)
- Historical uptime graphs (add Redis or SQLite for persistence)
- Custom health check types (TCP ping, DNS, TLS expiry)
- Dark/light mode toggle
- Support for additional action types (e.g., `ssh-systemd` to restart a systemd service)
- Multi-user support with role-based access (read-only vs. action-permitted)
