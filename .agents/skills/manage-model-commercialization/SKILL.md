---
name: manage-model-commercialization
description: Safely onboard and commercialize AI models in token-boat/new-api, including authoritative official-price research, channel model mapping, model metadata, official/purchase/retail V2 price chains, margin calculation, routing activation, upstream probes, and production verification. Use when adding a model to a channel, updating provider pricing, configuring model mappings, calculating sales prices, validating model availability, or auditing model pricing and routing data.
---

# Manage Model Commercialization

Use the project command `go run ./cmd/model-commercialization` for deterministic database and pricing operations. Do not rewrite temporary migration programs.

## Workflow

1. Read `pkg/billingexpr/expr.md` completely before changing billing data.
2. Inspect the target channel and existing model:

   ```bash
   go run ./cmd/model-commercialization inspect --config /path/to/model.yaml
   ```

3. Research the provider's authoritative documentation. Record the exact source URL, effective prices, context size, architecture, parameter count, modalities, and upstream model identifier. Do not treat aggregator pricing as authoritative.
4. Create a YAML config from [references/configuration.md](references/configuration.md). Keep rates as decimal strings: `11%` is `"0.11"`.
   Require the user to provide the channel ID, logical model name, upstream model name, and purchase discount. If any is absent, stop before planning or writing, list the missing field, and ask the user for it. Never substitute a default discount.
5. Calculate and review the complete price chain offline:

   ```bash
   go run ./cmd/model-commercialization plan --config /path/to/model.yaml
   ```

6. Stop if the calculated retail price is not below the official list price, the source is ambiguous, the upstream identifier is unconfirmed, or the requested rates are missing.
7. Load the intended environment without printing credentials. For production, use the repository's approved environment-loading procedure.
8. Apply only after the user explicitly authorizes the target environment and write:

   ```bash
   go run ./cmd/model-commercialization apply --config /path/to/model.yaml --yes
   ```

9. Verify database state without spending upstream tokens:

   ```bash
   go run ./cmd/model-commercialization verify --config /path/to/model.yaml
   ```

10. Run a billable one-token upstream probe only when authorized:

    ```bash
    go run ./cmd/model-commercialization verify --config /path/to/model.yaml --probe
    ```

11. Check the public pricing API and, when a gateway test token is available, confirm the request pricing snapshot. Distinguish a direct channel probe from normal multi-channel routing: a normal gateway request may choose another eligible channel.
12. End every use with a concise operation report, including read-only or blocked runs. Report the target environment, channel and model mapping, authoritative pricing region/source, official/purchase/retail prices and currencies, margins/rates, IDs created or reused, runtime/routing state, verification and probe results, files changed, and any remaining blockers. Never include secrets.

## Safety rules

- Treat `plan` as offline and read-only. Treat `inspect` and default `verify` as database read-only.
- Require both the `apply` subcommand and `--yes` for writes.
- Never print channel keys, database URLs, API tokens, or full authorization headers.
- Preserve unrelated working-tree changes.
- Use existing pricing lifecycle services; never insert active price versions manually.
- Keep official prices, purchase prices, and retail prices as immutable version chains.
- Use the channel's documented procurement discount. Do not infer a discount from a different provider without evidence or user confirmation.
- Never default `channel_id`, `logical_model`, `upstream_model`, or `purchase_discount`. Missing values are blocking inputs and must be reported to the user.
- Keep `minimum_margin` at or below `target_margin`; default it to the target when the user gives no separate floor.
- Confirm every enabled channel for the logical model has a complete price chain before activating V2 runtime.
- Report model ID, channel-model ID, price-version IDs, exact prices, source URLs, probe status, and verification scope without secrets.
- Match the authoritative price region to the upstream procurement region. For providers with separate domestic and international catalogs, explicitly identify the selected region and do not mix prices or currencies across regions.

## Operation report

Use a compact report with these headings:

- `Scope`: environment, channel ID, logical model, upstream model.
- `Pricing`: region and source URL; official, purchase, and retail values with currencies; discount, variable-cost rate, tax rate, and target/minimum margins.
- `Database`: model, channel-model, official, purchase, and retail version IDs; state whether each was created, updated, or reused.
- `Verification`: mapping, ability, runtime, price-chain, public pricing API, gateway snapshot, and upstream probe status. Mark unrun checks explicitly.
- `Changes and blockers`: changed files/data and any unresolved issue.

## Command behavior

- `inspect`: show whether channel, logical model, channel model, and runtime identity exist.
- `plan`: validate configuration and calculate purchase/retail prices without database access.
- `apply`: upsert metadata and channel mapping, publish versioned official/purchase/retail prices, then activate V2.
- `verify`: require an enabled ability, active V2 channel model, complete active bundle, and exact planned retail prices.

Use [references/configuration.md](references/configuration.md) for all supported fields and a complete example.
