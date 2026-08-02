# Pricing V2 production readiness

This directory contains a read-only pre-deployment check. It does not publish
prices, switch runtime modes, call providers, or modify Kubernetes resources by
itself.

## Required runtime configuration

- Run at least two application replicas.
- Use one shared `SESSION_SECRET`.
- Set `REDIS_CONN_STRING` to the primary endpoint of an ElastiCache replication
  group with Cluster Mode disabled. The application currently uses the
  non-cluster Redis client.
- Store `SQL_DSN` and `REDIS_CONN_STRING` in a Kubernetes Secret. Do not commit
  either value.
- The application reads `SQL_DSN`; it does not read `DATABASE_URL`. A local
  `.env.prod` containing only `DATABASE_URL` may be used by data-copy tooling,
  but it is not a valid application or readiness-job environment. Without
  `SQL_DSN`, the application falls back to SQLite.
- Create a database account that only has `SELECT` permission for the readiness
  job. Store that DSN under the `sql-dsn-read-only` key.
- Use an immutable ECR image digest for the application and readiness job.
- Split the application into exactly one `NODE_TYPE=master` Deployment and a
  scalable `NODE_TYPE=slave` worker Deployment. Set
  `SKIP_DB_MIGRATION=true` on both.
- Before a Helm upgrade, run the one-shot migration from the exact release
  commit with
  `DB_MIGRATION_ENV_FILE=.env.prod DB_MIGRATION_CONFIRM=MIGRATE go run ./cmd/db-migrate`.
  Do not run it concurrently and do not allow application pods to migrate.

## What the job verifies

`pricing-v2-readiness-job.yaml` runs `/pricing-readiness` from the release
image. The command:

1. opens the database in a read-only session and never runs migrations;
2. rebuilds the in-memory V2 catalog using `SELECT` queries;
3. requires every route-active channel model (enabled channel, channel model and
   ability) to use V2; disabled or unroutable inventory does not block a release;
4. evaluates a representative quote for every route-active group/model scope using
   both its base multiplier and every distinct user-group override that can
   reach that route group;
5. validates eligible candidates, non-negative purchase amounts and route
   score ordering;
6. requires reachable shared Redis circuit state;
7. requires official-source evidence for official-ratio/component-ratio/hybrid
   purchases, permits audited explicit-net-price contracts without an official
   dependency, and rejects local-test purchase/retail evidence.

## Safe execution

Prepare a copy of the manifest outside the repository, replace
`REPLACE_WITH_ECR_IMAGE_AT_DIGEST`, and keep the exact digest in the release
record. A successful job prints one `verified:` line and exits with status zero.
Any incomplete price chain, local placeholder price, Redis failure or non-V2
model exits non-zero.

This command validates the active V2 catalog, so its timing depends on the
release type:

- for a routine upgrade where production already runs V2 for every enabled
  channel model, run it before and after the Deployment rollout;
- for the first V2 cutover, do not send public traffic to the new image while
  any route-active model is still legacy. Start an admin-only canary outside the
  public Service, prepare and atomically enable every route-active model through
  the admin API, run this job, and only then shift traffic to the new image.

The new request path is V2-only: an active legacy model or incomplete chain is a
503, not a legacy fallback. Do not set `runtime_mode` directly merely to make the
job pass. Model activation must go through the admin/service validation so all
enabled channels are checked and switched atomically. Before a first cutover,
rehearse the same dataset and digest against an isolated production snapshot.

The job does not perform live provider requests. Live provider validation must
use dedicated test accounts and a bounded budget after explicit approval.
