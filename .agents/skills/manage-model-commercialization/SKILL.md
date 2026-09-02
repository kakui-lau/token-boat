---
name: manage-model-commercialization
description: Safely stage, onboard, verify, and promote AI models and channels in token-boat/new-api across metadata, mappings, official prices, channel purchase prices, sales price books, channel-model cost overrides, runtime billing snapshots, probes, and production routing. Use when adding a model or channel, changing provider pricing, configuring model mappings, generating or publishing sales prices, validating billing, promoting a tested model, or auditing price and routing data.
---

# Manage Model Commercialization

Use `go run ./cmd/model-commercialization` for deterministic catalog, mapping,
official-price, and purchase-price operations. Use the pricing-admin lifecycle for
sales price books. Do not write temporary migration programs or mutate active
price rows directly.

## Required reading

1. Read `pkg/billingexpr/expr.md` completely before changing billing data.
2. Read [references/configuration.md](references/configuration.md) before creating
   a model config or changing a sales policy.

## Inputs and isolation

- For an existing channel/model require `channel_id`, `staging_group`,
  `logical_model`, `upstream_model`, verified `context_length`, and
  `purchase_discount`.
- For a new channel require its name, provider type, authoritative base URL, key
  through an environment variable, and one isolated `staging_group`; the created
  channel ID becomes the input to later steps.
- Never invent a purchase discount. Never default the staging group.
- During onboarding, the channel must belong only to the isolated staging group.
  If it also belongs to `default`, `auto`, or another production group, stop
  before writing and create a dedicated staging channel.
- Exception: when the user explicitly rejects isolation and authorizes direct
  production onboarding, use `onboard-production-channel --yes --production`.
  Create production abilities disabled, publish and verify the complete price
  chain, run the authorized bounded probes, then enable only the models whose
  probes passed. Keep channel-model pricing identities active so administrators
  can test and inspect them; route availability is controlled by abilities. A
  failed run must leave all new abilities disabled.
- Never print channel keys, database URLs, tokens, or authorization headers.

## End-to-end workflow

### 1. Research and normalize identity

Use authoritative provider documentation to verify the upstream model ID,
region, context window, modalities, architecture/parameters when available, and
every billable price dimension. Prefer the provider price page over an
aggregator. Record the exact source URL and effective date. Do not mix domestic
and international prices or currencies.

Normalize the customer-facing logical model ID independently from the upstream
ID. Preserve the exact mapping in the channel and `channel_models`.

### 2. Inspect and plan without writes

Create the YAML described in the configuration reference, then run:

```bash
go run ./cmd/model-commercialization inspect --config /path/to/model.yaml
go run ./cmd/model-commercialization plan --config /path/to/model.yaml
```

`plan` calculates the official-to-purchase chain and an indicative sales amount
using the explicit payment, distribution, operations, tax, and target-margin
fields. The derived variable-cost rate is the sum of the first three fields; it
is not an independent configuration value.

The indicative sales calculation is a review aid only. Actual customer pricing
must come from a sales price-book version.

### 3. Apply catalog, mapping, official price, and purchase price

After explicit authorization for the target environment and write:

```bash
go run ./cmd/model-commercialization apply --config /path/to/model.yaml --yes
```

`apply` upserts model metadata and the channel mapping, publishes immutable
official and channel-model purchase versions, and enables only the staging
ability. It does **not** create or publish customer sales prices.

For a staged channel with multiple models, `price-channel` publishes purchase
prices only. Supply an explicit discount for every model family present:

```bash
go run ./cmd/model-commercialization price-channel \
  --channel-id 18 --staging-group internal-model \
  --openai-discount 0.61 --google-discount 0.63 \
  --z-ai-discount 0.65 --anthropic-discount 0.85 \
  --moonshotai-discount 0.8 --yes
```

### 4. Generate customer prices through a sales price book

Use `/sales-price-books` or the corresponding pricing-admin lifecycle services:

1. Select the intended TOC or TOB price book. For TOB, confirm the target users
   are bound to that book; for TOC, confirm the intended TOC default book.
2. Clone the current active version to a draft, or create a draft if the book has
   no active version. Never edit an active version in place.
3. Set version defaults: payment fee, distribution fee, operations labor,
   effective tax, target net margin, minimum margin, and cost-basis strategy.
4. Add a channel-model override only when that channel/model is genuinely
   exceptional. Each non-null override wins over the version default for that
   same field; null inherits the version default. There is no third logical-model
   parameter layer.
5. Regenerate only the selected logical models. A logical model has one customer
   sales price per book version; its expanded channel rows show different
   purchase costs, effective parameters, margins, and routing eligibility.
6. Review warnings and version differences. Prices above official list price or
   discounts above 100% are warnings, not automatic blockers. Resolve any
   missing official price, missing active purchase price, invalid expression, or
   empty generated item before publication.
7. Publish the draft. Publishing makes the version immutable and switches the
   book's current version.

The supported cost-basis strategies are those exposed by the pricing-admin UI,
commonly `max_eligible_cost`, `min_eligible_cost`, or `designated_channel`.
Channel-model overrides affect generation and eligibility; they do not create a
separate customer price per route.

### 5. Verify the complete chain

Verify catalog and procurement state without spending upstream tokens:

```bash
go run ./cmd/model-commercialization verify --config /path/to/model.yaml
```

Then audit the published sales price resolved for the logical model and channel:

```bash
go run ./cmd/model-commercialization audit-model-pricing \
  --logical-model vendor/model --channel-id 18
```

Also verify through the frontend/API:

- price book and current published version resolve for the staging user;
- logical-model sales item and expression exist and expose all billable
  dimensions;
- expanded channel details show purchase discount, sales discount, effective
  defaults/overrides, margin, and route eligibility;
- an API request creates `request_pricing_snapshots` containing the exact
  official, purchase, sales-book/version/item, channel-model, and expression
  identities used by that request;
- pre-consume, settlement, retry, refund, async completion, streaming, and error
  paths reuse the frozen request price instead of recalculating from current
  configuration;
- consume logs show charged amount and official-list reference amount.

Test first in the playground with the channel explicitly selected, then through
automatic routing with a token restricted to the staging group. A selected
channel must never fall back to another channel.

Run a billable upstream probe only when explicitly authorized:

```bash
go run ./cmd/model-commercialization verify --config /path/to/model.yaml --probe
```

### 6. Promote separately

Only after all checks pass and the user explicitly authorizes public traffic:

1. add the dedicated channel to the intended production groups;
2. refresh routing and pricing caches;
3. confirm the TOC default or TOB user binding resolves the expected published
   version;
4. run one production request and reconcile its request snapshot, consume log,
   balance deduction, official reference amount, channel cost, and refund state.

`apply`, `verify`, and publishing a price-book draft do not by themselves
authorize public routing.

For the explicit direct-production exception, promotion is the final step of
`onboard-production-channel`: it remains non-routable until catalog, official,
purchase, TOC sales publication, and probe checks have all succeeded.

## Safety invariants

- Official, purchase, sales-book versions, and request pricing snapshots are
  immutable history. Use lifecycle services to publish replacements.
- The only sales-parameter priority is: non-null channel-model override, then
  price-book-version default.
- `minimum_margin_rate` may be zero but must not exceed
  `target_net_margin`; omission defaults it to the target in the onboarding
  config.
- Confirm every enabled candidate channel for the logical model has an active
  authoritative official price and active purchase price before generating or
  publishing customer prices.
- A TOB book may intentionally contain only contracted models. Do not require it
  to cover the whole platform catalog.
- Treat an official-price change, procurement discount change, or override
  change as an input change: create/publish the new upstream version, clone the
  sales version, regenerate affected logical models, review, then publish.
- Preserve unrelated working-tree and database state.

## Operation report

End every use, including blocked and read-only runs, with:

- `Scope`: environment, channel/model IDs and mapping, staging and production
  groups, target price book and audience.
- `Sources`: official region, currency, source URL/effective date, context and
  metadata evidence.
- `Pricing`: official components, purchase discount/components, price-book
  defaults, channel-model overrides, cost-basis strategy, generated customer
  prices and warning status.
- `Database`: created/reused official and purchase version IDs, price-book,
  version, item, override, and request-snapshot IDs.
- `Verification`: staging ability, explicit-channel request, automatic routing,
  billing snapshot, consume/refund/log reconciliation, and optional probe.
- `Changes and blockers`: files/data changed and every check not run. Never
  include secrets.

## Command truth table

- `inspect`: read catalog, mapping, channel-model, and purchase state.
- `plan`: offline calculation only; no database access.
- `apply`: write metadata, mapping, official version, purchase version, and
  staging ability; no customer sales-price publication.
- `price-channel`: publish purchase prices only for an isolated staged channel.
- `verify`: validate mapping, staging ability, and active official/purchase
  bundle; `--probe` adds one billable upstream request.
- `audit-model-pricing`: read the runtime-resolved sales price and channel
  eligibility after a sales price-book version has been published.
- `onboard-production-channel`: explicit direct-production exception requiring
  `--yes --production`; stages abilities disabled and activates only verified
  model routes after the whole price chain is published.

Use [references/configuration.md](references/configuration.md) for supported YAML
fields and sales-policy semantics.
