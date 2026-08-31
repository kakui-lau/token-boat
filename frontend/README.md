# Token Boat Frontend V2

This directory contains the next-generation User Console. It remains isolated
from the legacy frontend at source level, but the production build assembles
both applications into the same Go binary and Docker image:

- `/` and existing non-`/console` routes serve the legacy frontend from `../web`.
- `/console/` and `/console/*` serve User Console V2.
- Both applications use the same API origin, backend, session, and database.

## Development

```bash
bun install
bun run dev
```

The default command starts both frontend development servers behind one shared
origin while reusing the single existing Go backend on port `3000`:

- `http://localhost:5173/console/` serves User Console V2.
- `http://localhost:5173/` and all non-`/console` routes serve the legacy frontend.
- `/api`, `/mj`, `/pg`, and `/v1` from both frontends are sent to the same backend
  on `3000`, so both versions use the same local PostgreSQL database.

The legacy frontend listens internally on `5174`; it is not a second backend.
Do not start an isolated `3001` API for normal development.

The interface defaults to Simplified Chinese. Theme mode and presets, font registry, dashboard layout, navbar
behavior, sidebar style and collapse mode, density, motion, and language
controls are grouped under Account > Theme settings; the account menu links
there directly, and all changes apply immediately. The legacy
`/console/preferences` URL redirects to the account tab. Only Simplified
Chinese and English are shipped.

The User Console includes onboarding, integration reference, Playground, API
keys, model and price discovery, usage analytics, request diagnostics,
asynchronous tasks, alerts and platform status, billing, team access, account
security, and preferences. Every analytics or operational time filter uses the
shared shadcn date-range control composed from Popover, Calendar range mode,
and ToggleGroup, with Today, 7/30/90-day shortcuts and direct calendar range
selection.

All data tables share a compact shadcn Table baseline. Long identifiers, model
names, endpoints, and descriptions use concise visible values with the full
content retained in a title or details view; dates use a short list format,
numeric columns align right with tabular figures, and repeated price units use
`/1M`, `/req`, or `/s` notation. The Account theme settings' Compact
density applies an additional spacing reduction to every table.

To work on only one frontend while keeping the same backend and database:

```bash
bun run dev:new       # V2 at localhost:5173/console/
bun run dev:legacy    # Legacy at localhost:5173/
```

To run V2 without any backend, use the in-memory demo repository:

```bash
bun run dev:demo
```

The default live mode maps the existing login, refresh, token, log, task, billing,
subscription, account, session, model, and Playground endpoints. It is for
local development against the existing backend and PostgreSQL data. The access
token stays in memory; refresh authentication uses the existing cookie flow.

## Verification

```bash
bun run lint
bun run format:check
bun run typecheck
bun run test
bun run build
```

From the repository root, `make build-all-web` builds both applications and
copies the V2 output into `web/dist/console`. Release binaries and Docker images
embed that combined directory, so updating the legacy frontend and publishing a
normal release also publishes the current User Console V2.

Synchronize the English and Simplified Chinese catalogs after adding UI text with:

```bash
bun run i18n:sync
```

Live Repository integration tests use MSW at the HTTP boundary. They currently
protect session bootstrap error semantics, usage/quota mapping, paginated API
keys, one-time key creation, and Playground request context without contacting
the production service.
