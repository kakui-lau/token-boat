# Pricing schema migration

The pricing schema migration is intentionally split into an expand phase and a
contract phase so it can be applied to the production database without making
old and new application pods incompatible during a rolling deployment.

## Phase 1: expand and backfill

Deploy the new application with `PRICING_SCHEMA_FINALIZE` unset. Startup
migrations create the canonical tables and columns, copy legacy purchase and
sales-price data into them, validate conflicts, and leave legacy columns and
the old cost-source table in place.

During this rollout, pause pricing-admin writes. Request routing and billing can
continue. After every old pod has been drained, restart one new pod once to
re-run the idempotent backfill and capture any pricing-admin write that may have
occurred during the rollout.

Validate at least these conditions before the contract phase:

- every official-ratio purchase version has `quote_spec.discount`;
- every structured purchase version has canonical `price_components`;
- every sales-price item has `pricing_config`;
- every legacy item/channel source exists in
  `sales_price_book_item_cost_sources` with the same purchase-price version;
- a generated quote, publish, user binding, and actual billed request complete
  successfully on the new pods.

## Phase 2: contract

Set `PRICING_SCHEMA_FINALIZE=true` on one new application pod and start it. The
migration repeats all validation and backfill steps before dropping the retired
columns and `sales_price_book_item_basis_sources`. If conflicting legacy data is
found, startup fails before destructive cleanup.

After that pod is healthy, roll the remaining new pods with the same setting.
The switch can be removed from the environment after all pods run the final
schema; subsequent startup runs are idempotent.

Before phase 2, take a database snapshot and retain it until pricing generation,
publication, TOC/TOB assignment, API billing, retry settlement, and exports have
all passed production smoke tests.
