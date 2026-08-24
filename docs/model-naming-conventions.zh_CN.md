# TokenBoat 模型命名与配置一致性规范

本文规定 TokenBoat 平台公开模型名称、渠道上游模型映射、模型元数据和定价配置的维护方式。目标是让客户端调用名称长期稳定，同时允许不同上游渠道使用各自的内部模型 ID。

## 1. 核心原则

1. **公开名称稳定**：用户请求中的 `model` 是平台 API 合约，发布后不得随意修改。
2. **上游差异通过映射解决**：渠道实际模型 ID 写入 `model_mapping`，不得直接暴露为新的平台模型。
3. **同一模型只保留一个公开名称**：不同渠道提供相同模型时，必须共享同一个平台名称。
4. **名称与计费键一致**：渠道、路由能力、模型元数据和定价配置必须使用相同的公开名称。
5. **以 OpenRouter ID 为标准**：OpenRouter 已收录的模型统一使用其 `provider/model` ID；渠道实际 ID 一律通过映射适配。
6. **历史名称兼容迁移**：已经被客户调用的名称不得直接删除，应先增加新名称和映射，经过兼容期后再下线旧名称。

## 2. 公开模型名称格式

推荐字符范围：

```text
[a-z0-9][a-z0-9._:/-]*
```

标准格式与 OpenRouter 一致：

```text
provider/model-version-variant
```

示例：

```text
bytedance/seedance-2.0
bytedance/seedance-2.0-fast
deepseek/deepseek-v4-pro
qwen/qwen3.7-max
tencent/hy3
tencent/hy3:free
openai/gpt-5.5
```

只有 OpenRouter 尚未收录、且平台必须直接提供的模型，才允许临时使用厂商官方 ID。模型被 OpenRouter 收录后，应按兼容迁移流程统一名称。

渠道是 OpenAI、火山方舟还是第三方代理不影响公开名称；公开名称描述模型归属，不描述请求经过的渠道。

### 2.1 必须遵守

- 使用小写字母；官方 ID 中确实区分大小写的部分只保留在上游映射值中。
- 单词和变体使用 `-`，不要使用空格或下划线。
- 保留明确版本号，例如 `seedance-2.0`。
- `fast`、`pro`、`mini`、`max`、`preview` 等变体放在名称末尾。
- OpenRouter 的 `:free` 等标准变体后缀必须原样保留。
- 不得把渠道名称、渠道 ID、账号、地区、价格或内部项目名写入公开名称。

### 2.2 不推荐

```text
Seedance 2.0
seedance2
doubao-seedance-2-0-260128
glm_5_2
Anitix-Seedance
model-12-cheap
```

这些名称应作为渠道上游 ID 或历史别名存在，而不是平台公开名称。

## 3. 平台名称与上游名称映射

渠道的 `models` 保存平台公开名称，`model_mapping` 保存“平台名称到上游名称”的映射。

示例：

```json
{
  "bytedance/seedance-2.0": "doubao-seedance-2-0-260128",
  "bytedance/seedance-2.0-fast": "doubao-seedance-2-0-fast-260128"
}
```

另一个渠道可以映射到不同上游 ID：

```json
{
  "bytedance/seedance-2.0": "seedance2",
  "bytedance/seedance-2.0-fast": "seedance2-fast"
}
```

客户端始终请求公开名称。不得因为增加一个新渠道就创建新的公开名称。

## 4. 模型数据分布

模型配置涉及多个数据源，不能只修改 `models` 表。

| 数据源 | 作用 | 名称要求 |
| --- | --- | --- |
| `channels.models` | 渠道支持的平台模型列表 | 使用公开名称 |
| `channels.model_mapping` | 平台名称到上游 ID 的映射 | Key 使用公开名称，Value 使用上游 ID |
| `abilities.model` | 模型、渠道和分组的路由能力 | 使用公开名称 |
| `models.model_name` | 模型广场元数据 | 使用公开名称 |
| `models.vendor_id` | 模型厂商和图标归属 | 必须关联正确厂商 |
| `official_model_price_versions` | 官方价格版本 | 使用公开模型 ID |
| `channel_model_purchase_price_versions` | 渠道采购价格版本 | 关联渠道模型 |
| `sales_price_books` / `sales_price_book_items` | 对外报价版本和模型销售表达式 | 使用公开模型 ID |
| `sales_price_book_bindings` | 用户或默认报价绑定 | 关联报价版本 |

旧版 `options` 模型价格、倍率和计费表达式已停用并会在迁移时删除。分组配置只负责访问范围和自动路由，不再改变销售报价。

## 5. 模型元数据规范

每个公开模型都应在 `models` 中有一条精确匹配的元数据：

- `model_name`：公开模型名称。
- `vendor_id`：实际模型厂商，不是代理商或渠道供应商。
- `description`：简洁说明模型能力，不写营销价格和渠道信息。
- `icon`：优先使用对应厂商图标。
- `tags`：使用稳定能力标签，例如“文本”“推理”“视频生成”。
- `endpoints`：填写平台实际支持的端点。
- `status`：只有准备公开展示的模型才启用。
- `sync_official`：手工维护的业务模型建议关闭自动覆盖。

免费版本与付费版本如果是两个真实可调用的上游 ID，可以分别保留，例如 `tencent/hy3` 和 `tencent/hy3:free`。

## 6. 新增模型流程

1. 确认平台公开名称和上游实际模型 ID。
2. 在渠道 `models` 中增加公开名称。
3. 上游 ID 不同时增加 `model_mapping`。
4. 重建或同步 `abilities`。
5. 创建 `models` 元数据并绑定厂商。
6. 配置模型价格、补全倍率、缓存倍率和计费模式。
7. 检查所有用户分组是否符合预期。
8. 使用真实请求验证渠道选择、上游模型和计费日志。
9. 检查 `/api/pricing` 与模型广场展示。

视频等异步任务模型还必须验证：

- 创建任务端点和查询任务端点；
- 模型映射是否同时作用于创建和查询流程；
- 时长、分辨率等计费参数；
- `billing_mode` 与 `billing_expr`。

## 7. 重命名和去重流程

模型重命名属于 API 兼容性变更，不得只修改模型广场。

### 7.1 尚未公开使用

可以在同一事务中直接更新：

1. `channels.models`；
2. `channels.model_mapping` 的 Key；
3. `abilities.model`；
4. `models.model_name`；
5. 所有定价 JSON 的 Key。

### 7.2 已经有客户调用

使用兼容期迁移：

1. 增加新的规范名称；
2. 保留旧名称，并将新旧名称映射到同一个上游 ID；
3. 为新名称复制正确的定价配置；
4. 公告旧名称的下线日期；
5. 从日志确认旧名称已无调用；
6. 删除旧渠道名称、能力记录、元数据和定价键。

不得把旧名称直接映射到不同模型，也不得让新旧名称使用不同价格却指向同一上游模型。

## 8. 删除模型流程

删除模型前必须先确认近期调用日志和客户使用情况。

1. 从启用渠道的 `models` 中移除。
2. 禁用或删除对应 `abilities`。
3. 将 `models.status` 设为停用。
4. 确认模型广场不再展示。
5. 经过保留期后清理自定义定价键。
6. 最后再软删除模型元数据。

不要机械删除 `ModelRatio` 中所有未启用模型。new-api 会保存大量内置默认倍率，这些配置可能在升级或重置时重新生成。只清理能够确认是 TokenBoat 历史别名或自定义残留的项目。

## 9. 修改后的检查清单

- [ ] 所有启用渠道的模型名称符合规范。
- [ ] 同一实际模型没有多个公开名称。
- [ ] `model_mapping` 的 Key 都存在于渠道 `models`。
- [ ] `abilities` 不包含已删除的历史名称。
- [ ] 每个公开模型都有唯一的 `models` 元数据。
- [ ] 每个模型绑定正确厂商。
- [ ] 所有定价配置使用公开名称。
- [ ] `billing_mode` 和 `billing_expr` 成对、有效。
- [ ] `/api/pricing` 没有重复项。
- [ ] 模型广场价格与后台配置一致。
- [ ] 实际调用日志中的平台模型、上游模型和渠道符合预期。
- [ ] 多实例部署已完成配置同步和定价缓存失效。

## 10. 当前平台公开名称

截至 2026-07-24，TokenBoat 使用以下公开名称：

```text
bytedance/seedance-2.0
bytedance/seedance-2.0-fast
bytedance/seedance-2.0-upscale
bytedance/seedance-2.0-fast-upscale
deepseek/deepseek-v4-flash
deepseek/deepseek-v4-pro
openai/gpt-5.4
openai/gpt-5.4-mini
openai/gpt-5.4-nano
openai/gpt-5.5
openai/gpt-5.6-luna
openai/gpt-5.6-sol
openai/gpt-5.6-terra
minimax/minimax-m3
qwen/qwen3.7-max
qwen/qwen3.7-plus
tencent/hy3
tencent/hy3:free
xiaomi/mimo-v2.5
z-ai/glm-5.1
z-ai/glm-5.2
```

新增或下线公开模型后，应同步更新本节。

## 11. 生产环境操作要求

- 修改前导出受影响的渠道、能力、元数据、厂商和定价配置。
- 数据库整理必须使用事务。
- 不得在备份、日志或文档中保存渠道 API Key。
- 停用渠道的名称整理不得改变其停用状态。
- 直接修改数据库后，需要等待各实例同步渠道和配置缓存，或通过应用提供的同步机制主动刷新。
- 修改完成后同时验证数据库状态、`/api/pricing` 和一次真实模型请求。
