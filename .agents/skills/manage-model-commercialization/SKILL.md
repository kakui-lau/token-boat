---
name: manage-model-commercialization
description: Safely stage, onboard, verify, and promote AI models in token-boat/new-api, including isolated internal-test routing, authoritative official-price research, channel model mapping, metadata, V2 price chains, margin calculation, probes, and production verification. Use when adding a model or channel, updating provider pricing, configuring mappings, calculating sales prices, validating availability, promoting a tested model to public traffic, or auditing pricing and routing data.
---

# Manage Model Commercialization

Use the project command `go run ./cmd/model-commercialization` for deterministic database and pricing operations. Do not rewrite temporary migration programs.

## Workflow

1. Read `pkg/billingexpr/expr.md` completely before changing billing data.
2. Require an isolated internal-test group. The target channel must belong only
   to this group during onboarding. If it also belongs to any public or `auto`
   group, stop before writing. For an existing public channel, create a separate
   internal-test channel instead of adding an unverified model directly.
3. Inspect the target channel and existing model:

   ```bash
   go run ./cmd/model-commercialization inspect --config /path/to/model.yaml
   ```

4. Research the provider's authoritative documentation. Record the exact source URL, effective prices, context size, architecture, parameter count, modalities, and upstream model identifier. Do not treat aggregator pricing as authoritative.
5. Create a YAML config from [references/configuration.md](references/configuration.md). Keep rates as decimal strings: `11%` is `"0.11"`.
   Require the user to provide the channel ID, isolated staging group, logical model name, upstream model name, and purchase discount. If any is absent, stop before planning or writing, list the missing field, and ask the user for it. Never substitute a default discount.
6. Calculate and review the complete price chain offline:

   ```bash
   go run ./cmd/model-commercialization plan --config /path/to/model.yaml
   ```

7. Stop if the calculated retail price is not below the official list price, the source is ambiguous, the upstream identifier is unconfirmed, the requested rates are missing, or the channel is not isolated to the staging group.
8. Load the intended environment without printing credentials. For production, use the repository's approved environment-loading procedure.
9. Apply only after the user explicitly authorizes the target environment and write. Applying publishes the price chain for internal testing; it does not authorize adding the channel to public groups:

   ```bash
   go run ./cmd/model-commercialization apply --config /path/to/model.yaml --yes
   ```

   For an already staged channel containing models from multiple vendors, use
   `price-channel` only when the user explicitly provides every family discount
   and all retail rates. The command rejects missing authoritative official
   prices, public-group channels, and conflicting active price chains:

   ```bash
   go run ./cmd/model-commercialization price-channel \
     --channel-id 18 --staging-group internal-model \
     --openai-discount 0.61 --google-discount 0.63 \
     --z-ai-discount 0.65 --anthropic-discount 0.85 \
     --moonshotai-discount 0.8 \
     --variable-cost-rate 0.11 --tax-rate 0.165 \
     --target-margin 0.03 --yes
   ```

10. Verify database state and the staging-group ability without spending upstream tokens:

   ```bash
   go run ./cmd/model-commercialization verify --config /path/to/model.yaml
   ```

11. Run a billable one-token upstream probe only when authorized:

    ```bash
    go run ./cmd/model-commercialization verify --config /path/to/model.yaml --probe
    ```

12. Test twice: first in the playground with the channel explicitly selected, then through automatic routing using a token restricted to the staging group. Verify billing snapshots, logs, errors, and refunds.
13. Promote only after all checks pass and the user explicitly authorizes public traffic. Add the dedicated channel to the intended production groups, refresh routing caches, and verify the candidate route and one production request. Never silently treat `apply` or `verify` as production approval.
14. End every use with a concise operation report, including read-only or blocked runs. Report the target environment, channel and model mapping, authoritative pricing region/source, official/purchase/retail prices and currencies, margins/rates, IDs created or reused, staging group, production groups, runtime/routing state, verification and probe results, files changed, and any remaining blockers. Never include secrets.

## Safety rules

- Treat `plan` as offline and read-only. Treat `inspect` and default `verify` as database read-only.
- Require both the `apply` subcommand and `--yes` for writes.
- Never print channel keys, database URLs, API tokens, or full authorization headers.
- Preserve unrelated working-tree changes.
- Use existing pricing lifecycle services; never insert active price versions manually.
- Keep official prices, purchase prices, and retail prices as immutable version chains.
- Use the channel's documented procurement discount. Do not infer a discount from a different provider without evidence or user confirmation.
- Never default `channel_id`, `staging_group`, `logical_model`, `upstream_model`, or `purchase_discount`. Missing values are blocking inputs and must be reported to the user.
- Never onboard directly on a channel that belongs to a public group. Require a dedicated channel isolated to the staging group; this prevents a newly mapped model from receiving public traffic before verification.
- Treat public-group promotion as a separate write requiring explicit authorization after internal verification.
- Keep `minimum_margin` at or below `target_margin`; default it to the target when the user gives no separate floor.
- Confirm every enabled channel for the logical model has a complete price chain before activating V2 runtime.
- Report model ID, channel-model ID, price-version IDs, exact prices, source URLs, probe status, and verification scope without secrets.
- Match the authoritative price region to the upstream procurement region. For providers with separate domestic and international catalogs, explicitly identify the selected region and do not mix prices or currencies across regions.

## Operation report

Use a compact report with these headings:

- `Scope`: environment, channel ID, staging group, production groups, logical model, upstream model.
- `Pricing`: region and source URL; official, purchase, and retail values with currencies; discount, variable-cost rate, tax rate, and target/minimum margins.
- `Database`: model, channel-model, official, purchase, and retail version IDs; state whether each was created, updated, or reused.
- `Verification`: mapping, ability, runtime, price-chain, public pricing API, gateway snapshot, and upstream probe status. Mark unrun checks explicitly.
- `Changes and blockers`: changed files/data and any unresolved issue.

## Command behavior

- `inspect`: show whether channel, logical model, channel model, and runtime identity exist.
- `plan`: validate configuration and calculate purchase/retail prices without database access.
- `apply`: first require the channel to belong only to `staging_group`, then upsert metadata and mapping, publish versioned official/purchase/retail prices, and activate V2 for internal testing.
- `price-channel`: require an isolated staging channel and explicit discounts
  for every supported model family; reuse only active authoritative official
  prices, publish purchase/retail chains through lifecycle services, activate
  V2, and verify exact discounts and rates.
- `verify`: require an enabled ability in `staging_group`, active V2 channel model, complete active bundle, and exact planned retail prices.

Use [references/configuration.md](references/configuration.md) for all supported fields and a complete example.
