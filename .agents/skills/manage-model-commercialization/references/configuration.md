# Configuration reference

Use one YAML file per channel/model commercialization operation.

The following fields are mandatory and never receive defaults: `channel_id`,
`staging_group`, `logical_model`, `upstream_model`, and `purchase_discount`.
Stop and ask the user when any of them is missing. `staging_group` must identify
an isolated internal-test group.

```yaml
channel_id: 14
staging_group: internal-model-test
logical_model: moonshotai/kimi-k3
upstream_model: wb-moonshot/kimi-k3

vendor: Moonshot
icon: Moonshot
description: >-
  Kimi K3 flagship reasoning model; include verified architecture,
  parameter count, modalities and context window here.
tags:
  - 文本
  - 推理
  - 代码
  - 多模态
  - 长上下文
endpoints:
  - openai

official_source_url: https://platform.kimi.ai/docs/pricing/chat-k3
official_input_per_1m: "3"
official_output_per_1m: "15"
official_cache_read_per_1m: "0.3"
official_cache_write_per_1m: ""

purchase_discount: "0.85"
variable_cost_rate: "0.11"
tax_rate: "0.165"
target_margin: "0.03"
minimum_margin: "0.03"
```

## Semantics

- Prices use USD per 1,000,000 tokens.
- The target channel must belong only to `staging_group` during `apply` and
  internal verification. A channel that also belongs to a public group is
  rejected before any write.
- Empty price components are omitted.
- `purchase_discount` multiplies every official component to produce procurement cost.
- Retail price uses the project's `RetailPriceCalculator` and rounds upward to five decimal places.
- `minimum_margin` defaults to `target_margin` when omitted.
- `endpoints` defaults to `openai` when omitted.
- Unknown YAML fields fail validation to catch misspellings.

The retail calculation is:

```text
selling factor = (1 - tax rate) /
  ((1 - variable cost rate) × (1 - tax rate) - target margin)

retail price = round-up-to-5-decimals(purchase price × selling factor)
```

The command rejects a planned retail component that is equal to or greater than its official list-price component.
