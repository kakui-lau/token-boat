# TokenBoat 重要定制记录

本文记录 TokenBoat 相对上游 `QuantumNous/new-api` 的重要业务定制。同步上游、处理冲突或重构前，应先核对本文。

最后更新：2026-07-23

## 单前端架构

- 已跟随上游迁移为唯一前端目录 `web/`，不再维护 `web/default`、`web/classic`、`web/tokenboat` 三套副本。
- 认证体系采用上游无状态 Token 与会话控制实现。
- TokenBoat 作为默认品牌层保留在统一前端中，包括主题预设、品牌配色、Logo、首页、控制台背景、关于页和 Footer。
- 后端只提供 `theme.frontend=default`；浅色、深色、颜色预设、字体和圆角仍由前端视觉主题系统控制。

## OpenRouter 视频生成

核心提交：`d30636e6`。

- OpenRouter 异步视频任务适配器，覆盖生成、轮询、状态转换和结果回传。
- 支持 Seedance 2.0，并以通用协议兼容其他 OpenRouter 视频模型。
- 视频端点、渠道测试、任务 Relay、结果代理和模型倍率支持。
- 视频时长、分辨率、分组倍率、预扣费和最终结算链路。
- 模型价格管理提供 Seedance 720p 每秒客户价格配置。

修改视频能力时必须同时检查：

1. `common/endpoint_type.go` 与 `common/endpoint_defaults.go`
2. `controller/channel-test.go` 与 `controller/relay.go`
3. `relay/channel/task/openrouter/`
4. `relay/relay_task.go` 与 `relay/common/relay_info.go`
5. `model/task.go`
6. `service/task_billing.go` 与 `service/task_polling.go`
7. `setting/ratio_setting/`
8. `web/src/features/system-settings/models/` 与全部语言文件

## TokenBoat 业务页面

- `/terms`
- `/privacy`
- `/refund`
- `/getting-started`
- `/wiki/features-introduction/`
- `/support/community-interaction`

通用 Footer 在所有页面展示上述业务、法务和支持入口。页面内容不是默认占位模板，覆盖平台服务、API Key 安全、计费退款、可用性、滥用限制和数据处理等业务场景。

## 品牌与国际化

- 默认系统名称：Token Boat。
- 默认 Logo：`/logo.png?v=token-boat`。
- 默认视觉预设：`token-boat`。
- 支持 `en`、`zh`、`zh-TW`、`fr`、`ja`、`ru`、`vi`。
- 新增文案必须通过 `web/scripts/add-missing-keys.mjs` 工作流写入全部语言，并执行 `bun run i18n:sync`。

## 已同步的重要上游能力

- 用户列表服务端排序和表格列切换刷新。
- Responses 流式工具调用去重。
- Codex 与高级自定义渠道的上游模型发现。
- Realtime GA 模型与请求头修复。
- Playground 自动分组模型列表。
- Suno 重复退款 CAS 并发保护。
- 代理客户端兼容性与 HTTP Client 缓存生命周期。
- 无状态认证 Token、会话管理和刷新失败登录态保护。
- 上游单前端目录及后续前端修复。

## 后续同步检查清单

1. 同步前保存并区分已暂存、未暂存修改。
2. 重点检查认证、任务计费、渠道枚举和 `web/` 品牌文件冲突。
3. 不要恢复已经删除的 `web/default`、`web/classic` 或 `web/tokenboat`。
4. OpenRouter 视频改动需覆盖请求、轮询、结算、退款和结果代理完整链路。
5. 数据库代码必须同时兼容 SQLite、MySQL 和 PostgreSQL。
6. 执行 Go 核心模块测试、前端 typecheck、目标文件 lint 和生产构建。
