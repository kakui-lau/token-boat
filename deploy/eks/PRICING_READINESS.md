# Pricing production readiness

This directory contains a read-only pre-deployment check. It never publishes
prices, calls providers, or changes Kubernetes resources.

## Required runtime configuration

- Run at least two application replicas with a shared `SESSION_SECRET`.
- Configure shared Redis through `REDIS_CONN_STRING`.
- Provide `SQL_DSN`; otherwise the application falls back to SQLite.
- Run the one-shot database migration from the exact release commit before
  starting application pods with `SKIP_DB_MIGRATION=true`.
- Back up the database before the first release containing the pricing
  convergence migration. That migration removes the retired channel retail
  pricing table and `channel_models.runtime_mode` column after preserving sales
  amounts in the renamed request-snapshot columns.

## What readiness verifies

1. the database can be opened read-only;
2. every route-active channel model has one valid published purchase price;
3. every reachable logical model resolves a published sales price book item;
4. purchase candidates have compatible billing contracts and non-negative
   quoted costs;
5. every candidate satisfies the configured minimum margin for representative
   usage;
6. route scores are valid and ordered;
7. shared Redis circuit state is reachable;
8. purchase prices carry production evidence or an audited explicit net-price
   contract.

An incomplete purchase price or sales price book is a hard readiness failure
and a request-time 503. There is no legacy pricing fallback or runtime switch.

The job does not perform billable provider requests. Live validation requires
dedicated test accounts, a bounded budget, and explicit approval.
