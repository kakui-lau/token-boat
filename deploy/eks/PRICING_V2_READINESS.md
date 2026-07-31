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
- Create a database account that only has `SELECT` permission for the readiness
  job. Store that DSN under the `sql-dsn-read-only` key.
- Use an immutable ECR image digest for the application and readiness job.

## What the job verifies

`pricing-v2-readiness-job.yaml` runs `/pricing-readiness` from the release
image. The command:

1. opens the database in a read-only session and never runs migrations;
2. rebuilds the in-memory V2 catalog using `SELECT` queries;
3. requires every channel model to use V2;
4. evaluates a representative quote for every enabled group/model scope;
5. validates eligible candidates, non-negative purchase amounts and route
   score ordering;
6. requires reachable shared Redis circuit state;
7. rejects `local_bootstrap`, `legacy_import`, missing official-source
   revisions/timestamps, and local-test purchase/retail evidence.

## Safe execution

Prepare a copy of the manifest outside the repository, replace
`REPLACE_WITH_ECR_IMAGE_AT_DIGEST`, and run it before changing the application
Deployment. A successful job prints one `verified:` line and exits with status
zero. Any incomplete price chain, local placeholder price, Redis failure or
non-V2 model exits non-zero.

The job does not perform live provider requests. Live provider validation must
use dedicated test accounts and a bounded budget after explicit approval.
