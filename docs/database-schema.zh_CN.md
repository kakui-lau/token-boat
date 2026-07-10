# Token Boat / new-api 数据表与字段说明

本文档根据 `model/` 目录下的 GORM 模型和迁移入口整理，方便二次开发时快速理解数据库结构。

迁移入口在 `model/main.go` 的 `migrateDB()` / `migrateDBFast()`，日志库迁移在 `migrateLOGDB()`。主业务库要求兼容 SQLite、MySQL、PostgreSQL；日志库可以是同类 SQL 数据库，也可以是 ClickHouse。

## 总览

核心业务表：

| 表名 | 模型 | 作用 |
|---|---|---|
| `users` | `User` | 用户账号、额度、分组、OAuth 绑定字段、邀请关系 |
| `tokens` | `Token` | 用户 API Key、限额、模型限制、IP 限制 |
| `channels` | `Channel` | 上游供应商渠道配置、密钥、模型列表、权重、优先级 |
| `abilities` | `Ability` | 分组、模型、渠道的可用性索引，用于渠道选择 |
| `logs` | `Log` | 操作日志、消费日志、登录日志、退款日志等 |
| `quota_data` | `QuotaData` | 按小时聚合的用量看板数据 |
| `tasks` | `Task` | 异步任务，视频、图片、Suno 等任务统一记录 |
| `midjourneys` | `Midjourney` | 旧 Midjourney 任务记录 |

配置与元数据表：

| 表名 | 模型 | 作用 |
|---|---|---|
| `options` | `Option` | 系统配置 KV |
| `models` | `Model` | 模型元数据 |
| `vendors` | `Vendor` | 模型供应商元数据 |
| `prefill_groups` | `PrefillGroup` | 预填组选项，用于前端表单快捷填充 |
| `setups` | `Setup` | 初始化状态和版本 |
| `system_instances` | `SystemInstance` | 集群节点心跳 |
| `system_tasks` | `SystemTask` | 系统后台任务记录 |
| `system_task_locks` | `SystemTaskLock` | 系统任务分布式锁 |
| `perf_metrics` | `PerfMetric` | 模型性能聚合指标 |

支付、订阅、兑换：

| 表名 | 模型 | 作用 |
|---|---|---|
| `top_ups` | `TopUp` | 钱包充值订单 |
| `redemptions` | `Redemption` | 兑换码 |
| `subscription_plans` | `SubscriptionPlan` | 订阅套餐 |
| `subscription_orders` | `SubscriptionOrder` | 订阅购买订单 |
| `user_subscriptions` | `UserSubscription` | 用户订阅实例 |
| `subscription_pre_consume_records` | `SubscriptionPreConsumeRecord` | 订阅额度预扣费幂等记录 |
| `checkins` | `Checkin` | 用户每日签到记录 |

认证与权限：

| 表名 | 模型 | 作用 |
|---|---|---|
| `passkey_credentials` | `PasskeyCredential` | WebAuthn / Passkey 凭据 |
| `two_fas` | `TwoFA` | 用户 TOTP 二次验证设置 |
| `two_fa_backup_codes` | `TwoFABackupCode` | 2FA 备用码 |
| `custom_oauth_providers` | `CustomOAuthProvider` | 自定义 OAuth / OIDC 登录源 |
| `user_oauth_bindings` | `UserOAuthBinding` | 用户与自定义 OAuth 账号绑定 |
| `casbin_rule` | `CasbinRule` | Casbin 权限规则 |
| `authz_roles` | `AuthzRole` | 后台权限角色 |

## 关系速览

```text
users.id
  -> tokens.user_id
  -> logs.user_id
  -> quota_data.user_id
  -> tasks.user_id
  -> midjourneys.user_id
  -> top_ups.user_id
  -> redemptions.user_id / redemptions.used_user_id
  -> subscription_orders.user_id
  -> user_subscriptions.user_id
  -> subscription_pre_consume_records.user_id
  -> passkey_credentials.user_id
  -> two_fas.user_id
  -> two_fa_backup_codes.user_id
  -> user_oauth_bindings.user_id
  -> checkins.user_id
```

```text
channels.id
  -> abilities.channel_id
  -> logs.channel
  -> quota_data.channel_id
  -> tasks.channel_id
  -> midjourneys.channel_id
```

```text
subscription_plans.id
  -> subscription_orders.plan_id
  -> user_subscriptions.plan_id
```

```text
user_subscriptions.id
  -> subscription_pre_consume_records.user_subscription_id
```

```text
custom_oauth_providers.id
  -> user_oauth_bindings.provider_id
```

## users

用户主表。

| 字段 | 说明 |
|---|---|
| `id` | 用户 ID，主键。 |
| `username` | 登录用户名，唯一索引。 |
| `password` | 密码哈希。 |
| `display_name` | 展示名称。 |
| `role` | 用户角色，通常区分管理员和普通用户。 |
| `status` | 用户状态，启用或禁用。 |
| `email` | 邮箱。 |
| `github_id` | GitHub OAuth 用户 ID。 |
| `discord_id` | Discord OAuth 用户 ID。 |
| `oidc_id` | OIDC 用户 ID。 |
| `wechat_id` | 微信用户 ID。 |
| `telegram_id` | Telegram 用户 ID。 |
| `linux_do_id` | Linux DO OAuth 用户 ID。 |
| `access_token` | 管理接口访问 token，敏感字段，不返回前端。 |
| `quota` | 用户当前钱包额度。 |
| `used_quota` | 用户历史已用额度。 |
| `request_count` | 请求次数统计。 |
| `group` | 用户所属分组，影响模型权限、倍率和渠道选择。 |
| `aff_code` | 邀请码。 |
| `aff_count` | 邀请人数。 |
| `aff_quota` | 邀请奖励剩余额度。 |
| `aff_history` | 邀请奖励历史额度，Go 字段为 `AffHistoryQuota`。 |
| `inviter_id` | 邀请人用户 ID。 |
| `setting` | 用户个人设置 JSON。 |
| `remark` | 管理员备注。 |
| `stripe_customer` | Stripe Customer ID。 |
| `created_at` | 创建时间。 |
| `last_login_at` | 最近登录时间。 |
| `deleted_at` | 软删除时间。 |

非持久化字段：

| 字段 | 说明 |
|---|---|
| `original_password` | 修改密码时校验原密码，不入库。 |
| `verification_code` | 邮箱验证码，不入库。 |
| `admin_permissions` | 返回给前端的权限聚合结果，不入库。 |

## tokens

用户 API Key 表。

| 字段 | 说明 |
|---|---|
| `id` | Token ID，主键。 |
| `user_id` | 所属用户 ID。 |
| `key` | API Key，唯一索引。 |
| `status` | Token 状态，启用或禁用。 |
| `name` | Token 名称。 |
| `created_time` | 创建时间。 |
| `accessed_time` | 最近访问时间。 |
| `expired_time` | 过期时间，`-1` 表示永不过期。 |
| `remain_quota` | Token 剩余额度。 |
| `unlimited_quota` | 是否不限额度。 |
| `model_limits_enabled` | 是否启用模型限制。 |
| `model_limits` | 允许模型列表或限制配置，文本格式。 |
| `allow_ips` | IP 白名单，通常按行保存。 |
| `used_quota` | Token 已用额度。 |
| `group` | Token 使用的分组。 |
| `cross_group_retry` | auto 分组下是否允许跨分组重试。 |
| `deleted_at` | 软删除时间。 |

## channels

上游渠道配置表，是模型转发链路的核心表。

| 字段 | 说明 |
|---|---|
| `id` | 渠道 ID，主键。 |
| `type` | 渠道类型，见 `constant/channel.go`。 |
| `key` | 上游 API Key；多 key 模式下可包含多行。 |
| `open_ai_organization` | OpenAI organization，可选。 |
| `test_model` | 渠道测试使用的模型。 |
| `status` | 渠道状态。 |
| `name` | 渠道名称。 |
| `weight` | 渠道选择权重。 |
| `created_time` | 创建时间。 |
| `test_time` | 最近测试时间。 |
| `response_time` | 最近测试响应时间，毫秒。 |
| `base_url` | 上游接口 Base URL。 |
| `other` | 历史扩展字段。 |
| `balance` | 上游余额，通常按 USD 展示。 |
| `balance_updated_time` | 余额更新时间。 |
| `models` | 渠道支持的模型列表。 |
| `group` | 渠道可服务的分组，常见为逗号分隔。 |
| `used_quota` | 渠道累计消耗额度。 |
| `model_mapping` | 模型映射 JSON，例如本地模型名到上游模型名。 |
| `status_code_mapping` | 上游状态码映射配置。 |
| `priority` | 渠道优先级，渠道选择时优先级越高越先用。 |
| `auto_ban` | 是否自动禁用异常渠道。 |
| `other_info` | 历史扩展信息。 |
| `tag` | 标签，用于筛选、归类或渠道亲和。 |
| `setting` | 渠道额外设置 JSON。 |
| `param_override` | 请求参数覆盖 JSON。 |
| `header_override` | 请求头覆盖 JSON。 |
| `remark` | 管理员备注。 |
| `channel_info` | 多 key 状态 JSON，结构见下方。 |
| `settings` | 其他设置 JSON，Go 字段为 `OtherSettings`。 |

`channel_info` 内部字段：

| 字段 | 说明 |
|---|---|
| `is_multi_key` | 是否多 key 模式。 |
| `multi_key_size` | key 数量。 |
| `multi_key_status_list` | key 索引到状态的映射。 |
| `multi_key_disabled_reason` | key 禁用原因。 |
| `multi_key_disabled_time` | key 禁用时间。 |
| `multi_key_polling_index` | 轮询模式下当前 key 索引。 |
| `multi_key_mode` | 多 key 选择模式。 |

非持久化字段：

| 字段 | 说明 |
|---|---|
| `keys` | 运行时拆分后的 key 列表，不入库。 |

## abilities

模型、分组、渠道之间的可用性索引表。渠道选择时主要查这张表。

复合主键：`group` + `model` + `channel_id`。

| 字段 | 说明 |
|---|---|
| `group` | 用户分组。 |
| `model` | 模型名。 |
| `channel_id` | 渠道 ID。 |
| `enabled` | 该分组、模型、渠道组合是否可用。 |
| `priority` | 优先级，越高越先选。 |
| `weight` | 同优先级下的随机权重。 |
| `tag` | 标签，通常来自渠道标签。 |

## logs

日志表。主业务库会迁移一份 `logs`，日志库也会迁移 `logs`；实际写入使用 `LOG_DB`。

日志类型：

| 值 | 类型 |
|---:|---|
| 0 | Unknown |
| 1 | Topup |
| 2 | Consume |
| 3 | Manage |
| 4 | System |
| 5 | Error |
| 6 | Refund |
| 7 | Login |

字段：

| 字段 | 说明 |
|---|---|
| `id` | 日志 ID。ClickHouse 下前端展示 ID 可能由分页位置计算。 |
| `user_id` | 用户 ID。 |
| `created_at` | 创建时间。 |
| `type` | 日志类型。 |
| `content` | 日志内容。 |
| `username` | 用户名快照。 |
| `token_name` | Token 名称快照。 |
| `model_name` | 模型名。 |
| `quota` | 本次消耗或变动额度。 |
| `prompt_tokens` | 输入 token 数。 |
| `completion_tokens` | 输出 token 数。 |
| `use_time` | 请求耗时，通常为毫秒。 |
| `is_stream` | 是否流式请求。 |
| `channel` | 渠道 ID，Go 字段为 `ChannelId`。 |
| `token_id` | Token ID。 |
| `group` | 使用分组。 |
| `ip` | 客户端 IP。 |
| `request_id` | 本系统请求 ID。 |
| `upstream_request_id` | 上游请求 ID。 |
| `other` | 扩展 JSON，可能包含倍率、错误、管理员调试信息等。 |

只读/查询辅助字段：

| 字段 | 说明 |
|---|---|
| `channel_name` | 查询时联表得到的渠道名称，不写入本表。 |

## quota_data

用量看板聚合表，按小时聚合。数据来源通常是消费日志落库时缓存聚合后批量写入。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `user_id` | 用户 ID。 |
| `username` | 用户名快照。 |
| `model_name` | 模型名。 |
| `created_at` | 小时桶时间戳。 |
| `use_group` | 使用分组。 |
| `token_id` | Token ID。 |
| `channel_id` | 渠道 ID。 |
| `node_name` | 节点名称。 |
| `token_used` | 输入 + 输出 token 聚合。 |
| `count` | 请求次数。 |
| `quota` | 消耗额度。 |

## tasks

统一异步任务表，用于视频、音乐、图片或其他需要轮询的任务。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `created_at` | 创建时间。 |
| `updated_at` | 更新时间。 |
| `task_id` | 对外任务 ID 或第三方任务 ID。新任务通常为 `task_xxx`。 |
| `platform` | 任务平台，通常是渠道类型或平台名。 |
| `user_id` | 用户 ID。 |
| `group` | 使用分组，用于计费修正。 |
| `channel_id` | 渠道 ID。 |
| `quota` | 预扣或最终消耗额度。 |
| `action` | 任务类型，如 video、song、lyrics 等。 |
| `status` | 任务状态。 |
| `fail_reason` | 失败原因；历史数据中也可能保存结果 URL。 |
| `submit_time` | 提交时间。 |
| `start_time` | 开始处理时间。 |
| `finish_time` | 完成时间。 |
| `progress` | 进度，如 `0%`、`100%`。 |
| `properties` | 公开属性 JSON，包含输入、模型名等。 |
| `private_data` | 内部私有数据 JSON，包含上游任务 ID、密钥、计费上下文等。 |
| `data` | 任务结果或原始上游数据 JSON。 |

`properties` 内部字段：

| 字段 | 说明 |
|---|---|
| `input` | 用户输入或提示词摘要。 |
| `upstream_model_name` | 上游模型名。 |
| `origin_model_name` | 原始请求模型名。 |

`private_data` 内部字段：

| 字段 | 说明 |
|---|---|
| `key` | 特殊 provider 轮询所需密钥。 |
| `upstream_task_id` | 上游真实任务 ID。 |
| `result_url` | 成功后的结果 URL。 |
| `billing_source` | 计费来源，`wallet` 或 `subscription`。 |
| `subscription_id` | 订阅 ID。 |
| `token_id` | Token ID。 |
| `node_name` | 发起任务的节点名。 |
| `billing_context` | 计费参数快照。 |

## midjourneys

旧 Midjourney 任务表。新异步任务逐步迁移到 `tasks`。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `code` | 上游返回码或业务码。 |
| `user_id` | 用户 ID。 |
| `action` | MJ 动作，如 imagine、upscale、variation。 |
| `mj_id` | Midjourney 任务 ID。 |
| `prompt` | 原始提示词。 |
| `prompt_en` | 英文提示词。 |
| `description` | 描述信息。 |
| `state` | 状态透传字段。 |
| `submit_time` | 提交时间。 |
| `start_time` | 开始时间。 |
| `finish_time` | 完成时间。 |
| `image_url` | 图片 URL。 |
| `video_url` | 视频 URL。 |
| `video_urls` | 多视频 URL。 |
| `status` | 任务状态。 |
| `progress` | 进度。 |
| `fail_reason` | 失败原因。 |
| `channel_id` | 渠道 ID。 |
| `quota` | 消耗额度。 |
| `buttons` | MJ 操作按钮 JSON。 |
| `properties` | 扩展属性 JSON。 |

## options

系统配置 KV 表。

| 字段 | 说明 |
|---|---|
| `key` | 配置名，主键。 |
| `value` | 配置值，字符串保存。复杂配置通常保存 JSON 字符串。 |

常见配置包括系统名称、Logo、登录注册开关、OAuth、SMTP、支付、倍率、模型配置、性能配置、任务开关等。代码启动时会把配置加载到内存配置对象。

## models

模型元数据表，用于模型广场、价格页、模型管理等。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `model_name` | 模型名，软删除维度下唯一。 |
| `description` | 模型描述。 |
| `icon` | 图标名。 |
| `tags` | 标签字符串。 |
| `vendor_id` | 供应商 ID，关联 `vendors.id`。 |
| `endpoints` | 支持端点列表或端点配置，文本保存。 |
| `status` | 状态，通常 1 表示启用。 |
| `sync_official` | 是否跟随官方模型同步。 |
| `created_time` | 创建时间。 |
| `updated_time` | 更新时间。 |
| `deleted_at` | 软删除时间。 |
| `name_rule` | 模型匹配规则：精确、前缀、包含、后缀。 |

非持久化字段：

| 字段 | 说明 |
|---|---|
| `bound_channels` | 返回给前端的绑定渠道摘要。 |
| `enable_groups` | 返回给前端的启用分组。 |
| `quota_types` | 返回给前端的计费类型。 |
| `matched_models` | 按规则匹配出的模型名。 |
| `matched_count` | 匹配数量。 |

## vendors

供应商元数据表。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `name` | 供应商名称，软删除维度下唯一。 |
| `description` | 描述。 |
| `icon` | 图标名，前端用于渲染供应商图标。 |
| `status` | 状态。 |
| `created_time` | 创建时间。 |
| `updated_time` | 更新时间。 |
| `deleted_at` | 软删除时间。 |

## prefill_groups

表单预填组表。用于后台批量或快捷填充模型、渠道、选项等数据。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `name` | 预填组名称，未删除数据中唯一。 |
| `type` | 预填类型。 |
| `items` | 预填项 JSON。 |
| `description` | 描述。 |
| `created_time` | 创建时间。 |
| `updated_time` | 更新时间。 |
| `deleted_at` | 软删除时间。 |

## setups

系统初始化状态表。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `version` | 初始化时的系统版本。 |
| `initialized_at` | 初始化时间。 |

## perf_metrics

性能指标聚合表，用于模型广场或性能统计。按模型、分组、时间桶唯一。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `model_name` | 模型名。 |
| `group` | 分组。 |
| `bucket_ts` | 时间桶时间戳。 |
| `request_count` | 请求总数。 |
| `success_count` | 成功请求数。 |
| `total_latency_ms` | 总延迟毫秒数。 |
| `ttft_sum_ms` | 首 token 延迟总和。 |
| `ttft_count` | 有 TTFT 统计的请求数。 |
| `output_tokens` | 输出 token 总数。 |
| `generation_ms` | 生成耗时总和。 |

## system_instances

集群节点心跳表。

| 字段 | 说明 |
|---|---|
| `node_name` | 节点名称，主键。 |
| `info` | 节点信息 JSON。 |
| `started_at` | 节点启动时间。 |
| `last_seen_at` | 最近心跳时间。 |
| `created_at` | 创建时间。 |
| `updated_at` | 更新时间。 |

## system_tasks

系统后台任务表，例如日志清理、渠道测试、模型更新、任务轮询。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `task_id` | 系统任务 ID，唯一。 |
| `type` | 任务类型，如 `log_cleanup`、`channel_test`、`model_update`。 |
| `status` | 任务状态：pending、running、succeeded、failed。 |
| `active_key` | 活跃任务唯一 key，用于避免同类任务重复运行。 |
| `payload` | 任务输入 JSON。 |
| `state` | 任务执行中状态 JSON。 |
| `result` | 执行结果 JSON。 |
| `error` | 错误信息。 |
| `locked_by` | 当前持锁节点。 |
| `created_at` | 创建时间。 |
| `updated_at` | 更新时间。 |

## system_task_locks

系统任务锁表，用于多节点场景下的任务互斥。

| 字段 | 说明 |
|---|---|
| `type` | 锁类型，主键。 |
| `task_id` | 当前锁关联的任务 ID。 |
| `locked_by` | 持锁节点。 |
| `locked_until` | 锁过期时间。 |
| `updated_at` | 更新时间。 |

## top_ups

钱包充值订单表。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `user_id` | 用户 ID。 |
| `amount` | 到账额度。 |
| `money` | 支付金额。 |
| `trade_no` | 交易单号，唯一。 |
| `payment_method` | 支付方式，如 stripe、creem、waffo、balance。 |
| `payment_provider` | 支付提供方，如 epay、stripe、creem、waffo。 |
| `create_time` | 创建时间。 |
| `complete_time` | 完成时间。 |
| `status` | 订单状态。 |

## redemptions

兑换码表。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `user_id` | 创建兑换码的用户或管理员 ID。 |
| `key` | 兑换码，唯一。 |
| `status` | 状态。 |
| `name` | 兑换码名称。 |
| `quota` | 兑换额度。 |
| `created_time` | 创建时间。 |
| `redeemed_time` | 兑换时间。 |
| `used_user_id` | 使用该兑换码的用户 ID。 |
| `expired_time` | 过期时间，0 表示不过期。 |
| `deleted_at` | 软删除时间。 |

非持久化字段：

| 字段 | 说明 |
|---|---|
| `count` | 批量创建时的请求参数，不入库。 |

## checkins

签到记录表。

唯一键：`user_id` + `checkin_date`。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `user_id` | 用户 ID。 |
| `checkin_date` | 签到日期，格式 `YYYY-MM-DD`。 |
| `quota_awarded` | 本次签到奖励额度。 |
| `created_at` | 创建时间。 |

## subscription_plans

订阅套餐表。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `title` | 套餐标题。 |
| `subtitle` | 套餐副标题。 |
| `price_amount` | 展示价格。 |
| `currency` | 币种，默认 USD。 |
| `duration_unit` | 周期单位，如 day、month、year、custom。 |
| `duration_value` | 周期数量。 |
| `custom_seconds` | 自定义周期秒数。 |
| `enabled` | 是否启用。 |
| `sort_order` | 展示排序。 |
| `allow_balance_pay` | 是否允许余额购买。 |
| `allow_wallet_overflow` | 订阅额度用尽后是否允许钱包兜底。 |
| `stripe_price_id` | Stripe Price ID。 |
| `creem_product_id` | Creem Product ID。 |
| `waffo_pancake_product_id` | Waffo Pancake Product ID。 |
| `max_purchase_per_user` | 每个用户最大购买次数，0 表示不限。 |
| `upgrade_group` | 购买后升级到的用户分组。 |
| `downgrade_group` | 到期后降级到的分组；为空则回到购买前分组。 |
| `total_amount` | 套餐总额度，0 表示不限。 |
| `quota_reset_period` | 额度重置周期。 |
| `quota_reset_custom_seconds` | 自定义重置周期秒数。 |
| `created_at` | 创建时间。 |
| `updated_at` | 更新时间。 |

## subscription_orders

订阅订单表。支付完成后通常创建或续期 `user_subscriptions`。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `user_id` | 用户 ID。 |
| `plan_id` | 订阅套餐 ID。 |
| `money` | 支付金额。 |
| `trade_no` | 交易单号，唯一。 |
| `payment_method` | 支付方式。 |
| `payment_provider` | 支付提供方。 |
| `status` | 订单状态。 |
| `create_time` | 创建时间。 |
| `complete_time` | 完成时间。 |
| `provider_payload` | 支付提供方回调或扩展数据。 |

## user_subscriptions

用户订阅实例表。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `user_id` | 用户 ID。 |
| `plan_id` | 套餐 ID。 |
| `amount_total` | 本订阅周期总额度，0 表示不限。 |
| `amount_used` | 已使用额度。 |
| `start_time` | 生效时间。 |
| `end_time` | 到期时间。 |
| `status` | 订阅状态：active、expired、cancelled。 |
| `source` | 来源，order 或 admin。 |
| `last_reset_time` | 上次额度重置时间。 |
| `next_reset_time` | 下次额度重置时间。 |
| `upgrade_group` | 订阅生效时升级到的分组。 |
| `prev_user_group` | 购买前用户分组。 |
| `downgrade_group` | 到期后目标分组。 |
| `allow_wallet_overflow` | 订阅额度不足时是否允许钱包扣费。 |
| `created_at` | 创建时间。 |
| `updated_at` | 更新时间。 |

## subscription_pre_consume_records

订阅额度预扣费幂等表，避免同一请求重复扣订阅额度。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `request_id` | 请求 ID，唯一。 |
| `user_id` | 用户 ID。 |
| `user_subscription_id` | 用户订阅 ID。 |
| `pre_consumed` | 预扣额度。 |
| `status` | 状态，consumed 或 refunded。 |
| `created_at` | 创建时间。 |
| `updated_at` | 更新时间。 |

## passkey_credentials

Passkey / WebAuthn 凭据表。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `user_id` | 用户 ID，目前唯一，即每个用户一条 passkey 凭据。 |
| `credential_id` | WebAuthn Credential ID，base64 保存，唯一。 |
| `public_key` | 公钥，base64 保存。 |
| `attestation_type` | attestation 类型。 |
| `aaguid` | Authenticator AAGUID，base64 保存。 |
| `sign_count` | 签名计数器。 |
| `clone_warning` | 是否检测到克隆风险。 |
| `user_present` | WebAuthn user present 标志。 |
| `user_verified` | WebAuthn user verified 标志。 |
| `backup_eligible` | 是否支持备份。 |
| `backup_state` | 是否处于备份状态。 |
| `transports` | 支持的 transport JSON。 |
| `attachment` | authenticator attachment。 |
| `last_used_at` | 最近使用时间。 |
| `created_at` | 创建时间。 |
| `updated_at` | 更新时间。 |
| `deleted_at` | 软删除时间。 |

## two_fas

用户 TOTP 二次验证设置表。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `user_id` | 用户 ID，唯一。 |
| `secret` | TOTP 密钥，敏感字段。 |
| `is_enabled` | 是否启用 2FA。 |
| `failed_attempts` | 连续失败次数。 |
| `locked_until` | 锁定截止时间。 |
| `last_used_at` | 最近使用时间。 |
| `created_at` | 创建时间。 |
| `updated_at` | 更新时间。 |
| `deleted_at` | 软删除时间。 |

## two_fa_backup_codes

2FA 备用码表。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `user_id` | 用户 ID。 |
| `code_hash` | 备用码哈希，敏感字段。 |
| `is_used` | 是否已使用。 |
| `used_at` | 使用时间。 |
| `created_at` | 创建时间。 |
| `deleted_at` | 软删除时间。 |

## custom_oauth_providers

自定义 OAuth / OIDC 登录源配置表。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `name` | 展示名称。 |
| `slug` | URL 标识，唯一，例如 `github-enterprise`。 |
| `icon` | 图标名。 |
| `enabled` | 是否启用。 |
| `client_id` | OAuth Client ID。 |
| `client_secret` | OAuth Client Secret，敏感字段。 |
| `authorization_endpoint` | 授权地址。 |
| `token_endpoint` | token 交换地址。 |
| `user_info_endpoint` | 用户信息地址。 |
| `scopes` | OAuth scopes。 |
| `user_id_field` | 从用户信息 JSON 中读取用户 ID 的字段路径。 |
| `username_field` | 读取用户名的字段路径。 |
| `display_name_field` | 读取展示名的字段路径。 |
| `email_field` | 读取邮箱的字段路径。 |
| `well_known` | OIDC discovery 地址。 |
| `auth_style` | token 请求认证方式：0 自动、1 参数、2 Basic Header。 |
| `access_policy` | 登录访问控制策略 JSON。 |
| `access_denied_message` | 拒绝访问时的提示模板。 |
| `created_at` | 创建时间。 |
| `updated_at` | 更新时间。 |

## user_oauth_bindings

用户与自定义 OAuth 账号的绑定关系。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `user_id` | 本系统用户 ID。 |
| `provider_id` | 自定义 OAuth provider ID。 |
| `provider_user_id` | 第三方用户 ID。 |
| `created_at` | 创建时间。 |

唯一性：

| 约束 | 说明 |
|---|---|
| `user_id + provider_id` | 一个用户在同一个 provider 下只能绑定一次。 |
| `provider_id + provider_user_id` | 一个第三方账号只能绑定到一个本系统用户。 |

## casbin_rule

Casbin 权限规则表。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `ptype` | 规则类型，例如 `p`、`g`。 |
| `v0` | Casbin 规则字段 0。 |
| `v1` | Casbin 规则字段 1。 |
| `v2` | Casbin 规则字段 2。 |
| `v3` | Casbin 规则字段 3。 |
| `v4` | Casbin 规则字段 4。 |
| `v5` | Casbin 规则字段 5。 |

## authz_roles

后台权限角色表。

| 字段 | 说明 |
|---|---|
| `id` | 主键。 |
| `key` | 角色 key，唯一。 |
| `name` | 角色名称。 |
| `description` | 描述。 |
| `built_in` | 是否内置角色。 |
| `enabled` | 是否启用。 |
| `sort` | 排序。 |
| `created_at` | 创建时间。 |
| `updated_at` | 更新时间。 |

## ClickHouse logs 表

当日志库使用 ClickHouse 时，`logs` 表由 `clickHouseLogCreateTableSQL()` 创建。字段与 GORM `Log` 基本一致，但类型按 ClickHouse 优化：

| 字段 | 说明 |
|---|---|
| `id` | UInt32，兼容字段。 |
| `user_id` | 用户 ID。 |
| `created_at` | 创建时间戳。 |
| `type` | 日志类型。 |
| `content` | 日志内容。 |
| `username` | 用户名。 |
| `token_name` | Token 名称。 |
| `model_name` | 模型名。 |
| `quota` | 额度。 |
| `prompt_tokens` | 输入 token。 |
| `completion_tokens` | 输出 token。 |
| `use_time` | 耗时。 |
| `is_stream` | 是否流式。 |
| `channel` | 渠道 ID。 |
| `token_id` | Token ID。 |
| `group` | 分组。 |
| `ip` | IP。 |
| `request_id` | 请求 ID。 |
| `upstream_request_id` | 上游请求 ID。 |
| `other` | 扩展 JSON。 |

如果设置 `LOG_SQL_CLICKHOUSE_TTL_DAYS`，ClickHouse 表会配置 TTL 自动清理旧日志。

## 二次开发注意事项

1. 新增业务表时，把模型加入 `migrateDB()` 和 `migrateDBFast()`。
2. 新增日志字段时，需要同时考虑普通 SQL 日志表和 ClickHouse 建表 SQL。
3. 金额、额度、token 统计字段要注意单位：`quota` 是系统额度单位，不等于货币金额。
4. `group`、`key` 等保留字字段写 raw SQL 时要使用项目已有的兼容列名变量。
5. JSON 字段在业务代码中 marshal/unmarshal 必须使用 `common/json.go` 中的封装函数。
6. 数据库改动必须同时兼容 SQLite、MySQL、PostgreSQL。
7. GORM `gorm:"-"`、`gorm:"-:all"`、`gorm:"->"` 字段不是普通持久化字段，不能按数据库字段使用。

