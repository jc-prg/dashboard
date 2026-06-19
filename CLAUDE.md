# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

The app runs via Docker Compose. Copy `.env.example` to `.env` and fill in credentials before starting.

```bash
docker compose up -d           # start everything
docker compose restart backend # restart backend after backend changes
docker compose restart frontend # rebuild/restart frontend after frontend changes
```

Frontend is served on port 80. Backend runs on port 3001 (internal only).

## Backend commands (in `backend/`)

```bash
npm run dev        # run with --watch (auto-restart on file change)
npm test           # run all tests
npm test -- --testPathPattern=configWriter  # run a single test file
npm run test:watch # watch mode
```

## Frontend commands (in `frontend/`)

```bash
npm run dev        # Vite dev server
npm test           # run all tests (vitest)
npm run test:watch # watch mode
```

## Architecture

### Config-driven

All items are defined in `config/items.yml`, which is volume-mounted into the backend container. The backend reads and writes this file directly — there is no database. SSH private keys are stored as files in `config/secrets/` (gitignored).

### Backend (`backend/src/`)

- **`config.js`** — reads and validates `items.yml` with `loadConfig()`. Called on every request (no caching). Fails fast on startup if the file is invalid.
- **`configWriter.js`** — writes item changes back to `items.yml` (`addItem`, `updateItem`, `deleteItem`). Validates input and checks cross-references before writing.
- **`healthcheck.js`** — polls item URLs on a configurable interval and keeps results in an in-memory `statusCache`. Status is attached to every item response.
- **`actions.js`** — executes remote actions (reboot, restart) over SSH via `ssh.js`.
- **`routes/items.js`** — CRUD for items. `managementInfo()` strips sensitive fields before returning to the client.
- **`routes/actions.js`** — triggers SSH actions; passes the full `allItems` list to `executeAction` so ssh-compose items can resolve their server's credentials.

### Management types

Two types, stored in `management:` block of each item in the YAML:

- **`ssh-server`** — stores `host`, `port`, `user`, `ssh_key` directly. Used for server items. Action: `reboot`.
- **`ssh-compose`** — stores `server_id` (reference to an `ssh-server` item), `compose_dir`, and optionally `compose_service`. SSH credentials are resolved at runtime from the referenced server. Action: `restart`.

### Frontend (`frontend/src/`)

Single-page React app with no router. State flow:
- `App.jsx` holds auth state; renders `LoginForm` or `Dashboard`
- `Dashboard.jsx` owns item list state via `useItems` hook and opens `ItemFormModal`
- `useItems.js` — all API calls for items (fetch, create, update, delete, trigger action)
- `useAuth.js` — stores the Basic auth token in sessionStorage

### API

All endpoints require Basic auth. Prefix: `/api`

- `GET /api/items` — list all items with status
- `POST /api/items` — create item
- `PUT /api/items/:id` — update item
- `DELETE /api/items/:id` — delete item
- `GET /api/items/:id/status` — poll single item status
- `POST /api/items/:id/action/:action` — trigger SSH action
- `GET /api/auth/check` — validate credentials
