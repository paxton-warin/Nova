# Nova Browser

Nova Browser is a full-stack browser-style web app with a React/Vite frontend and an Express/SQLite backend. It includes multi-tab browsing, internal pages, ticketing, notifications, admin tooling, sync/merge flows, proxy routing, and configurable games/apps catalogs.

## Stack

- Frontend: `React`, `Vite`, `TypeScript`, `Tailwind`, `Radix UI`
- Backend: `Express`, `TypeScript`, `better-sqlite3`, `express-session`
- Browser transport: `scramjet`, `bare-mux`, `wisp`, optional `libcurl` transport

## Features

- Multi-tab browser UI with internal pages like new tab, apps, games, blocked pages, and settings
- User accounts, TOTP support, session-backed auth, and admin roles
- Support tickets and notification center flows for users and admins
- Local/account sync merge manager for tabs, settings, shortcuts, bookmarks, history, apps, and passwords
- Proxy location selection with fallback handling and user-facing warnings
- Configurable preloaded apps/games catalog via `nova.catalog.json`
- Configurable proxy pools via `nova.proxies.json`

## Getting Started

### 1. Install dependencies

If `pnpm` is not installed globally, enable it through Corepack first:

```bash
corepack enable
```

From the repo root:

```bash
pnpm run install:all
```

Or install manually:

```bash
pnpm install
pnpm --dir frontend install
```

### 2. Configure environment

Copy `.env.example` to `.env` and update the values:

```env
PORT=3000
DATABASE_PATH=./data/nova-browser.db
SESSION_SECRET=replace-with-a-long-random-secret
MASTER_ADMIN_USERNAME=admin
MASTER_ADMIN_PASSWORD=replace-with-a-strong-password
MASTER_ADMIN_TOTP_SECRET=replace-with-a-valid-base32-secret
ENABLE_ERUDA_BY_DEFAULT=false
LIBCURL_TRANSPORT_PATH=/libcurl-transport-wrapper.mjs
WISP_PATH=/wisp/
```

Important notes:

- `SESSION_SECRET` should be a long random string. Changing it invalidates existing login sessions.
- `DATABASE_PATH` points to the SQLite database file used by the server.
- `MASTER_ADMIN_*` values bootstrap the default master admin account.
- `LIBCURL_TRANSPORT_PATH` and `WISP_PATH` should match how you serve those transport assets in your environment.

### 3. Start development

Run both server and frontend watcher:

```bash
pnpm run dev
```

That starts:

- backend on `http://localhost:3000`
- frontend Vite dev server via `frontend/`

## Production Build

Build the frontend bundle:

```bash
pnpm run build
```

Then start the server:

```bash
pnpm start
```

The backend serves the built frontend from `frontend/dist`.

## Scripts

Root scripts:

- `pnpm run dev` - run backend and frontend in development
- `pnpm run dev:server` - run backend watcher only
- `pnpm run dev:frontend` - run frontend Vite dev server only
- `pnpm run build` - build the frontend bundle
- `pnpm start` - start the backend server
- `pnpm run lint` - run frontend linting
- `pnpm run install:all` - install root and frontend dependencies

Frontend scripts:

- `pnpm --dir frontend run dev`
- `pnpm --dir frontend run build`
- `pnpm --dir frontend run preview`
- `pnpm --dir frontend run lint`
- `pnpm --dir frontend run test`

## Repo Layout

```text
src/                     Backend server and env parsing
frontend/src/            Frontend app source
frontend/public/         Public static assets
frontend/dist/           Built frontend output
scripts/                 Utility and smoke-test scripts
data/                    SQLite DB and uploads at runtime
nova.catalog.json        Preloaded apps/games catalog
nova.proxies.json        Proxy location and pool config
```

## Configuration Files

### `nova.catalog.json`

Defines the preloaded app/game catalog shown in internal Nova pages. Typical fields include:

- `id`
- `title`
- `url`
- `icon`
- `banner`
- `description`
- `category`

### `nova.proxies.json`

Defines available proxy locations and their backing proxy URLs. Nova uses this for transport selection, health checks, and fallback behavior.

If a selected location has no healthy proxy available, Nova can fall back and surface a warning to the user.

## Data and Persistence

- Browser/app data is stored in SQLite at the path from `DATABASE_PATH`
- Uploaded ticket attachments are stored under `data/uploads`
- Some guest/local state is also cached in browser storage on the frontend

If you want a completely clean local reset, stop the app first, then remove the database file and any runtime upload/state files you no longer want.

## Testing and Linting

Frontend lint:

```bash
pnpm run lint
```

Frontend tests:

```bash
pnpm --dir frontend run test
```

## Deployment Notes

- Set `SESSION_COOKIE_SECURE=true` when serving over HTTPS only
- Set `TRUST_PROXY` correctly if Nova is behind nginx, Caddy, Cloudflare Tunnel, or another reverse proxy
- Build the frontend before using `pnpm start`
- Make sure your proxy/static transport paths line up with your deployed asset routing

## Troubleshooting

- `frontend/dist/index.html` missing: run `pnpm run build`
- Everyone got logged out after config change: likely `SESSION_SECRET` changed
- Proxy warnings in the UI: check `nova.proxies.json`, transport assets, and upstream proxy health
- Fresh start needed: stop the app and remove the SQLite DB configured in `DATABASE_PATH`

