# Configuration reference

Use one YAML file per channel/model catalog and procurement operation. The file
also carries intended sales-policy defaults so `plan` can show an indicative
customer price before database writes.

The following fields are mandatory and never receive guessed values:
`channel_id`, `staging_group`, `logical_model`, `upstream_model`,
`context_length`, and `purchase_discount`. The target channel must belong only
to the isolated `staging_group` during onboarding.

```yaml
channel_id: 14
staging_group: internal-model-test
logical_model: moonshotai/kimi-k3-premium
upstream_model: kimi-k3
context_length: 1048576

vendor: Moonshot
icon: Moonshot
description: >-
  Kimi K3 model with verified modalities and context window.
tags:
  - 文本
  - 推理
  - 代码
  - 长上下文
endpoints:
  - openai

official_source_url: https://platform.moonshot.ai/docs/pricing
official_input_per_1m: "3"
official_output_per_1m: "15"
official_cache_read_per_1m: "0.3"
official_cache_write_per_1m: ""

purchase_discount: "0.75"

payment_fee_rate: "0.04"
distribution_fee_rate: "0.05"
operations_labor_rate: "0.02"
effective_tax_rate: "0.165"
target_net_margin: "0.03"
minimum_margin_rate: "0.03"
```

## Catalog and purchase semantics

- Flat token prices use USD per 1,000,000 tokens. Expression-priced models must
  use the project's billing-expression workflow rather than forcing flat fields.
- Empty flat price components are omitted.
- `purchase_discount` multiplies each official component to produce the
  channel-model procurement component.
- `endpoints` defaults to `openai` when omitted.
- Unknown YAML fields fail validation to catch misspellings.
- `apply` publishes official and purchase versions only. It does not publish a
  sales price book.

## Sales-policy semantics

The six sales fields correspond to defaults on a sales price-book version:

- `payment_fee_rate`
- `distribution_fee_rate`
- `operations_labor_rate`
- `effective_tax_rate`
- `target_net_margin`
- `minimum_margin_rate`

The first three are independent business costs. Their sum is the derived
variable-cost rate used by the indicative calculator; do not configure a second
aggregate variable-cost field.

```text
variable cost rate = payment fee + distribution fee + operations labor

selling factor = (1 - effective tax) /
  ((1 - variable cost rate) × (1 - effective tax) - target net margin)

indicative sales amount =
  round-up-to-5-decimals(purchase amount × selling factor)
```

`minimum_margin_rate` defaults to `target_net_margin` when omitted and may not
exceed it.

Actual customer prices must be generated inside a draft sales price-book
version. Choose its `cost_basis_strategy` in the price-book UI/API. If one
channel/model needs special economics, create a channel-model override containing
only the exceptional non-null fields; all null fields inherit the version
defaults. The override table supports:

- payment fee rate;
- distribution fee rate;
- operations labor rate;
- effective tax rate;
- target net margin;
- minimum margin rate;
- remark/audit context.

There is intentionally no logical-model parameter override layer. One logical
model has one shared customer price within a book version, while expanded
channel rows show each route's procurement cost, effective parameters, margin,
and eligibility.

## Explicit direct-production channel configuration

Use this multi-model shape only when the user explicitly authorizes direct
production onboarding without an isolated group. Keep the key in the named
environment variable. `route_enabled: false` preserves the complete catalog and
price chain while keeping the model out of automatic routing after a failed or
deferred probe. The channel-model row remains active so administrators can run
explicit channel tests and see the real upstream error instead of a misleading
"price not configured" error.

```yaml
channel_name: provider-official-01
channel_type: 25
production_group: default
base_url: https://api.provider.example
key_env: PROVIDER_API_KEY
vendor: Provider
icon: Provider
purchase_quote_reference: operator-confirmed-2026-09-02
quote_valid_until: 2103638400
models:
  - logical_model: provider/model-premium
    upstream_model: model
    context_length: 262144
    description: Verified production model.
    tags: [text, code]
    endpoints: [openai]
    official_source_url: https://provider.example/pricing
    official_source_version: "2026-09-02"
    official_source_updated_at: 1788278400
    official_input_per_1m: "1"
    official_output_per_1m: "4"
    official_cache_read_per_1m: "0.2"
    official_cache_write_per_1m: ""
    purchase_discount: "0.75"
    route_enabled: true
```
