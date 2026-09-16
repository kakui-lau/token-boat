# Token Boat Frontend V2

This directory contains three isolated product surfaces:

- `apps/site`: Astro public site, assembled at the production root.
- `apps/console`: React User Console, assembled at `/console/*`.
- `apps/admin`: independent React Admin Console under development; it is build-tested but not
  included in the production web bundle yet.

The applications share workspace packages, design-system composition, and a product capability
catalog, but not business routers, query caches, repositories, or role-specific API DTOs. The
production build assembles the public site and User Console with the legacy compatibility shell:

- `/` and public content routes serve the Astro site.
- `/console/*` serves the new React User Console.
- `/dashboard/*` serves the established legacy dashboard for any signed-in user. The public site has
  no legacy-dashboard link; users open the URL directly when they need the compatibility interface.
  Administrator-only sections and actions keep their existing role and permission checks.
- The legacy frontend is retained as an internal compatibility shell for the administrator
  dashboard, first-run setup, authentication and migration callbacks. It is not mounted as a public
  `/legacy` application, and the unfinished Admin V2 is not exposed at `/admin`.
- All applications use the same API origin, backend, session, and database.

The release workflow, Docker images, and `make build-all-web` use the same assembly order: preserve
the legacy compatibility shell, overlay the Astro public output at `web/dist`, then mount the User
Console below it. The default public site is Astro. Set `PUBLIC_SITE_MODE=legacy` and restart the
service to roll back only the public pages; `/console/*` remains new and `/dashboard/*` remains the
legacy compatibility dashboard in either mode. Unset it or use `PUBLIC_SITE_MODE=new` to restore the
new public site.

The legacy compatibility shell keeps the existing runtime Umami/Google Analytics injection. The
Astro public site does not load non-essential analytics until it has an explicit notice and choice
flow consistent with the published privacy policy.

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

EVM wallet sign-in uses injected browser wallets by default. Set
`VITE_CONSOLE_WALLETCONNECT_PROJECT_ID` at build time to also enable
WalletConnect QR/mobile wallets; this identifier is a public client project ID,
not a signing secret.

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
bun run dev:site      # New Astro public site at localhost:4321/
bun run dev:admin     # New Admin Console at localhost:5175/admin/
```

The Site and Admin commands run standalone development servers. Production does not use those dev
ports: the public-site output is embedded at `/`, while Admin V2 remains available only through its
development server until it is approved to replace `/dashboard`. The public pricing and model pages
read the existing same-origin `/api/pricing` contract; account-group prices remain in the signed-in
User Console.

Admin Console is organized around administrator workflows instead of mirroring User Console pages.
Its focused navigation covers gateway operations, request tracing, channel usage, model
commercialization, official/purchase/sales pricing, pricing governance, User 360, customer usage,
finance, subscriptions, redemptions, system settings, system information, and audit. Related tools such
as routing, probes, deployments, API-key administration, tasks, recharge records, and settings
subdomains live inside their owning workspace. Workspace membership, complete user alert rules, and
incident management remain outside navigation until their backend domain contracts exist.

Shared presentational components and interaction patterns may be reused, but Admin data uses separate
capability-gated projections so it can expose authorized expanded or sensitive fields and audited
mutations without weakening the User Console's self-scoped, limited-field contracts. Capability
coverage therefore does not imply route or page parity between the two applications.

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

From the repository root, `make build-all-web` assembles the Astro site at `web/dist`, the User
Console at `web/dist/console`, and the compatibility shell at `web/dist/legacy/index.html`. The Admin
V2 build is still verified but is removed from the assembled production directory. Release binaries
and Docker images embed that same layout. `scripts/check-web-assembly.sh` fails the build if a
required shell is absent, the Astro overlay did not occur, or Admin V2 leaked into the bundle.

Synchronize the English and Simplified Chinese catalogs after adding UI text with:

```bash
bun run i18n:sync
```

Live Repository integration tests use MSW at the HTTP boundary. They currently
protect session bootstrap error semantics, usage/quota mapping, paginated API
keys, one-time key creation, and Playground request context without contacting
the production service.
