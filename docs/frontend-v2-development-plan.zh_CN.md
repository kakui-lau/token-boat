# Frontend V2 全量重构与开发推进方案

> 状态：In Progress — User Console 首批范围已完成生产收口并接入联合发布链路；暂缓能力见第 52 节
>
> 适用范围：Token Boat / new-api 全部 Web 前端，包括公共站点、用户控制台、管理控制台和 Electron 内嵌页面
>
> 更新时间：2026-08-31
>
> 目标：在不继承现有前端框架和实现约束的前提下，重新定义产品交互、技术架构、工程规范、迁移方式和交付计划

## 0. 实施记录

### 0.1 2026-08-28：User Console 旁路功能模板已落地

第一批代码已经放入仓库根目录下独立的 `frontend/` Bun workspace，当前只搭建 User Console，不创建 Admin Console、公共 Site，也不改变现有发布链路。默认使用进程内 Demo Repository；可通过环境变量显式启用 Live Repository 在隔离环境联调现有 API。后端仅为 Playground 增加向后兼容的可选 `api_key_id`，未携带该字段的旧前端请求保持原行为。

已落地内容：

- `frontend/apps/console`：React 19.2.8、Vite 8.2.2、TanStack Router 文件路由、Tailwind CSS 4 和 i18next；共享开发入口中的新版地址为 `http://localhost:5173/console/`。
- `frontend/packages/ui`：由 shadcn `base-nova` + Base UI 生成并由项目持有的 Sidebar、Sheet、Command、Chart、Scroll Area、Item、Slider、Kbd、Button、Card、Badge、Calendar、Popover、Dropdown Menu、Dialog、Alert Dialog、Field、Input、Select、Switch、Tabs、Table、Progress、Empty、Skeleton、Toast 等源码。
- `frontend/packages/api-client`：统一 JSON Envelope 与 OpenAI 兼容原始响应、内存 Access Token、HttpOnly Refresh Cookie 和错误标准化的轻量客户端。
- `frontend/packages/tokens`：Light/Dark 语义色、Sidebar Token、圆角和 Tailwind Theme 映射基础。
- `frontend/packages/app-core`：带版本号和异常回退的布局偏好持久化；当前保存 Sidebar 折叠状态。
- Studio Admin 风格 User Console Shell：桌面折叠侧边栏、移动端抽屉导航、顶部搜索入口、Light/Dark/System、账户菜单和中英文切换。
- 用户中台路由：Sign In、Overview、Getting Started、Integration Center、Playground、API Keys、Models & Pricing、Usage、Request Logs、Tasks、Alerts & Status、Billing、Team & Access、Account（含主题设置），已全部从占位页替换为可操作页面；旧 Preferences 路由仅保留兼容重定向。
- 首次接入闭环：登录态 Bootstrap、三步接入向导、首次请求示例、API Key 创建/一次性展示/复制/停用/撤销和 Playground 消息发送。
- 日常管理闭环：用量指标与趋势、模型用量、异步任务进度、账单交易与套餐、兑换码、资料、通知偏好、安全状态和登录会话。
- TanStack Query 管理服务端状态、缓存失效和 mutation；Demo/Live 通过同一 `ConsoleRepository` 接口隔离，页面不感知数据来源。
- 语言资源彻底收敛为 en、zh；`bun run i18n:sync` 自动收集页面翻译键、清理废弃键并同步两份资源，测试强制简体中文与英文基准键集合一致。
- Demo 数据全部明确标记为非生产数据；Live Adapter 仅在设置 `VITE_CONSOLE_DATA_MODE=live` 后启用，接口映射和待确认项见 `docs/frontend-v2-user-console-api-map.zh_CN.md`。

当时的隔离边界保持不变：该批次没有修改 `web/`、`web/dist/`、`main.go`、Go Router、Dockerfile 或发布脚本。该历史边界已在第 54 节的联合发布里程碑中结束；现行产物会同时包含新旧前端。

已通过的门槛：

```text
bun run lint          通过
bun run format:check  通过
bun run typecheck     通过
bun run test          20 files / 49 tests 通过
bun run build         通过
桌面与 390 × 844 移动视口检查 通过
```

下一步不切换现网：在独立 Go/数据库/Redis 测试环境验证 Live Adapter 的响应结构、额度单位、2FA/Passkey 分支和充值/订阅跳转；继续补齐账户设置与支付 MSW 契约，再加入 Playwright 关键流程。Shared Shell 在 Admin 开工前从 `apps/console` 抽到 `packages/patterns`，避免过早抽象尚未验证的 Admin 差异。

### 0.2 2026-08-28：Live Adapter 第一批契约加固

已开始从“可评审 Demo”推进到“可隔离联调”状态，本批完成：

- 引入 MSW Node 测试服务器，建立真实 HTTP 请求层的 Live Repository 契约测试；覆盖刷新会话的 401/503 分流、用量统计字段、额度换算、分页 API Key 映射和创建密钥的一次性 Secret。
- 会话恢复只有在后端明确返回 401/403 时才进入未登录状态；网络错误、5xx 和无效响应不再错误清除前端会话，而是保留当前状态并展示可重试错误页。
- 用量接口按现有 Go 契约读取 `request_count + failure_count`、`total_tokens` 和 `quota`；成功率由成功/失败请求数计算，不再读取后端不存在的 `success_rate`、`token_count` 和 `avg_latency` 字段。
- 余额、用量费用和请求日志费用通过 `/api/status.quota_per_unit` 从原始 quota 统一换算为 USD 领域值，充值页再根据 USD/CNY/TOKENS 展示设置进行转换，避免同一字段在账单页和充值页使用不同单位。
- `POST /api/token/` 向后兼容地增加创建结果，完整 Key 只随创建响应返回；列表、搜索、详情和编辑接口仍保持掩码输出。V2 客户端在展示时补齐 `sk-` 前缀。

当时门槛：`21 files / 54 tests`、TypeScript、Oxlint、Oxfmt 和生产构建全部通过；Go Controller 回归测试通过。后续进度见 0.3、0.4。

### 0.3 2026-08-28：账户设置真实契约

账户页不再使用固定安全状态和通知默认值，本批完成：

- Live Adapter 并发读取当前用户、通知设置、Passkey、2FA、登录会话和 quota 单位；账户页展示真实安全状态与已保存配置。
- 新增向后兼容的 `GET /api/user/setting`，只返回通知目标、阈值和 Secret/Token 是否已配置，不返回 Webhook Secret 或 Gotify Token 明文。
- 支持后端已有的 Email、Webhook、Bark、Gotify 四种通知渠道；移除后端不接受的 `none`，并补齐渠道专属字段、必填校验和无障碍状态。
- 余额预警阈值在前端统一按 USD 编辑，Live Adapter 根据 `quota_per_unit` 与后端 quota 整数互相换算。
- `PUT /api/user/setting` 改为合并更新：保存通知设置时保留语言、侧边栏、扣费偏好、管理员通知开关和其他渠道配置；留空的已有 Webhook Secret/Gotify Token 不会被意外清除。
- 增加 MSW 与 Go 回归测试，固定安全读取、配置映射、quota 换算、无损保存和 Secret 不回传契约。

### 0.4 2026-08-28：2FA 与 Passkey 操作闭环

账户安全页已从只读状态推进为可执行的安全设置，本批完成：

- 2FA 启用流程接入现有 setup/enable 协议：展示 shadcn Dialog、标准 TOTP 二维码、手动密钥和一次性恢复码，用户输入验证器代码后启用。
- 已启用 2FA 的账户可重新生成恢复码或禁用 2FA；两项敏感操作都要求当前验证器代码，并使用 Alert Dialog 明确影响范围。
- Passkey 支持注册、替换和解绑；浏览器不支持 WebAuthn 时给出明确提示，不显示虚假的成功结果。
- 启用 2FA 时，Passkey 注册与删除先通过 `/api/verify` 获取限定 scope 的 `X-Security-Proof`；未启用 2FA 的 Passkey 删除通过浏览器 WebAuthn assertion 完成 step-up 验证。
- WebAuthn challenge、credential ID、attestation 和 assertion 均按 base64url 边界转换；注册和删除后的 Access Token、Session ID 与过期时间使用后端轮换结果更新内存会话。
- 二维码使用 `qrcode.react` 生成；页面结构、输入、弹层、确认和状态反馈继续优先使用项目自有 shadcn 组件，新增文案同步到 en/zh 两套资源。
- MSW 契约测试覆盖 2FA setup/enable、Passkey 注册序列化、Passkey assertion 解绑和安全状态刷新；组件测试覆盖恢复码展示、2FA 验证码及 Passkey 的 2FA 前置验证。

当前门槛：`22 files / 59 tests`、TypeScript、Oxlint、Oxfmt 和生产构建全部通过。下一批继续接入充值渠道回跳、套餐购买和服务端分页契约，仍不切换现网入口。

### 0.5 2026-08-28：充值回跳确认与套餐购买闭环

计费页和账户充值页已从静态展示推进为完整购买流程，本批完成：

- Live Adapter 并发读取账户余额、充值历史、公开套餐、当前/历史订阅、充值渠道配置和 quota 单位；套餐卡展示真实启用状态、有效期、额度、购买次数与购买上限。
- 套餐购买 Dialog 根据服务端配置只展示当前套餐可用的账户余额、Stripe、Creem、Waffo Pancake 和 Epay 支付方式；账户余额不足、无可用渠道和达到购买上限时均给出明确状态并阻止重复提交。
- 账户余额购买直接完成后刷新 Billing 与 Overview；外部支付统一处理 Redirect 与 POST Form 两种 Checkout，并在跳转前只将订单号、套餐 ID、支付类型和开始时间写入版本化 Session Storage，不保存支付凭据。
- 支付回跳进入确认状态后按订单号或套餐 ID 轮询后端事实状态；确认成功后刷新余额和账单，失败时明确提示，超时不会误报失败，并允许用户安全地重新检查而不是重复付款。
- Stripe 余额充值与订阅响应向后兼容地增加 `order_id`；Stripe 订阅、Epay 余额/订阅和 Waffo 余额支付支持经可信来源校验的可选回跳 URL。旧客户端不传新字段时保持原有 `/wallet`/`/usage-logs` 行为。
- Creem 与 Waffo Pancake 的回跳仍由支付产品/平台配置控制；隔离环境必须把其 Success URL 指向 `/console/recharge?payment=pending`，并在 Sandbox 验证 Webhook 延迟、重复通知和用户主动关闭支付页三类场景。
- MSW 契约测试覆盖套餐能力映射、Epay Form、订单追踪和充值确认；组件测试覆盖余额购买与余额不足；Go 回归测试固定不可信支付回跳 URL 必须被拒绝。

当前门槛：`24 files / 66 tests`、TypeScript、Oxlint、Oxfmt、生产构建和 Go Controller 全量回归全部通过。下一批进入 API Key、请求日志、任务和账单记录的服务端分页、筛选与排序契约。

### 0.6 2026-08-28：核心长列表服务端分页契约

API Key、请求日志、异步任务和账单交易不再固定下载前 100 条后在浏览器内分页，本批完成：

- 从 shadcn Registry 安装并纳入项目源码的 Pagination，封装统一 `DataPagination` 组合；四类列表共享总数区间、每页行数、第一页/上一页/下一页/最后一页、加载禁用和移动端收敛行为。
- API Key 列表按页请求，支持名称模糊搜索、Active/Disabled/Expired/Exhausted 服务端状态筛选和最新/最早排序；创建、启停或撤销后继续按 query-key 前缀刷新所有分页缓存。
- 请求日志按日期闭区间、成功/失败、Request ID/模型/API Key 指定字段、页码和时间顺序查询；搜索字段不再声称支持后端没有实现的跨列模糊匹配。顶部总请求数使用服务端 `total`，本页失败、延迟和费用明确标记为本页指标。
- 异步任务按日期、聚合状态、图片/视频/音频类型和顺序在服务端过滤；Queued 映射 `NOT_START/SUBMITTED/QUEUED`，其他 UI 状态映射对应后端状态。任务类型使用平台、动作和模型属性形成的描述符分类，并针对 SQLite、MySQL、PostgreSQL 使用兼容的文本表达式；各类型 Tab 总数来自独立服务端 count。
- 账单交易按日期、订单号、钱包充值/套餐、支付状态和顺序查询；用户作用域、30 天安全窗口、订阅订单子查询及最大 100 条页大小继续由后端约束。
- 所有分页查询使用 TanStack Query `keepPreviousData` 保持翻页和切换筛选时布局稳定；筛选、日期、类型、状态、顺序和 page size 变化都在事件处理器中同步回到第一页。
- Go 接口只新增可选查询参数，未传参数时仍保持旧版默认倒序和分页语义；现有 `web/` 构建入口与 V2 旁路隔离边界没有变化。

当前门槛：`30 files / 89 tests`、TypeScript、Oxlint、Oxfmt、生产构建、Go Controller 与 Model 回归全部通过。下一批进入列表 URL Search Params、Playwright 关键路径和隔离环境 Live 联调。

### 0.7 2026-08-28：公开账户访问流程

User Console 的认证入口从“已有账户登录”扩展为完整的公开账户访问页面，本批完成：

- 登录页继续按 `/api/status` 能力显示密码、2FA 和 Passkey，并在开放密码注册时提供创建账户入口；品牌分栏抽为共享 Auth Shell，注册、找回与重置页面保持同一响应式结构。
- 注册页接入 `register_enabled`、`password_register_enabled`、`email_verification`、Turnstile 和邀请码；用户名、8～20 位密码、确认密码、邮箱与验证码均在提交前验证。
- 邮箱验证使用 shadcn `InputGroup + Field` 组合发送动作，提供 60 秒防重复发送；Turnstile Token 使用后立即清空并重新挂载 Widget，避免一次性 Token 被第二个请求复用。
- 找回密码请求使用防账户枚举文案，不向用户确认邮箱是否存在；密码确认页只在链接包含 `email` 与 `token` 时允许提交，后端生成的新密码只显示一次，并提供 shadcn InputGroup 复制操作。
- 新增 `/console/register`、`/console/forgot-password` 和 `/console/user/reset` 公开路由；Session Boundary 不再把这些页面误判为登录后业务页。
- Live Repository 与 MSW 固定注册、邮箱验证码、Turnstile 查询参数、重置请求和确认响应契约；组件测试覆盖注册、通用重置提示和一次性密码展示；en/zh 文案同步。
- 本批没有修改 Go。审计确认现有邮件和 OAuth Provider 分别固定回调根路径 `/user/reset` 与 `/oauth/:provider`；在 `/console` 隔离部署下需要下一批增加向后兼容的回调路由或配置能力，修改 Go 前必须单独标注并保留旧前端语义。

当前门槛：`28 files / 84 tests`、TypeScript、Oxlint、Oxfmt 和生产构建全部通过；本地浏览器已验证注册、找回密码和重置确认页为默认中文且无控制台错误。Passkey 实机与 OAuth 回调仍是独立待验项。

### 0.8 2026-08-28：密码重置邮件的 `/console` 路径兼容

为避免 V2 用户在邮件中点击重置链接后落回旧前端，本批增加一个严格受限、向后兼容的 Go 参数：

- `GET /api/reset_password` 接受可选 `redirect_path`；只允许精确值 `/console/user/reset`，缺省值、未知路径、绝对 URL 或恶意 URL 均回退现有 `/user/reset`，不能把重置 Token 导向第三方域名。
- 邮件链接使用 `net/url.Values` 编码邮箱和 Token，修复邮箱 `+` 等字符直接拼接进查询字符串时的歧义。
- V2 Live Repository 固定发送 `redirect_path=/console/user/reset`；旧前端不传新参数，现有行为和路由保持不变。
- Go Controller 回归测试固定旧路径默认值、V2 白名单路径、查询参数编码和恶意路径回退；Frontend MSW 固定 V2 查询契约。
- 本批修改了 Go：`controller/misc.go`，并新增 `controller/password_reset_link_test.go`。没有改动现有 Go Router、数据库结构、服务端口或旧前端构建入口。

OAuth 不能仅靠相同方式修改前端路径：Discord、OIDC 和自定义 Provider 的 Authorization Redirect URI 必须与后端 Token Exchange 使用的 URI 完全一致，且还要兼容已注册的旧 `/oauth/:provider`。下一批先形成带 Auth Flow 绑定与 Provider 回调白名单的协议，再决定是否增加 Go 能力。

### 0.9 2026-08-28：OAuth `/console` 双路径兼容

User Console 已补齐 GitHub、Discord、OIDC、Linux DO 和自定义 OAuth Provider 登录，并通过 Auth Flow 绑定回调客户端，避免让浏览器直接指定任意 Redirect URI：

- `POST /api/oauth/state` 新增可选枚举 `client=console_v2`；服务端只接受空值或该精确值，V2 回调固定从 `server_address` 派生为 `/console/oauth/:provider`，并把精确 URI 与一次性 State 一起写入 `auth_flows.payload`。客户端不能提交绝对回调 URL，也不能把 OAuth Code 导向第三方地址。
- OAuth 回调处理器在交换 Code 前从已验证的 Auth Flow 恢复创建 State 时绑定的精确 URI，并把它传给 GitHub、Discord、OIDC、Linux DO 和自定义 Provider 的 Token Exchange；即使期间服务端地址配置变化，Authorization Request 与 Token Exchange 也不会产生 V2 路径不一致。
- 旧前端创建 State 时不传 `client`，各 Provider 继续使用原有 `/oauth/:provider` 或既有 Linux DO API 回调，不修改旧路由、旧 OAuth 应用配置和默认行为。
- V2 登录页按 `/api/status` 展示已启用 Provider，新增 `/console/oauth/:provider` 公共回调页；回调只交换一次，成功建立统一 Session Bundle，缺失参数、Provider 拒绝和服务端失败均进入明确错误状态。Authorization Endpoint 与回调 URL 只允许 HTTP(S)，防止可执行协议进入浏览器跳转。
- Provider 应用仍需在隔离环境登记精确的 V2 Callback；本地 `server_address` 必须指向浏览器实际访问的 V2 Origin。该步骤涉及外部 OAuth 应用配置，本批只完成协议、UI 与自动化契约，不宣称已完成真实 Provider 登录。
- 本批修改了 Go：`controller/oauth.go`、`oauth/github.go`、`oauth/discord.go`、`oauth/oidc.go`、`oauth/linuxdo.go`、`oauth/generic.go`，新增 `oauth/redirect_uri.go`、`controller/oauth_callback_test.go`、`oauth/redirect_uri_test.go`，并扩展 `oauth/oidc_test.go`。没有修改数据库结构、Go Router、现有 `web/`、服务端口或发布入口。
- 已重新构建并启动独立 `3001` Go API，只把 PostgreSQL 快照的 `ServerAddress` 更新为 `http://127.0.0.1:4173`；真实 `POST /api/oauth/state` Smoke 返回精确的 `/console/oauth/github`、一次性 Token 和过期时间。现有 `3000` 服务仍健康且保留原配置，未被重启或切换。

当前质量门槛：Frontend `31 files / 95 tests`、TypeScript、Oxlint、Oxfmt 和生产构建全部通过，Go `go test ./...` 全量通过。真实 OAuth Provider 登录仍需先登记隔离 Callback 并配置正确 `server_address`；Passkey 实机验证仍需启用正确 RP ID/Origin 的浏览器环境。

### 0.10 2026-08-28：核心列表 URL 状态与真实浏览器验收

核心长列表已从页面内临时状态收敛为可恢复、可分享和支持浏览器前进后退的 URL Search Params，本批完成：

- API Key、请求日志、任务、账单交易和用量分析的日期范围、搜索词、搜索字段、类型、状态、排序、Tab、页码与每页行数按页面能力写入 URL；默认值不产生冗余参数，筛选变化继续回到第一页。
- 各路由使用强类型 `validateSearch` 过滤未知枚举、非法日期、超长搜索词、越界页码和不支持的 page size；无效参数安全回退页面默认值，不会带入 Repository 请求。
- 自定义日期范围保留精确起止日期，快捷日期只保存 preset；刷新、复制链接和浏览器前进后退均可恢复同一筛选界面。
- 已在连接独立 `3001` Go API 与 PostgreSQL 快照的真实 Live 环境中，用 Playwright CLI 验证 API Key、请求日志、任务和账单的直接链接恢复、筛选提交、历史回退、空状态与默认中文；浏览器控制台无 Error。
- 已检查 `1440 × 1000` 桌面与 `390 × 844` 移动视口，页面无文档级横向溢出；任务类型在移动端改为两列两行，避免选中 Tab 自动滚动后裁掉首项，桌面任务卡继续使用四列布局。
- 补齐 `Search` 与 `Top-up` 的简体中文资源，仍只保留 en、zh 两种语言；翻译通过项目同步脚本生成，没有手工维护派生语言文件。
- 本批没有修改 Go 后端代码、数据库结构、现有 `web/` 发布入口或服务端口。

当前质量门槛：Frontend `32 files / 99 tests`、TypeScript、Oxlint、Oxfmt 和生产构建全部通过。下一批继续处理 Passkey/OAuth 外部环境验收，并按 User Console API Map 推进仍缺少真实领域接口的团队、告警与状态能力。

### 0.11 2026-08-28：告警真实状态与团队能力边界

告警与团队页面已移除 Live 模式中的本地假写入，本批完成：

- 告警中心并行读取现有 `GET /api/uptime/status` 与账户通知设置：平台状态、监控项、当前状态和 24 小时最低可用率来自真实 Uptime Kuma 数据；余额预警阈值与通知渠道来自已保存的 `/api/user/setting`。
- 未配置 Uptime Kuma 时明确展示“尚未配置状态监控”和监控空状态，不再固定声称“全部系统正常”或伪造 99.99% 可用率；当前状态服务不提供故障历史时也明确说明数据边界。
- 告警页不再在浏览器内伪造消费、错误率、延迟规则或本地开关；“管理告警设置”直接进入 `/console/account?tab=preferences`，复用现有 Email、Webhook、Bark、Gotify 和余额阈值真实保存流程。
- 团队页在 Live 模式明确展示为个人工作区，不把当前账户资料伪造成工作区成员记录；移除本地假邀请成功、假成员和假活跃时间。Workspace、Invite、Role Assignment 与 Member Audit API 未落地前，不向用户展示可执行邀请按钮。
- Demo Repository 继续保留明确标识的多成员和多告警样例，仅用于 UI 评审；Live Repository 与页面能力边界分开处理，Demo 行为不会被误认为后端已持久化。
- 新增 MSW 契约测试固定 Uptime 状态、最低可用率和账户余额预警映射；组件测试固定 Live 团队无邀请入口、告警无假创建/开关及真实设置跳转。
- 已在真实 Live 环境用 `localadmin` 验证桌面与 `390 × 844` 移动视口，页面无文档级横向溢出，浏览器控制台无 Error。
- 本批没有修改 Go 后端代码、数据库结构、现有 `web/` 发布入口或服务端口。

完整自定义告警仍需要服务端规则存储、指标求值、通知去重和触发历史；多人团队仍需要 Workspace、Member、Invite、Role 与 Audit 领域契约。两者必须作为独立后端里程碑实现，不能用前端本地状态替代。

当前质量门槛：Frontend `34 files / 102 tests`、TypeScript、Oxlint、Oxfmt 和生产构建全部通过。

### 0.12 2026-08-28：环境标识降噪与开发顺序调整

- 侧边栏移除独立的“数据源 / 真实 API / 已连接现有后端 API”信息卡，不再让运行环境说明占据持续可见的导航空间。
- 只有 Demo 模式在登录账户名称旁显示轻量“演示数据”角标；Live 模式不显示环境角标。账户菜单仍可承载必要的身份与账户分组信息，不新增另一块环境说明。
- 后续 User Console 开发顺序调整为：先完成纯前端页面、交互、响应式、空/错/加载状态和可访问性；再接入现有稳定接口并完成 Live、MSW 与浏览器验收；必须新增 Go、接口或表结构的能力统一进入最后的“后端扩展与正式切换准备”工作包。
- 后置能力包括但不限于多人 Workspace、成员邀请与角色审计、自定义告警规则与求值历史、用量聚合缺失字段、发票、Playground 持久化会话等。后置不代表删除需求；前端可先完成不伪造数据的安全降级界面与契约草案，但不得提前改动现有服务。
- 只有当前页面无法基于现有接口完成安全、计费或正确性闭环时，才允许在前端阶段提前修改后端；此类例外必须单独说明 Go 文件、兼容性、数据影响和回归结果。
- 本批没有修改 Go 后端代码、接口、数据库结构、现有 `web/` 发布入口或服务端口。

当前质量门槛：Frontend `35 files / 104 tests`、TypeScript、Oxlint、Oxfmt 和生产构建全部通过；Demo 与 Live 环境均完成桌面浏览器验收，Live `390 × 844` 移动视口无文档级横向溢出。

### 0.13 2026-08-29：模型价格与 Playground 验证闭环

- Models & Pricing 不再读取已废弃的平面 `input_price` / `output_price` 作为主要价格来源；Live Adapter 优先读取当前账户分组的 `sales_prices_by_group`，再安全回退 `lowest_price` 与 `official_price`，支持 Token、按请求和按秒计费以及阶梯“起价”。
- 页面金额统一使用两位小数；模型目录明确展示当前账户分组，不向用户暴露采购价、渠道成本或管理员定价血缘。底层价格、计费和 API 数值精度不受展示格式影响。
- 模型名称、类型、可用状态筛选进入强类型 URL Search Params；刷新、复制链接和浏览器前进后退均可恢复，非法参数安全丢弃。筛选无结果提供“清除筛选”，加载失败使用独立 Alert 与原条件重试，不再误显示为空数据。
- 每个可用模型可直接进入 `/console/playground?model=...`；Playground 会优先选择允许该模型的有效 API Key，再保持密钥分组和模型权限校验，避免静默回退到无关模型。
- 补齐模型空状态简体中文文案，并增加价格映射、URL 参数、筛选/错误状态和跨页预选模型测试；真实 Live 环境已验证 `default` 分组价格、筛选 URL 和模型带参进入 Playground。
- 本批没有修改 Go 后端、接口、数据库结构、价格数据、现有 `web/` 发布入口或服务端口。

当前质量门槛：Frontend `37 files / 112 tests`、TypeScript、Oxlint、Oxfmt 和生产构建全部通过。

### 0.14 2026-08-29：全局表格信息密度规范

- shadcn Table Primitive 统一改为紧凑表头与行间距；主题设置中的 Compact 密度会进一步收紧表头、单元格横向和纵向留白，所有现有与后续表格自动继承，不再由页面各自维护行高。
- 完成 Models、API Keys、Usage、Request Logs、Billing、Overview、Integration、Team 共九张业务表审计：标识符显示为“前 8 位…后 4 位”，列表时间显示月日和分钟，长模型名、端点、密钥名、成员信息与描述按列宽截断，完整值通过原生标题提示或详情弹层保留。
- 数字、Token、延迟、上下文、额度和金额列统一右对齐并使用等宽数字；所有页面金额统一展示两位小数。模型目录价格例如“`US$9.95/1M`”，按请求与按秒分别显示“`/次`”和“`/秒`”。底层价格和计费精度不变，模型价格悬停标题仍展示五位小数的完整价格与单位，避免影响核对。
- 低频多值列只展示决策所需摘要：模型能力最多显示两个标签和 `+N`，完整能力集合保留在标题提示中；操作列使用图标按钮与紧凑间距，避免重复文字挤占主数据。
- 桌面端请求日志九列在正常内容宽度内无需横向滚动，Demo 实测数据行高度约 `33.5px`；窄屏仍由 Table 容器提供横向滚动，不以压缩字体或删除核心列换取伪响应式。
- 本批只修改 Frontend V2 组件、页面和文档，没有修改 Go 后端、接口、数据库结构、现有 `web/` 发布入口或服务端口。

当前质量门槛：Frontend `37 files / 115 tests`、TypeScript、Oxlint、Oxfmt 和生产构建全部通过。

### 0.15 2026-08-29：模型详情与折叠能力交互

- 模型目录中的模型名称改为可点击入口，使用 shadcn Dialog 展示真实 `/api/pricing` 已提供的用户侧完整信息：模型 ID、说明、提供商、类型、完整上下文、可用状态及原因、当前账户分组、计费模式、价格结构、报价来源、价格表来源、兼容端点和全部能力。
- Live Adapter 不再把结构化报价永久压扁成输入/输出两个数字；`ModelCatalogItem` 保留当前分组报价、官方参考价及每一项公开计费组件，包括金额、基础金额、单位与单位数量、阶梯、上限、操作、质量、分辨率、音频条件和实际生效分组。详情使用紧凑 shadcn Table 逐项展示输入、输出、缓存读写及媒体阶梯等完整报价，并按相同条件匹配官方参考价。
- 目录表继续使用两位小数保持扫描效率；详情报价使用五位小数和完整计费单位。当前分组无精确报价而回退最低价或官方价时，弹层明确标注报价来源与参考性质，不把回退价格伪装成账户精确价格。
- 能力列的 `+1`、`+2` 改为 shadcn Tooltip 悬停提示，按钮聚焦时同样可达，并保留原生标题作为触屏与降级提示；不再要求点击后打开独立菜单。
- 详情弹层保留复制 Model ID 和带模型参数进入 Playground 的快捷操作；新增文案通过 Frontend V2 的 en/zh 同步脚本生成，没有恢复其他语言包。
- 本批继续复用现有 Go `/api/pricing` 契约，只扩展 Frontend V2 的类型、Live Adapter 与展示层，没有修改 Go 后端、接口、数据库结构、现有 `web/` 发布入口或服务端口；后端未来补充官方文档、上下文分项或多模态限制时，只需继续扩展 `ModelCatalogItem` 与详情区域。

当前质量门槛：Frontend `37 files / 118 tests`、TypeScript、Oxlint、Oxfmt 和生产构建全部通过；真实 `/api/pricing` 响应已审计 Token、缓存、媒体阶梯和全部公开条件字段，Demo 浏览器已验证详情布局与 `+N` 悬停 Tooltip，控制台无错误。

### 0.16 2026-08-29：模型详情长报价视口约束

- 修复模型含大量阶梯报价时 Dialog 被内容撑出浏览器视口的问题。弹层改为明确的纵向 Flex 布局，最大高度为 `100dvh - 2rem`；Header 与 Footer 固定，中间模型信息和完整报价区域独立纵向滚动。
- 滚动区域使用 `min-height: 0`、`flex: 1`、横向裁切和 `overscroll-contain`，报价 Table 继续由 shadcn Table 容器负责自身横向滚动，避免长价格、官方参考价或适用条件把整个页面撑宽。
- 滚动区域提供可访问名称、键盘焦点和焦点环；报价表头在内部滚动时保持置顶，复制模型 ID 与进入游乐场操作始终留在视口内。
- 新增长报价结构回归测试，确保弹层具备视口最大高度、中间滚动区以及固定 Header/Footer。`900 × 600` 浏览器验收中，弹层边界稳定在视口上下各 `16px`，内容区产生内部滚动，滚动后 Header/Footer 坐标不变，页面无横向溢出且控制台无错误。
- 本批只修改 Frontend V2 模型详情布局、测试、en/zh 文案和开发文档，没有修改 Go 后端、接口、数据库结构、现有 `web/` 发布入口或服务端口。

当前质量门槛：Frontend `37 files / 119 tests`、TypeScript、Oxlint、Oxfmt 和生产构建全部通过。

### 0.17 2026-08-30：用户日志类型隔离

- 后端日志 `type=0` 仅作为“未指定类型”的查询哨兵，不是持久化业务类型；实际类型固定为：`1` 充值、`2` API 消费成功、`3` 管理操作、`4` 系统/账户事件、`5` API 或任务失败、`6` 退款、`7` 登录审计。
- User Console 的“请求日志”只查询 `2` 与 `5`，不再混入登录、账户操作、系统事件、充值或退款记录；账户活动范围为 `3/4/7`，账务范围为 `1/6`。后续建设账户活动和账务明细页面时复用对应范围，不把不同语义的数据强行套入请求表格。
- `/api/log/self` 新增可选 `scope=request|activity|billing` 查询参数；不传 `scope` 时继续返回原有全部类型，旧前端和既有 API 调用保持兼容。显式 `type` 的优先级高于 `scope`，成功/失败筛选仍可精确查询 `2` 或 `5`。
- Live Adapter 对请求日志再做一次 `2/5` 防御性过滤，并删除缺失端点时伪造 `/v1/chat/completions` 的兜底；历史日志没有真实端点时统一展示 `—`。因此登录审计不会再被误标为模型请求。
- 本批修改 Go 日志查询契约与 Frontend V2 展示，没有修改数据库表结构、日志枚举值、写入格式或旧前端默认查询语义；新增 Model 与 Frontend 契约回归测试覆盖全部七种类型、三个范围和错误端点兜底。

### 0.18 2026-08-30：账户活动工作台

- 新增 `/console/activity` 账户活动页面，将登录审计、账户操作和系统事件按 `3/4/7` 三类独立展示，不再进入请求日志。页面支持 URL 持久化的活动类型、排序、分页、快捷日期和自定义日期范围。
- 列表只展示服务端真实返回的时间、类型、说明、来源 IP、登录方式和事件 ID；字段缺失时显示“—”。详情 Sheet 展示用户可见的稳定 action、结构化参数、原始说明和 User Agent，不展示已由后端剥离的管理员身份、内部路由或审计中间件信息。
- Live Repository 固定使用 `scope=activity`，选择具体类型时再发送明确的 `type=3/4/7`。若接口错误返回 API 请求、充值或退款日志，前端直接进入契约错误态，禁止将其改名为账户活动。
- Demo Repository 保留显式测试样例用于界面评审；Live 页面不推断活动状态、成功结果或不存在的请求端点。本批复用现有日志范围接口，没有修改 Go 后端、数据库表结构或旧前端入口。

### 0.19 2026-08-30：全局路由与服务异常边界

- Root Router 增加独立 Not Found 页面；未知 `/console/*` 路径显示明确的 404 状态和返回概览动作，不再落入空白 Outlet。路由异常按真实 HTTP 状态区分 401 会话失效、403 无权访问、404 资源不存在、5xx 服务暂不可用以及没有状态码的未知前端异常。
- API Client 从真实响应头 `X-Oneapi-Request-Id` 读取请求编号并附加到 `ApiClientError`。全局异常页与会话恢复失败页仅在响应实际提供编号时显示“支持参考编号”，没有编号时保持缺失，不生成随机追踪 ID。
- 401 不展示无意义的原地重试，只提供重新登录；403/404 提供返回概览；5xx 与未知前端异常保留重试。错误页不直接展示服务端原始错误文本，避免将内部诊断信息或敏感字段暴露给用户。
- 错误状态统一复用 shadcn `Empty`、`Badge` 与 `Button` 组合，具备明确标题、说明、状态码、支持编号和下一步动作。本批没有修改 Go 后端、接口、数据库结构或旧前端入口。

### 0.20 2026-08-30：告警摘要与真实异常边界

- 顶栏告警入口升级为按需加载的 shadcn Popover：首次打开时才读取告警中心，展示真实平台状态、24 小时最低可用率和已保存告警规则状态，并可直接进入完整告警中心。查询结果复用 TanStack Query 的 `alert-center` 缓存，不额外制造并发重复请求。
- 告警中心修复加载失败时被误展示为“平台状态暂不可用”“未配置监控”或“无事件历史”的隐性兜底。初次加载统一展示 Skeleton；请求失败统一进入可重试错误状态，只有接口成功返回空集合时才展示空状态。
- 已启用规则数量仅在后端明确返回每条规则启用状态时计算；现有接口没有启用状态时继续显示“状态暂不可用”，不把通知渠道存在推断为规则已启用。
- 顶栏摘要和告警页面复用同一套平台状态、监控状态、渠道与阈值领域映射，减少两处展示产生语义漂移。交互使用 shadcn Popover、Item、Badge、Alert、Skeleton 与 Button 组合，支持键盘焦点、加载提示和原地重试。
- 本批只修改 Frontend V2 页面、组件、测试、en/zh 文案和开发文档，没有修改 Go 后端、接口、数据库结构、旧前端入口或服务端口。

### 0.21 2026-08-30：支付订单与财务事实边界

- “财务与账单”页面明确当前交易接口的真实范围为充值与订阅支付订单，不再用“用量、兑换、发票”等当前接口未返回的领域描述扩大页面能力。交易标签调整为“支付记录 / 支付订单”，筛选和空状态继续围绕真实订单号、类型、状态和日期范围。
- 修复支付订单请求失败时本页扣款被计算成 `0`、列表被显示成“暂无交易”的错误判断。加载中展示 Skeleton；失败时扣款显示“—”和明确不可用说明，列表进入独立可重试错误状态；只有接口成功返回空集合时才展示支付订单空状态。
- 支付订单表新增紧凑订单号列，点击订单号使用 shadcn Sheet 展示完整订单号、类型、状态、记录时间、金额和说明，并支持复制订单号。币种只在账单摘要真实返回后使用；账单摘要失败时订单金额显示“—”，不默认假设 USD。
- 订单类型、状态标签和 Badge 变体提取为共享领域映射，列表与详情保持一致；本页扣款直接从当前成功返回的分页数据派生，不保存第二份状态，也不把失败结果转换为金融事实。
- 本批只修改 Frontend V2 页面、组件、测试、en/zh 文案和开发文档，没有修改 Go 后端、接口、数据库结构、旧前端入口或服务端口。

### 0.22 2026-08-30：账户余额活动与支付订单分层

- “财务与账单”新增独立“余额活动”标签，复用现有 `GET /api/log/self?scope=billing`，只接收账户财务记录 `type=1` 与退款 `type=6`；后端历史上也使用 `type=1` 记录部分订阅购买，因此用户侧采用中性的“余额记录”，不一律标成充值入账。支付订单、API 请求和账户活动继续使用各自的数据源与页面语义，不再混成一张“交易明细”表。
- 余额活动支持日期、类型、排序和独立分页 URL 参数。切换支付记录与余额活动时，各自筛选和页码互不覆盖；只有进入余额活动标签后才请求该数据，避免账单首页增加无用请求。
- 列表展示事件 ID、类型、原始记录说明、时间、来源 IP 和结构化余额变化；点击事件 ID 使用 shadcn Sheet 查看关联模型、API Key、任务 ID 与完整说明，并支持复制事件 ID。加载、错误、首次为空和筛选为空均使用独立状态。
- 退款日志中的结构化额度按当前服务端 `quota_per_unit` 转换为 USD，两位小数展示；现有充值日志没有结构化金额字段，因此充值事件金额明确显示“— / 结构化数据中未记录”，不会解析自然语言说明，也不会用支付订单金额或 `0` 进行补齐。
- Live Repository 对 `scope=billing` 返回非 `1/6` 类型直接抛出契约错误，避免请求、登录或管理日志被误包装成余额事件；Demo Repository、URL 校验、失败重试、详情与复制交互均补充回归测试。
- 本批只修改 Frontend V2 页面、Repository、测试、en/zh 文案和开发文档，没有修改 Go 后端、接口、数据库结构、旧前端入口或服务端口。

## 1. 执行摘要

本方案建议从零建设 Frontend V2，不以“逐文件翻译旧代码”为目标。旧前端仅作为业务行为、权限规则和接口契约的参考实现。

最终架构拆成三个产品表面：

1. **公共站点 Site**：使用 Astro 静态生成，负责首页、模型与价格、文档、状态、关于和法律页面。默认不发送 JavaScript，只有动态价格、搜索、状态等区域使用 React Island。
2. **用户中台 User Console**：使用 React + Vite 构建客户端应用，承载登录后的接入向导、Playground、API Key、用量、任务、计费和账户安全，正式路径为 `/console/*`。
3. **管理员后台 Admin Console**：使用另一套 React + Vite 应用，承载渠道、模型、路由、定价、客户、财务、运行状态和系统设置，正式路径为 `/admin/*`。

三个应用放在同一个 Bun workspace 中。User Console 与 Admin Console 拥有独立入口、Router、RouteCatalog、功能代码、构建产物和性能预算，但共享登录会话协议、设计 Token、国际化基础、API 生成类型、测试工具、shadcn Primitive、Pattern 和 Shell 组件。构建结束后合成为一个静态产物目录，继续支持：

- Go 单二进制嵌入部署；
- `FRONTEND_BASE_URL` 分离部署；
- Electron 加载本地 Go 服务；
- CDN 或对象存储部署静态资源。

推荐技术基线：

- 公共站点：Astro 7.x；
- 用户中台与管理员后台：React 19.2、Vite 8、TanStack Router、TanStack Query，分别构建；
- 组件系统：Base UI + 自有 shadcn registry + Tailwind CSS；
- 表单：React Hook Form + Zod；
- 表格：TanStack Table + TanStack Virtual；
- API：OpenAPI → openapi-typescript → openapi-fetch；
- 测试：Vitest、Testing Library、MSW、Playwright；
- 包管理与工作区：Bun workspaces。

User Console 与 Admin Console 都以 [Studio Admin E-commerce Dashboard](https://next-shadcn-admin-dashboard.vercel.app/dashboard/ecommerce) 为视觉与交互基线，共享侧边栏、顶栏、账户入口、动态主题和布局设置的组件实现；两者不共享导航树、全局搜索范围或业务 feature。右侧内容区根据各自任务选择性迁移或重新设计。工程实现不等于采用 Next.js 运行时：V2 继续使用静态应用架构，并优先从同作者的 Base UI/TanStack 版本迁移兼容代码，避免把 Radix API、Next Server Action 和 Node 生产运行时带入目标系统。完整 Shell 决策和页面映射见第 29 节。

按完整功能覆盖估算，推荐 1 名产品负责人、2 名设计师、1 名前端负责人、4 名前端工程师、1 名 QA 自动化工程师和 0.5 名后端工程师，周期约 **22～28 周**。如果只有 3 名前端工程师，按 **32～40 周**规划更现实。

## 2. 背景与已确认约束

本 RFC 不把现有 React/Rsbuild 代码结构视为约束，但仍尊重产品和部署事实。

### 2.1 产品事实

- 产品同时服务游客、API 使用者、管理员和超级管理员。
- 功能横跨登录、API Key、模型、渠道、路由、日志、计费、财务、订阅、系统配置和 AI Playground。
- 页面既有简单资料展示，也有大规模表格、实时状态、复杂动态表单、富文本、代码编辑器和图表。
- V2 前端只支持 en、zh 两种语言，默认简体中文；不保留未交付语言的入口、资源文件或运行时注册。
- 权限不只是角色判断，还包含细粒度资源/动作权限和服务端模块开关。

### 2.2 部署事实

- 当前 Go 主程序通过 `go:embed` 嵌入前端产物。
- Docker 最终镜像只运行 Go 二进制，不运行 Node.js。
- Electron 也通过本地 Go 服务加载页面。
- 系统可以通过 `FRONTEND_BASE_URL` 把前端托管到外部地址。

因此，本方案默认继续输出静态文件。SSR 不是 V2 首期的生产依赖，避免同时引入 Node 服务、会话转发、缓存一致性和 Electron 双运行时问题。

### 2.3 API 事实

- 仓库已有 OpenAPI 文档，但管理 API 文档覆盖约 132 条 path，后端路由声明明显更多。
- V2 不能直接假设现有 OpenAPI 已完整、准确。
- 前端开发前必须先建立“页面—能力—接口—权限”的契约矩阵。

## 3. 目标与非目标

### 3.1 目标

1. 重新设计信息架构，使普通用户和管理员只看到当前任务需要的功能。
2. 建立一套稳定、可访问、可国际化的产品设计系统。
3. 复杂业务以领域模块组织，不再形成数千行单组件。
4. 页面状态可通过 URL 恢复、分享和前进后退。
5. API 类型由契约生成，减少手写 DTO 漂移。
6. 建立可量化的性能、质量、可访问性和发布门槛。
7. 新旧前端可并行运行、按用户灰度、随时回滚。
8. 最终删除旧前端，不形成永久双维护。

### 3.2 非目标

- 不在同一项目中重写 Go 后端业务。
- 不把 REST 全面替换为 GraphQL。
- 不建设运行时微前端或 Module Federation。
- 不为 Web 和 Electron 维护两套 UI。
- 不追求旧页面 DOM、视觉或目录结构的一比一兼容。
- 不在首期建设离线优先或完整 PWA。
- 不把前端权限判断当成安全边界；最终权限仍由后端强制执行。

## 4. 架构选型决策

### 4.1 评估方案

| 方案                                      | 优势                                                                             | 主要问题                                                                          | 结论     |
| ----------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| 单一 React SPA                            | 部署最简单，适合控制台                                                           | 公共站点 SEO、首屏与内容构建能力弱，公共和后台依赖容易互相污染                    | 不采用   |
| 单一 Next.js 应用                         | 统一路由，SSR/RSC 能力强                                                         | 静态导出不支持全部动态能力；完整能力需要 Node 生产运行时，影响单二进制和 Electron | 不采用   |
| 单一 Astro 应用 + 大型 React Island       | 公共页面优秀                                                                     | 控制台边界不清，最终容易形成一个巨型 Island                                       | 不采用   |
| Astro Site + 单一 React Console           | 公共和应用依赖隔离；都可静态输出                                                 | 用户功能与管理员功能仍共享路由、入口包和导航边界                                  | 不采用   |
| Astro Site + User Console + Admin Console | 三个产品面独立；用户不下载管理员业务；可分别测试、发布和限制网络访问；共享包可控 | Workspace、构建合并和认证跳转稍复杂                                               | **采用** |

### 4.2 为什么不选择 Next.js 作为默认方案

Next.js 可以静态导出，但静态导出模式不提供依赖运行时服务器的能力，未知动态路由、运行时重写、代理、服务端会话和 ISR 等也受限制。若为这些能力增加 Node.js 服务，会改变当前部署模型并提高运维成本。

V2 的核心难点是复杂控制台交互和领域治理，而不是服务端 React。公共站点的静态生成需求由 Astro 更直接地解决；控制台保留纯客户端应用可以让 Go API 成为唯一服务端来源。

### 4.3 为什么仍选择 React 作为 Console UI Runtime

这是一次重新评估后的选择，而不是对旧代码的继承：

- 产品高度依赖复杂表格、虚拟列表、富文本、图表、流程图和表单编辑器；React 生态在这些领域成熟。
- TanStack Router 对类型安全搜索参数、嵌套路由、预加载和自动路由分包支持适合大型控制台。
- TanStack Query、Table、Virtual 能以同一套思路处理服务端状态和高密度数据界面。
- Base UI 和 shadcn 的开放代码模型适合建设自有组件系统，而不是被第三方主题 API 锁定。
- React 与 Electron、Astro Island 和现有 AI 交互生态兼容良好。

### 4.4 为什么 User Console 与 Admin Console 分成两个应用

两者共享视觉语言，但产品任务、风险和演进节奏不同：

- User Console 面向自助接入和日常使用，导航应稳定、简单，首屏不能携带渠道、财务、定价和系统管理代码。
- Admin Console 面向高密度运营和高风险写操作，需要独立的信息架构、全局搜索、权限 bootstrap、审计、性能预算和发布验证。
- 分成两个 Vite 应用后，可分别生成 `/console` 与 `/admin` 入口，避免仅靠隐藏菜单制造“伪隔离”，也为未来把 Admin 放到独立域名、内网或零信任网关保留路径。
- 两个应用仍在同一 Bun workspace，共享 `packages/ui`、`packages/patterns`、API 生成类型、认证协议和 i18n 基础，不拆仓库、不采用运行时微前端。
- 静态资源拆分只改善产品和工程边界，不构成授权机制；直接请求管理 API 时仍必须通过 Go 的 capability 校验。

## 5. 目标技术栈

版本采用“主版本锁定、补丁版本定期升级”，脚手架落地时记录完整版本到 ADR 和 lockfile。

| 层级                      | 选择                                                              | 使用原则                                                                                      |
| ------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Workspace                 | Bun workspaces                                                    | 根目录统一安装、脚本和锁文件，不引入额外任务编排工具                                          |
| 公共站点                  | Astro 7.x                                                         | 默认静态输出；React 仅用于动态 Island                                                         |
| 用户中台                  | React 19.2 + Vite 8                                               | 独立 SPA；只包含普通用户和开发者能力                                                          |
| 管理员后台                | React 19.2 + Vite 8                                               | 独立 SPA；管理员领域按路由级和功能级分包                                                      |
| 路由                      | TanStack Router                                                   | 文件路由、类型安全 params/search、beforeLoad、intent preload                                  |
| 服务端状态                | TanStack Query                                                    | 查询缓存、并发去重、失效、预取和乐观更新                                                      |
| 客户端状态                | React state/context；必要时 Zustand                               | 禁止把服务端数据复制到全局 store                                                              |
| API                       | openapi-typescript + openapi-fetch                                | 由 OpenAPI 生成类型；统一错误和请求 ID                                                        |
| 表单                      | React Hook Form + Zod                                             | Schema 为唯一客户端校验来源；映射服务端字段错误                                               |
| 表格                      | TanStack Table + TanStack Virtual                                 | 服务器分页优先；大列表虚拟化                                                                  |
| UI Primitive              | Base UI                                                           | 负责弹层、焦点、键盘和 ARIA 行为                                                              |
| UI Distribution           | 自有 shadcn registry                                              | 组件源码归项目所有；禁止业务页面直接拼第三方 Primitive                                        |
| Shared Console Shell 基线 | `next-shadcn-admin-dashboard` Demo + 同作者 Base UI/TanStack 实现 | 共享组件与视觉语言；User/Admin 使用独立导航、搜索和业务 Slot                                  |
| 样式                      | Tailwind CSS + CSS Variables                                      | 语义 Token；OKLCH；不在业务组件写品牌硬编码颜色                                               |
| 图标                      | Lucide，直接路径导入                                              | 全产品只保留一个通用图标库；品牌图标例外                                                      |
| 图表                      | shadcn Chart + Recharts 3，按路由加载                             | 使用 ChartContainer、语义 chart Token、统一 Tooltip 和 `accessibilityLayer`；只在图表路由加载 |
| 代码编辑                  | CodeMirror 6                                                      | 仅在实际打开编辑器时动态加载                                                                  |
| i18n                      | i18next + ICU message                                             | React 与非 React 共用资源；构建期检查缺失键                                                   |
| 单元/组件测试             | Vitest + Testing Library                                          | 测用户行为，不测实现细节                                                                      |
| API Mock                  | MSW                                                               | 开发、组件测试和部分 E2E 共用 handler                                                         |
| E2E                       | Playwright                                                        | Chromium 必跑；WebKit/Firefox 跑关键流程                                                      |
| 静态检查                  | TypeScript、Oxlint、Oxfmt、Knip                                   | 不依赖预览版类型检查器作为唯一门槛                                                            |
| 观测                      | Web Vitals + 可替换错误上报 Adapter                               | 默认不上传敏感请求和模型内容                                                                  |

## 6. Workspace 与目录结构

新代码放入独立 `frontend/` 目录，避免迁移期污染旧 `web/`。

迁移期将以下边界视为硬约束：

- `web/`、`web/dist/`、当前 Dockerfile 的旧前端构建阶段和 `main.go` 的 `//go:embed web/dist` 继续服务现网，不改为指向 V2。
- `frontend/` 使用独立 `package.json`、`bun.lock`、缓存、开发端口和 `frontend/dist/`，不得把 V2 产物复制到 `web/dist/` 做日常预览。
- V2 的构建、测试和预览使用独立、显式触发的 CI Job；在正式切换前不改变当前 release Job 的输入和产物。
- 开发者如需同时运行两套代码，优先使用独立 Git worktree 和独立容器/端口，避免依赖、环境变量与生成文件互相覆盖。

```text
frontend/
  package.json
  bun.lock
  tsconfig.base.json
  apps/
    site/
      src/
        pages/
        layouts/
        components/
        islands/
        content/
      astro.config.ts
    console/
      src/
        app/
        routes/
        features/
      vite.config.ts
    admin/
      src/
        app/
        routes/
        features/
      vite.config.ts
  packages/
    tokens/              色彩、排版、间距、圆角、阴影、动效、图表 Token
    ui/                  React Primitive 与通用组件
    patterns/            Shared Shell、Page、DataGrid、FilterBar、DetailSheet、Wizard 等
    app-core/            会话协议、capability、Telemetry、存储与跨应用跳转契约
    api-client/          生成类型、fetch client、错误标准化、query keys
    contracts/           前端领域类型、权限和路由元数据
    i18n/                七种语言资源、术语表和检查脚本
    testing/             MSW handlers、fixtures、render helpers
    config/              共享 TypeScript、lint、format 配置
  scripts/
    assemble-dist.ts     合并 site、console 与 admin 构建产物并检查路径冲突
  dist/                  最终可嵌入 Go 的产物
```

### 6.1 React 应用内部结构

```text
apps/console/src/
  app/
    bootstrap/
    providers/
    router/
    error-boundaries/
  routes/                只保留路由参数、权限、预取和页面引用
  features/
    api-keys/
      api/
      model/
      components/
      pages/
      __tests__/
    usage/
    billing/

apps/admin/src/
  app/
    bootstrap/
    providers/
    router/
    error-boundaries/
  routes/                只保留路由参数、权限、预取和页面引用
  features/
    channels/
    models/
    routing/
    pricing/
    customers/
    finance/
    operations/
    settings/
```

### 6.2 依赖方向

```text
apps -> patterns -> ui -> tokens
apps -> app-core
apps -> api-client -> generated OpenAPI types
features -> app-core
features -X-> other features internals
apps/console -X-> apps/admin
apps/admin -X-> apps/console
ui -X-> features
api-client -X-> React components
```

跨领域协作通过公开入口、领域事件或路由完成，禁止直接导入另一个 feature 的内部组件、store 或私有 API。

### 6.3 User Console 与 Admin Console 边界

| 维度         | User Console                                                                                 | Admin Console                                                            |
| ------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 正式路径     | `/console/*`                                                                                 | `/admin/*`                                                               |
| 目标用户     | 普通用户、API 开发者                                                                         | 管理员、运营、财务和超级管理员                                           |
| Router       | 独立 TanStack Router                                                                         | 独立 TanStack Router                                                     |
| RouteCatalog | 只包含自助服务和开发工具                                                                     | 只包含运营和管理能力                                                     |
| 全局搜索     | Key、用量、任务、文档和个人设置                                                              | 渠道、模型、用户、请求、价格、订单和系统设置                             |
| 构建产物     | `assets/console/*`                                                                           | `assets/admin/*`                                                         |
| 偏好存储     | 共享 `appearance_preferences_v1`，当前 User Shell 统一迁移到 `console_layout_preferences_v3` | 共享 `appearance_preferences_v1`，布局使用 `admin_layout_preferences_v1` |
| 会话         | 与 Admin 共享服务端登录会话                                                                  | 与 User Console 共享会话，但额外校验管理员 capability                    |
| 部署         | 默认与 Go 静态产物一起发布                                                                   | 默认一起发布，未来可单独域名、内网或零信任访问                           |

共享只发生在 `packages/`。两个应用不得互相 import 页面、feature、Router、Query Cache 或 Zustand Store。`packages/patterns` 可以提供同一套 `SharedConsoleShell`、`PageHeader`、`DataGrid` 和弹层 Pattern，但每个应用必须注入自己的导航、搜索 Provider、通知入口和账户菜单。

## 7. 产品信息架构

### 7.1 公共站点

```text
/
/models
/pricing
/rankings
/docs
/status
/about
/legal/terms
/legal/privacy
/auth/sign-in
/auth/register
```

公共模型详情默认使用 `/models?model=<id>`，避免静态构建时无法枚举动态模型 ID。旧动态链接由 Go 层或静态重定向映射到新地址。

### 7.2 开发者控制台

```text
/console                         个性化首页
/console/getting-started         接入向导
/console/integration             接入中心、端点与 SDK 示例
/console/playground              API Playground
/console/api-keys                API Key 管理
/console/models                  可用模型、能力与当前销售价格
/console/usage                   用量与成本分析
/console/logs                    请求日志与故障诊断
/console/tasks                   图片、视频、音频任务分类、四列卡片、分页与详情
/console/alerts                  预算、错误、延迟告警与平台状态
/console/billing                 余额、充值、订单、订阅
/console/team                    团队、角色与工作区权限
/console/account                 资料、用量通知、安全、登录会话、主题设置
/console/preferences             兼容旧链接，重定向到 /console/account?tab=theme
```

### 7.3 管理控制台

```text
/admin                            管理员工作台
/admin/gateway/channels
/admin/gateway/routing
/admin/gateway/probes
/admin/catalog/models
/admin/catalog/deployments
/admin/pricing/official
/admin/pricing/purchase
/admin/pricing/price-books
/admin/pricing/reconciliation
/admin/operations/overview
/admin/operations/incidents
/admin/operations/usage
/admin/operations/system
/admin/customers/users
/admin/customers/subscriptions
/admin/customers/redemptions
/admin/finance/overview
/admin/finance/transactions
/admin/settings/site
/admin/settings/auth
/admin/settings/billing
/admin/settings/security
/admin/settings/integrations
/admin/settings/maintenance
```

### 7.4 应用切换与隔离规则

- 普通用户只进入 `/console/*`，HTML、导航和搜索结果中不出现 Admin 入口。
- 具有管理员 capability 的用户在账户菜单中看到“进入管理后台”；该动作导航到 `/admin`，不是在同一侧栏中切换菜单分组。
- Admin Console 提供“返回用户中台”，共享登录会话、语言和 Theme Mode；侧栏状态、密度、保存视图和搜索历史分别存储。
- 两个应用之间只通过完整 URL 和显式参数传递上下文，例如从 User 360 打开某个用户的请求筛选；不得共享页面内存 state。
- 从一个应用跳转到另一个应用前，如存在未保存表单，必须先完成离开确认。
- Admin Console 首屏必须调用管理员 bootstrap/capability 校验；失败时 fail closed。前端资源隔离不是安全边界，所有管理 API 继续由 Go 强制授权。
- 不提供默认的静默“模拟用户登录”。确需客服代查时使用只读用户视角或短时、可审计的 support session，并单独立项。

### 7.5 导航规则

- 顶栏只包含：应用入口、当前应用内全局搜索、通知、帮助和账户。
- 左侧栏只显示当前应用的一级任务，不混排用户功能和管理员功能。
- 三级及以下导航进入页面内部，不继续嵌套侧栏。
- 导航、面包屑、命令面板、权限和预加载均来源于统一 `RouteCatalog`。
- 服务端模块开关和用户 capability 只过滤可见入口；路由进入时仍再次检查。
- User Console 和 Admin Console 分别维护 RouteCatalog；共享 Route 类型和 capability 结构，不共享菜单数据。

## 8. 角色、权限与能力模型

前端不直接在页面中散落 `role >= 10` 一类判断，而使用 capability：

```ts
type Capability =
  | "apiKeys.read"
  | "apiKeys.write"
  | "channels.read"
  | "channels.write"
  | "pricing.read"
  | "pricing.approve"
  | "finance.export"
  | "system.maintain";
```

权限流程：

1. 登录或刷新会话时获取用户、角色和 capability 集合。
2. User Console 和 Admin Console 分别加载自己的 bootstrap 与 `RouteCatalog`；Admin bootstrap 无管理 capability 时直接拒绝进入。
3. 路由 `beforeLoad` 负责前端快速拦截。
4. 按钮和批量操作根据 capability 禁用或隐藏。
5. Go API 继续作为最终授权边界。
6. 403 响应必须区分“无权限”“功能关闭”和“会话过期”。

## 9. 核心交互规范

### 9.1 应用 Shell

- User Console 和 Admin Console 使用同一套 Studio Admin Shared Shell 组件与视觉 Token，但各自拥有独立的 AppSidebar、RouteCatalog、Search Provider、通知数据源和业务 Slot。
- 桌面端：固定顶栏、可折叠侧栏、独立内容滚动区。
- 移动端：顶栏 + Drawer 导航；不得依赖 hover 才能完成任务。
- 应用切换不会改变登录状态和语言，但属于 `/console` 与 `/admin` 之间的完整路由跳转。
- `Cmd/Ctrl + K` 只搜索当前应用允许的页面、实体和动作；User Console 不得返回管理员对象。
- `Cmd/Ctrl + /` 打开快捷键帮助。
- 切换页面时保留未完成筛选；有未保存表单时必须确认。
- Shared Shell 固定包含：`SidebarProvider`、`SidebarInset`、`Header`、`SearchDialog`、`LayoutControls`、`ThemeSwitcher`、通知/状态入口和 `AccountSwitcher`；`AppSidebar` 与 Search Provider 由当前应用注入。
- 原模板 GitHub Repository 菜单替换为通知中心、系统状态、帮助文档和语言入口；Support Card 替换为文档、社区或技术支持。
- 侧边栏菜单由当前应用的 RouteCatalog 生成，并经过登录角色、细粒度 capability、实例模块开关和用户级显示偏好四层过滤。
- 一级分组、二级折叠菜单、活动状态、Badge、图标折叠和移动端 Offcanvas 行为沿用模板交互。
- 右侧页面通过统一 Content Slot 渲染。普通页面使用标准 padding 和最大宽度；Playground、日志主从页、运行监控等页面允许声明 full-bleed，不复制 Shell。

### 9.2 标准页面结构

所有业务页面从以下模板中选择，不允许自由发明页面壳：

1. `OverviewPage`：结论卡片、异常、趋势和下一步动作。
2. `CollectionPage`：筛选、表格/卡片、批量操作、详情侧栏。
3. `EntityPage`：实体摘要、状态、标签页、事件和危险操作。
4. `TaskPage`：创建、导入、测试等聚焦任务。
5. `SettingsPage`：分组设置、搜索、保存状态和变更影响。
6. `AnalysisPage`：指标、图表、维度和时间范围。

页面头部统一包含：面包屑、标题、状态、说明、主操作和次级操作。一个视图只允许一个视觉主操作。

### 9.3 Collection 与 DataGrid

- 分页、排序、过滤、搜索和视图模式写入 URL。
- 服务端数据默认服务器分页；不把全量数据拉到客户端再分页。
- 筛选器支持“应用”“清空”“保存视图”和活动条件摘要。
- 列宽、隐藏列、密度等用户偏好使用带版本的本地存储。
- 批量操作仅在选中后出现，不长期占用工具栏。
- 点击行打开只读详情 Sheet；复杂编辑进入 TaskPage。
- 长文本提供复制、展开和可访问名称，不只依赖 Tooltip。
- 数据超过 200 行或单页 DOM 节点明显膨胀时启用虚拟化。

### 9.4 渠道创建与编辑

渠道配置改为独立四步流程：

1. **身份**：渠道类型、名称、标签和启用状态。
2. **连接**：Base URL、密钥、代理、区域和请求头。
3. **能力**：模型、分组、优先级、权重、参数覆盖和路由规则。
4. **验证**：连接测试、模型探测、风险提示、变更摘要和提交。

规则：

- 每一步都能独立校验并保存草稿。
- 服务端字段错误必须定位到步骤和字段。
- 测试结果包含耗时、状态、响应摘要、request ID 和建议。
- 密钥不会通过 URL、日志、埋点或持久化 store 泄露。
- 编辑已上线渠道时显示本次变更与当前配置的 diff。
- 高风险变更要求输入实体名称确认，并展示影响范围。

### 9.5 系统设置

- 设置页支持全局搜索，结果定位到设置项而非仅定位页面。
- 每个设置项有名称、说明、当前值、默认值、影响和文档链接。
- 同一页面只提交变化字段。
- 页面底部使用固定 Unsaved Changes Bar，包含保存、放弃和变更数量。
- 保存前展示验证错误；高风险设置展示影响预览。
- 如果后端未来提供配置版本，V2 直接接入历史、diff 和回滚；首期不在前端伪造版本历史。

### 9.6 状态与反馈

- 页面级加载使用结构 Skeleton；按钮加载使用 Spinner 并禁用重复提交。
- Toast 只用于短暂反馈，业务错误和下一步动作必须留在页面中。
- 空状态分为：首次使用、筛选无结果、无权限、功能关闭和数据异常。
- 错误信息包括用户能做什么；技术详情和 request ID 放在可展开区域。
- 乐观更新只用于易回滚、低风险操作；计费、权限和渠道配置不做无条件乐观提交。
- 长任务使用进度、轮询或 SSE，并允许离开页面后从通知中心恢复。

### 9.7 弹层选择规则

| 任务               | 组件                |
| ------------------ | ------------------- |
| 简单输入任务       | Dialog              |
| 破坏性确认         | AlertDialog         |
| 只读详情、辅助筛选 | Sheet               |
| 移动端底部操作     | Drawer              |
| 复杂创建/编辑      | 独立 TaskPage       |
| 小型上下文信息     | Popover / HoverCard |

所有 Dialog、Sheet、Drawer 必须有可访问标题和关闭路径。

### 9.8 关联实体管理

V2 不以“一个数据库表对应一个管理页面”为默认设计单位，而以**业务聚合、管理任务和一致性边界**为页面单位。数据库关系用于理解数据，运营人员要完成的任务决定最终界面。

- Collection 行点击默认进入实体工作台或主从详情，不再只弹出字段编辑框。
- 实体页必须展示关键关联数量、状态和快捷入口，例如渠道关联模型、路由、探测、用量和采购价。
- 高频关联使用页内 Tabs、主从视图或上下文侧栏；低频关联使用 Linked Records Sheet，不把所有关系都堆进同一页面。
- 只有模型、渠道、路由、定价等确实需要理解依赖路径的场景才使用关系图；普通外键关系用摘要卡和关联表即可。
- 状态变化、删除、批量调整、发布价格等跨表操作必须先展示影响预览，再由服务端执行领域命令；前端不得自行串行修改多个表。
- 不可变价格版本、请求价格快照、支付回调等对象使用时间线、版本 diff 和审计视图，不提供伪 CRUD 编辑。
- 关联对象已删除、重命名或位于独立日志库时，界面保留快照名称并明确标记“历史引用”或“当前对象不可用”。
- 关系展示必须区分直接关联、逻辑关联、快照引用和聚合统计，避免把同名字段误认为实时外键。

Phase 0 必须先完成实体关系、现有管理动作和跨表业务流程盘点，详细执行基线见 [`frontend-v2-phase-0-domain-inventory.zh_CN.md`](./frontend-v2-phase-0-domain-inventory.zh_CN.md)。

## 10. 设计系统

### 10.1 视觉方向

产品视觉关键词：**安静、可信、数据优先、操作明确**。

- 公共站点可以表达品牌，但避免大面积无意义渐变和持续动画。
- 控制台以信息层级、状态和可扫描性为主，不以装饰性卡片堆叠为主。
- 同一页面最多使用一个主品牌色；成功、警告、错误颜色只表达语义。
- 密集表格和设置页提供 Compact / Comfortable 两档密度。
- 明暗模式都必须通过对比度和图表辨识测试。

### 10.2 Token 分层

```text
primitive: gray-*, blue-*, red-*, spacing-*, font-size-*
semantic: background, surface, text, border, action, success, warning, danger
component: button-primary-bg, grid-header-bg, sidebar-active-bg
```

组件只能消费 semantic 或 component token。业务代码不能直接使用 `blue-500`、固定 hex 或任意阴影值。

Token 至少覆盖：

- 背景、表面、弹层和遮罩；
- 主/次/弱文本；
- 默认、强调和焦点边框；
- 主操作、成功、警告、错误和信息；
- 图表分类色、连续色和异常色；
- 字体、字号、行高、字重；
- 4px 基础间距系统；
- 圆角、阴影、层级；
- 动效时长和 easing；
- z-index 层级协议。

### 10.3 组件分层

1. **Primitive**：Button、Input、Dialog、Select、Tabs 等，不包含业务。
2. **Pattern**：PageHeader、DataGrid、FilterBar、DetailSheet、Wizard、FormSection、MetricCard、StatePanel。
3. **Domain**：ChannelStatus、ModelSelector、QuotaDisplay、PricingRuleEditor。
4. **Page**：只负责组合 Pattern 和 Domain 组件。

`packages/ui` 和 `packages/patterns` 通过自有 shadcn registry 分发，源码保留在仓库中。每个组件必须具备：

- API 文档和最小示例；
- loading、empty、error、disabled、read-only 状态；
- 键盘和焦点说明；
- 明暗模式；
- 英文、中文、长文本和 RTL 容错样例；
- Storybook story；
- 行为测试，关键组件增加视觉回归。

### 10.4 主题能力

V2 保留 Studio Admin 的动态外观与布局设置，并将其视为 Console Shell 的正式产品能力，而不是仅供演示的开发工具。

| 偏好                  | 可选值                                     | V2 默认值   | 说明                                         |
| --------------------- | ------------------------------------------ | ----------- | -------------------------------------------- |
| Theme Mode            | Light / Dark / System                      | System      | 跟随系统且允许手动覆盖                       |
| Theme Preset          | Default / Brutalist / Soft Pop / Tangerine | Default     | 每套预设必须覆盖明暗模式和完整语义 Token     |
| Font                  | V2 字体 Registry 中的可用字体              | Geist       | 只加载当前字体，避免全量字体进入首屏         |
| Content Layout        | Centered / Full Width                      | Centered    | 数据密集页可自行请求 Full Width              |
| Navbar Behavior       | Sticky / Scroll                            | Sticky      | 全屏工作台可覆盖为 Scroll 或隐藏             |
| Sidebar Style         | Sidebar / Inset / Floating                 | Sidebar     | 保留模板三种外观                             |
| Sidebar Collapse Mode | Icon / Offcanvas                           | Icon        | 桌面端默认 Icon；移动端统一 Drawer/Offcanvas |
| Density               | Compact / Comfortable                      | Comfortable | Token Boat 增补，用于表格、设置和详情页      |

设置面板提供实时预览和 Restore Defaults。Theme Mode、Theme Preset 和 Font 写入共享、带版本的 `appearance_preferences_v1`；Content Layout、Navbar、Sidebar 和 Density 分别写入 User/Admin 布局 Store，防止管理后台的密集布局改变用户中台。应用启动时在 React 挂载前同步根元素的 `data-*` 属性和 `.dark` class，避免主题闪烁和布局跳动。未来如需要跨设备同步，可增加用户偏好 API，但本地偏好不得与管理员系统设置混存。

主题预设只能修改语义 CSS Variables，包括 background、foreground、card、primary、accent、border、ring、chart 和 sidebar Token。页面组件不得根据预设名称编写条件样式。Logo、系统名称、favicon 和租户品牌色属于管理员品牌配置；Theme、Font、Layout、Sidebar 和 Density 属于当前用户外观偏好，两类设置必须分离。

### 10.5 shadcn / Base UI 实现约束

V2 使用 `base-nova`，组件 API 以项目 `components.json` 和 `bunx --bun shadcn@latest info --json` 的实际输出为准。Studio Admin 的 Next 主仓库当前使用 Radix API，V2 只把它作为视觉与交互基线；代码优先取同作者 Base UI/TanStack 版本，或按 Base UI API 移植，不得直接复制 `asChild` 等 Radix 写法。

- 优先使用项目已安装组件；新增官方组件通过 shadcn CLI 添加，不手工下载 GitHub Raw 文件。
- 业务页面不得重复实现 shadcn 已提供的交互控件；日期区间统一采用官方 Date Picker 组合，即 `Popover + Calendar(mode="range")`，快捷范围使用 `ToggleGroup`。
- 不整体复制或覆盖 Donor Repository 的 `components/ui`；页面迁移只引入缺失的组合组件。
- 更新已有组件前必须使用 `--dry-run` 和 `--diff` 检查本地修改，不允许未经确认使用 `--overwrite`。
- Base UI 的自定义 Trigger 使用 `render`；渲染为非 Button 元素时同时设置 `nativeButton={false}`。
- 表单使用 `FieldGroup`、`Field`、`FieldLabel`、`FieldDescription` 组织；校验状态同时提供 `data-invalid` 和 `aria-invalid`。
- `SelectItem`、`DropdownMenuItem`、`CommandItem` 等必须放在相应 Group 中；Dialog、Sheet、Drawer 必须有可访问标题。
- 空状态、提醒、加载、分隔、状态标签分别使用 `Empty`、`Alert`、`Skeleton`/`Spinner`、`Separator`、`Badge`，不重复编写相同用途的样式容器。
- 业务组件只消费语义颜色，不直接使用 Tailwind 红、绿、黄、蓝状态色；明暗主题不通过页面级手写 `dark:` 颜色修补。
- 布局间距使用 `gap-*`，不使用 `space-x-*`/`space-y-*`；条件类统一通过 `cn()` 合并。
- 图标库由 V2 脚手架一次性确定；Button 内图标使用 `data-icon`，不附加尺寸和 margin 类。

### 10.6 第三方页面模板准入流程

每个模板页面都必须以独立迁移单元进入 V2：

1. 记录来源仓库、提交 SHA、原文件和许可证。
2. 标注采用范围：直接迁移、二次开发、仅参考布局或放弃。
3. 列出依赖、Mock 数据、全局 Store、浏览器 API、Server Function 和样式副作用。
4. 先在隔离分支移植页面级组件，不覆盖 Primitive。
5. 替换路由、数据、权限、i18n、图标、图表和语义 Token。
6. 补齐 loading、empty、error、forbidden、disabled、长文本和移动端状态。
7. 添加交互、响应式、键盘和可访问性测试后才可进入正式 feature。
8. 在组件账本中记录保留、重写和删除的原始模块，避免形成无人维护的半复制代码。

模板代码的“能够渲染”不构成验收。只有接入真实 API、服务端分页、权限、七语言、错误契约和测试后，才视为完成迁移。

## 11. API 与数据架构

### 11.1 OpenAPI 为前端契约源

目标流程：

```text
Go handler/DTO
  -> OpenAPI 3.1 文档
  -> openapi-typescript
  -> generated paths/components types
  -> openapi-fetch client
  -> domain adapter
  -> TanStack Query options
  -> page
```

生成文件禁止手工修改。CI 必须检查：

- OpenAPI 能成功解析；
- 重新生成后 Git diff 为空；
- V2 已使用 endpoint 的 request/response 都有 schema；
- 错误响应、分页和 nullable 字段含义明确。

### 11.2 Domain Adapter

页面不直接使用后端原始响应。每个 feature 提供 adapter：

```ts
type ChannelSummary = {
  id: number;
  name: string;
  provider: ProviderCode;
  health: "healthy" | "degraded" | "offline" | "unknown";
  enabled: boolean;
};
```

Adapter 负责：

- 处理兼容字段和后端历史命名；
- 把时间、金额、额度和枚举转成领域类型；
- 保留显式 `0`、`false` 和空字符串语义；
- 在关键边界进行 Zod 运行时验证；
- 把服务端错误映射成统一 `AppError`。

### 11.3 Query 规范

每个领域导出 query options 和 key factory：

```ts
const channelKeys = {
  all: ["channels"] as const,
  list: (filters: ChannelFilters) => [...channelKeys.all, "list", filters] as const,
  detail: (id: number) => [...channelKeys.all, "detail", id] as const,
};
```

- 路由 loader 使用 `ensureQueryData` 预取首屏数据。
- 独立请求并行发起，禁止可避免的 waterfall。
- mutation 明确声明失效范围，不允许全局 `invalidateQueries()`。
- 轮询仅在页面可见且任务未完成时运行。
- 大查询结果不持久化到 localStorage。
- 用户切换、登出或会话变化时清理用户级缓存。

### 11.4 状态归属

| 状态                     | 存放位置                        |
| ------------------------ | ------------------------------- |
| 服务端实体、列表、统计   | TanStack Query                  |
| 搜索、分页、过滤、Tab    | URL search params               |
| 输入、校验、提交         | React Hook Form                 |
| 弹层开关、当前选中       | 页面局部 state                  |
| 主题、语言、密度         | 带版本的 preference storage     |
| 登录会话摘要、capability | Auth context/store，内存为主    |
| 长任务进度               | Query/SSE + notification center |

User Console 与 Admin Console 分别创建 QueryClient、Router 和客户端 Store。应用切换后重新执行 bootstrap，不把用户中台缓存直接带入管理员后台。生成的 OpenAPI 类型可以共享，但 Domain Adapter、query key 和 mutation 必须归属各自应用或共享领域 package，不能从另一个应用的 feature 导入。

### 11.5 领域聚合与关联查询 API

V2 页面不得为了拼出一个实体详情，在浏览器中并发拉取大量分页接口后自行做跨表 Join。后端应按管理任务提供只读聚合接口和领域命令，同时保留细粒度资源接口供独立列表使用。

推荐契约形态：

```text
GET  /api/admin/channels/{id}/workspace
GET  /api/admin/models/{id}/commercialization
GET  /api/admin/users/{id}/overview
GET  /api/admin/requests/{request_id}/trace
GET  /api/admin/finance/orders/{trade_no}/case
POST /api/admin/.../impact-preview
POST /api/admin/.../commands/{action}
```

要求：

- 聚合响应只返回首屏摘要和有限数量的最近记录，大列表通过独立分页子资源加载。
- 关联对象统一返回稳定 ID、展示名、状态、是否仍存在和当前用户可执行 capability。
- 写操作使用表达业务意图的 command，由服务端负责事务、锁、缓存失效、审计和跨数据库兼容。
- 高风险 command 提供 `impact-preview` 或 `dry_run`，返回受影响实体、阻断项、警告和预期状态变化。
- 价格、计费、支付和安全操作返回审计 ID；页面成功态可以直接打开对应时间线记录。
- 日志库与主数据库之间只做容错关联；缺失主实体不得导致历史追踪页面整体失败。
- 聚合接口的 schema、权限、分页上限、快照语义和数据新鲜度必须进入 OpenAPI。

## 12. 认证、安全与隐私

- Access token 只保存在内存；不得写入 localStorage、URL 或日志。
- Refresh/session 使用 HttpOnly、Secure、SameSite Cookie；延续后端 Origin/CSRF 防护。
- 所有登录、刷新、登出、2FA 和 Passkey 请求禁止缓存。
- User Console 与 Admin Console 可以共享 HttpOnly 会话 Cookie；进入 Admin 和执行定价发布、财务处置、权限、密钥、系统维护等高风险操作时，服务端可以要求更短空闲超时或 step-up authentication。
- 认证启动状态必须明确区分 checking、authenticated、anonymous 和 expired。
- 多标签页通过 BroadcastChannel 同步登录和登出事件，不同步 token 内容。
- 服务端返回 HTML 的区域默认按纯文本显示；确需 HTML 时使用严格 allowlist 消毒。
- 错误上报默认移除 Authorization、Cookie、API Key、Prompt、响应正文和支付信息。
- Secret 输入默认遮挡，不自动回填完整密钥；复制动作需要明确反馈。
- 外部链接统一增加 `noopener noreferrer`。
- 发布产物启用 CSP、`X-Content-Type-Options`、合理 Referrer Policy 和 frame 限制。
- Source map 不公开托管；只上传到受控错误平台或作为私有构建制品。

## 13. 国际化

### 13.1 资源组织

```text
packages/i18n/locales/
  en/
    common.json
    channels.json
    billing.json
  zh/
```

- Key 使用稳定语义路径，不使用整句英文作为 key。
- 领域术语进入共享 glossary。
- 数量、复数、性别和插值使用 ICU message。
- 日期、时间、数字、金额和百分比必须使用 locale formatter。
- UI 布局必须覆盖英文长文本和中文无空格文本。
- 公共站点为语言页面生成 canonical 与 `hreflang`。
- 默认语言 URL 不强制前缀；英文公共页面未来统一使用 `/en/...`，Console 通过用户偏好切换。
- Console 语言优先读取用户本地选择；没有已保存选择时默认简体中文（`zh`），不跟随浏览器语言自动切换。

### 13.2 CI 检查

- 缺失 key；
- 多余和废弃 key；
- 未通过翻译函数渲染的用户文案；
- ICU message 语法；
- glossary 禁用词；
- 七种语言页面基本渲染测试。

## 14. 可访问性与响应式

目标为 WCAG 2.2 AA。

- 所有功能可通过键盘完成。
- 焦点顺序与视觉顺序一致；弹层关闭后焦点返回触发器。
- 只有在原生语义不足时使用 ARIA。
- 文字对比度至少 4.5:1；大文字至少 3:1。
- 焦点状态不能只依赖颜色。
- 图表必须提供标题、单位、摘要和可访问数据表入口。
- 状态不能只靠红绿区分。
- 动效支持 `prefers-reduced-motion`。
- 最小支持 320px 宽度；重要任务不得要求横屏。
- 表格在小屏上保留主列和操作，其余信息进入详情 Sheet。
- 触控目标原则上不小于 44×44 CSS px。
- Chromium + NVDA、Safari + VoiceOver 是发布前人工抽检组合。

## 15. 性能架构与预算

### 15.1 公共站点预算

- 普通静态页面初始 JS：0～50 KB gzip。
- 带价格/搜索 Island 的页面初始 JS：不超过 150 KB gzip。
- 初始 CSS：不超过 40 KB gzip。
- LCP p75 < 2.5s；INP p75 < 200ms；CLS p75 < 0.1。

### 15.2 User/Admin Console 预算

- 登录页初始 JS：不超过 220 KB gzip。
- User Console Shell 与 Admin Console Shell 分别计算，包括 React、Router、Query 和基础 UI：每个不超过 350 KB gzip。
- User Console 的入口和路由 chunk 不得引用 Admin feature；普通用户访问 `/console` 时 Admin 业务代码网络传输为 0。
- 普通路由增量：不超过 200 KB gzip。
- 编辑器、图表、Flow 等重型路由增量：不超过 500 KB gzip，并必须在用户意图时预取。
- 首屏 API 请求不超过 6 个；独立请求并行。
- 关键导航在正常网络下 300ms 内出现稳定页面骨架。

### 15.3 强制策略

- 路由自动分包。
- CodeMirror、ECharts、Flow、Markdown、KaTeX、QR、导出等按功能动态导入。
- 第三方日志与分析在首屏可交互后加载。
- 图标和大型库使用直接路径导入，禁止聚合 barrel 导入。
- 页面不可从 `packages/ui/index.ts` 一次性导入全部组件。
- 图片声明尺寸并使用现代格式；公共站点响应式生成。
- 静态资源文件名带 hash，使用一年 immutable cache；HTML 使用 no-cache。
- CI 对每个 entry 和 route chunk 执行 bundle budget 检查。
- 真实 Web Vitals 按版本、路由、设备和地区聚合，禁止采集页面业务内容。

## 16. 测试策略

### 16.1 测试金字塔

| 层级               | 目标                             | 工具                           |
| ------------------ | -------------------------------- | ------------------------------ |
| Domain 单元测试    | 金额、额度、权限、过滤、状态机   | Vitest                         |
| Component 行为测试 | 表单、弹层、表格、键盘、错误状态 | Testing Library                |
| API 集成测试       | 查询、mutation、错误、重试、缓存 | MSW + Vitest                   |
| Route 集成测试     | 权限、参数、预取、错误边界       | Router test harness            |
| E2E                | 用户完整任务                     | Playwright                     |
| 视觉回归           | Shell、关键页面、明暗模式、语言  | Playwright screenshot          |
| 契约测试           | OpenAPI 与客户端生成一致         | OpenAPI validation + typecheck |

### 16.2 发布前关键 E2E

至少覆盖：

1. 首次安装与创建管理员；
2. 注册、登录、2FA、Passkey 和 OAuth 回调；
3. 创建、编辑、禁用和删除 API Key；
4. Playground 发起流式请求并处理中断/错误；
5. 查看用量、日志和任务详情；
6. 充值、支付返回和订阅购买；
7. 创建渠道、连接测试、模型探测和启用；
8. 修改模型元数据和部署；
9. 配置采购价、销售价本和对账；
10. 用户管理、权限变化和会话失效；
11. 系统设置修改、放弃和高风险确认；
12. 中英文切换、暗色模式和移动端关键路径。

### 16.3 测试原则

- 测用户能观察到的行为，不测组件内部 state 或函数调用次数。
- Bug 修复先补稳定失败用例。
- 不用固定 sleep；等待可观察状态。
- MSW handler 同时服务测试、Storybook 和本地无后端开发。
- E2E 只 mock 外部支付/OAuth 等不可控边界，核心 Go API 使用真实测试环境。
- 视觉快照只覆盖稳定布局，不把所有 Tailwind class 当快照契约。

## 17. 可观测性

每个前端事件附带：

- release/version；
- route ID；
- `app_id`：site / user-console / admin-console；
- 匿名会话 ID；
- 后端 request ID；
- 浏览器和设备等级；
- 网络与 Web Vital；
- 错误类别和可恢复性。

不得附带：Prompt、模型响应、API Key、Cookie、Authorization、支付卡数据、完整电子邮件和用户自定义秘密字段。

必须建设以下 Dashboard：

- JS 错误率和受影响用户数；
- 资源加载失败；
- API 错误率和超时；
- 登录、创建 Key、创建渠道、充值等关键漏斗；
- Core Web Vitals；
- 各版本错误趋势；
- 新旧前端灰度对比。

## 18. 构建、部署与缓存

### 18.1 构建流程

```text
bun install --frozen-lockfile
bun run contracts:generate
bun run typecheck
bun run lint
bun run test
bun run build:site
bun run build:user-console
bun run build:admin-console
bun run build:assemble
bun run build:verify
```

`build:assemble` 产出：

```text
frontend/dist/
  index.html                  Astro 首页
  pricing/index.html
  docs/index.html
  auth/index.html             User Console 的共享认证入口
  console/index.html          User Console SPA 入口
  admin/index.html            Admin Console SPA 入口
  assets/site/*
  assets/console/*
  assets/admin/*
```

### 18.2 Go Web Router 调整

新 Web Router 按以下顺序处理：

1. `/api/*`、`/v1/*` 和 relay 路由继续由 API Router 处理。
2. 存在的静态文件直接返回。
3. `/console/*`、`/auth/*` 返回 User Console 的 `index.html`。
4. `/admin/*` 返回 Admin Console 的 `index.html`；API 权限仍由后端独立校验。
5. 已知公共页面返回 Astro 生成的 HTML。
6. 旧路由根据迁移表进行临时或永久重定向。
7. 其他地址返回公共 404，不再把全部未知路径都返回 SPA 200。

缓存规则：

- Hash asset：`Cache-Control: public, max-age=31536000, immutable`；
- HTML：`Cache-Control: no-cache`；
- 登录和用户相关响应：`no-store`；
- Service Worker 首期不启用，避免多版本静态资源缓存问题。

### 18.3 部署模式

| 模式            | 说明                                                             |
| --------------- | ---------------------------------------------------------------- |
| Embedded        | 默认模式；`frontend/dist` 嵌入 Go 二进制                         |
| External static | 通过 `FRONTEND_BASE_URL` 托管到 CDN/对象存储                     |
| Electron        | Electron 加载本地 Go 服务的 `/console`                           |
| Development     | Site、Console 和 Go API 分别启动，通过 Vite/Astro proxy 访问 API |

### 18.4 迁移期产物隔离

当前生产链路是 `web → web/dist → Go //go:embed web/dist → 当前 Docker 镜像`。在最终切换批准前，这条链路保持不变。

V2 使用另一条旁路链路：

```text
frontend/apps/site + frontend/apps/console + frontend/apps/admin
  → 独立 Bun CI Jobs
  → frontend/dist
  → V2 Preview Image / Static Preview
  → 独立 staging 域名
```

规则：

- V2 Preview Image 不覆盖、挂载或复制文件到 `web/dist`。
- V2 Preview 使用独立域名、CSP、OAuth Callback、支付 Sandbox 和环境变量。
- 开发与自动化测试先使用 MSW；集成测试只连接隔离的 staging API、脱敏数据库副本和独立 Redis。
- 禁止 V2 开发环境向生产数据库、生产 Redis、生产支付回调或生产 OAuth 应用发送写请求。
- 正式切换支持两种部署：有负载均衡时优先 Blue–Green；单机/嵌入式部署使用同一 Release 中的 Legacy/V2 双前端选择器。
- User/Admin 使用独立选择值，例如 `FRONTEND_CONSOLE_VARIANT` 与 `FRONTEND_ADMIN_VARIANT`，默认都为 `legacy`；只有切换操作才设置为 `v2`。选择器只改变静态资源和前端 fallback，不改变 `/api/*`、`/v1/*` 和 relay 路由。

## 19. 开发工作流

### 19.1 一个功能的标准交付顺序

1. Product brief：用户、问题、成功指标和非目标。
2. UX spec：流程、状态、键盘、响应式和错误恢复。
3. API contract：endpoint、schema、权限、分页、错误和 request ID。
4. Design system review：确认能否使用既有 Pattern；不能时先扩展 Pattern。
5. 测试用例设计：主路径、边界、失败、权限和可访问性。
6. 实现：route → query → domain → UI。
7. 验证：typecheck、lint、test、E2E、视觉、bundle。
8. 灰度：内部 → 小流量 → 全量。
9. 复盘：错误、性能、转化和用户反馈。

### 19.2 Definition of Ready

进入开发前必须具备：

- 页面归属和用户角色；
- 业务聚合根、关联实体、关系类型和一致性边界；
- 当前后台管理动作、跨表副作用和必须保留的业务不变量；
- 完整状态图；
- API schema 和错误定义；
- 权限 capability；
- i18n 文案；
- 设计稿覆盖桌面、移动、加载、空、错和禁用状态；
- 验收用例；
- 是否涉及计费或高风险配置的明确标记。

### 19.3 Definition of Done

- 功能、权限、响应式和键盘流程完成；
- 七种语言无缺失 key；
- 相关测试通过；
- OpenAPI 和客户端生成无漂移；
- bundle 未超预算；
- 错误和敏感信息经过审查；
- 埋点与 request ID 可观测；
- 文档、Story 和迁移矩阵已更新；
- 在 staging 使用真实 Go API 验证；
- 有明确回滚方式。

## 20. 迁移策略

### 20.1 原则

- 新代码不依赖旧 UI 组件。
- 只迁移经过测试证明正确的纯业务逻辑，例如金额格式、权限表达式和兼容映射。
- 旧路由和新路由通过显式迁移表关联。
- 所有写操作只发送一次；禁止 shadow write。
- 读取类页面可以在测试环境做新旧结果对比。
- 每个迁移单元必须能独立启用和回滚。

### 20.2 双轨运行

迁移期在隔离环境保留：

```text
生产域名 + 现有路径        旧前端，开发期唯一对外版本
V2 staging `/console/*`   User Console 内部预览
V2 staging `/admin/*`     Admin Console 内部预览
生产 `/console/*`         最终切换后的 User Console
生产 `/admin/*`           最终切换后的 Admin Console
```

实际路径在实施 ADR 中最终确定。推荐过程：

1. V2 只在本地、CI Preview 和隔离 staging 开放给内部人员。
2. 未完成全部功能矩阵和发布门槛前，不在生产域名增加 `/v2` 路由，也不让真实用户参与半成品灰度。
3. 全量开发完成后，在 staging 完成真实 API、浏览器、Electron、性能、安全和回滚演练。
4. 通过发布评审后才创建 Production Release Candidate，并使用 Blue–Green 或双前端选择器切换。
5. 切换后保留完整旧前端产物和旧实例；出现阻断问题直接回退，不在现场修补。
6. 连续观察至少两个发布周期后，才允许删除旧路由、旧构建链和兼容开关。

### 20.3 旧路由兼容

维护 `legacy-route-map.ts` 和对应 Go redirect table，至少包括：

- 精确旧路径；
- 新路径；
- query/params 转换；
- 是否需要登录；
- 临时 302 或永久 308；
- 删除日期。

外部可能引用的价格、OAuth、支付返回和法律链接至少保留 12 个月兼容。

### 20.4 零影响并行开发策略

| 层级     | 现有版本             | V2 开发期                              | 隔离要求                                             |
| -------- | -------------------- | -------------------------------------- | ---------------------------------------------------- |
| 源码     | `web/`               | `frontend/`                            | 不直接导入旧前端内部模块，不覆盖生成文件             |
| Git      | 当前稳定分支/工作区  | 独立 feature 分支或 worktree           | 当前紧急修复按明确流程同步，不混合未完成 V2 变更     |
| 依赖     | `web/bun.lock`       | `frontend/bun.lock`                    | 不共享 `node_modules`、锁文件或脚本副作用            |
| 构建     | `web/dist`           | `frontend/dist`                        | 现有 Go embed 和 Docker Release Job 在切换前保持原样 |
| 运行     | 当前生产域名         | 独立本地端口和 staging 域名            | 不在生产 Router 暴露半成品路由                       |
| API      | 当前稳定契约         | Mock → staging API → Release Candidate | 新接口只做向后兼容扩展，不改变旧接口语义             |
| 数据     | 生产 DB/Redis        | 脱敏 DB 副本、独立 Redis 和对象存储    | 禁止开发环境写生产数据                               |
| 外部集成 | 生产 OAuth/支付/回调 | 独立应用、Sandbox 和 Callback Domain   | 生产密钥不进入 V2 环境                               |

如果 V2 需要后端或数据库变化，采用 Expand–Migrate–Contract：

1. **Expand**：只增加新 endpoint、新表、可空字段或兼容索引；旧前端和旧后端仍可正常工作。
2. **Migrate**：只在 staging 完成数据迁移、回放和兼容验证；生产迁移在批准的切换流程中执行。
3. **Switch**：新旧后端都能读取扩展后的 schema，完成前端流量切换。
4. **Contract**：观察期结束后另开版本删除旧字段、旧 endpoint 和旧代码，切换版本内禁止破坏性清理。

不得为验证新前端执行生产 shadow write、双写或自动修复。只读结果对比也优先使用 staging 快照；确需生产只读观测时必须单独审批并脱敏。

### 20.5 最终切换与回滚 Runbook

切换前门槛：

- 功能迁移矩阵 100%，不存在只能在旧前端完成的任务；
- 关键 E2E、七语言、浏览器、移动端、Electron、权限、可访问性、性能和安全检查全部通过；
- staging 使用脱敏生产数据规模完成至少一个完整观察周期；
- 数据库迁移已验证向后兼容，旧版本可在新 schema 上继续运行；
- 旧 URL、OAuth、支付返回和外部链接重定向已验证；
- Blue–Green 流量回切或 User/Admin 两个 frontend variant 的独立回滚演练通过，并记录恢复时间。

推荐切换顺序：

1. 冻结 V2 Release Candidate，只接受阻断缺陷修复。
2. 备份数据库和当前配置，记录旧镜像、旧静态产物和校验值。
3. 部署 Green 环境或双前端 Release，保持生产流量仍在 Legacy。
4. 执行健康检查、只读 smoke 和关键写操作的受控验证。
5. 原子切换负载均衡目标或前端选择器到 V2。
6. 监控登录、API 错误、静态资源错误、关键任务、支付回调和 relay 指标。
7. 触发回滚门槛时立即回到 Blue/Legacy；不回滚数据库的前提是切换版本只使用向后兼容迁移。
8. 观察期结束后再规划旧前端删除，删除不与首次切换处于同一 Release。

单机、自托管和 Electron 没有外部负载均衡时，最终 Go Release 应同时保留 Legacy 与 V2 静态资源，通过启动配置选择入口。当前 `web/dist` embed 的替换和 Router fallback 调整只能在 Phase 7 的切换工作包中落地。

## 21. 分阶段路线图

### 21.0 当前旁路实施的优先级覆盖

下面 Phase 0～7 仍用于描述完整产品交付依赖，但当前 User Console 旁路开发采用以下实际排期：

1. **前端完成度优先**：使用 Demo Repository 和现有接口完成全部页面、交互、组件状态、响应式与测试，不伪造 Live 写入。
2. **现有接口联调其次**：逐页切换到 Live Repository，校验真实字段、权限、错误和空状态；能复用现有接口时不新增后端能力。
3. **后端扩展最后集中实施**：新增 Go endpoint、领域服务、数据表、迁移或索引的需求统一进入独立工作包，完成影响评审后再开发，并继续使用隔离数据库和旁路端口。
4. **发布切换仍为最终步骤**：后端扩展、支付/OAuth 外部环境和回归全部通过后，才进入 Legacy/V2 双入口、灰度、回滚和正式替换。

### Phase 0：立项与契约盘点，2 周

交付：

- 现有路由、页面、按钮、角色、权限和模块开关矩阵；
- 核心实体的直接关联、逻辑关联、快照引用和跨库引用关系图；
- 现有表格、表单、弹层、行操作、批量操作与后端写入副作用矩阵；
- 渠道、模型商业化、用户、请求追踪、价格治理和财务六个业务聚合的边界与状态图；
- 每个跨表写操作的影响范围、事务边界、缓存失效和审计要求；
- 前端实际调用 API 与 OpenAPI 差距报告；
- 12 条关键用户旅程；
- 当前性能、错误率和关键漏斗基线；
- 迁移风险登记表；
- 当前 Release 链路与 V2 Preview 链路的隔离清单；
- ADR-001 至 ADR-006 初稿，以及 ADR-011 零影响迁移初稿。

退出条件：所有现有页面都有负责人、目标业务聚合、迁移波次和删除条件；P0 领域的关联关系与写操作副作用已由后端负责人和实际运营人员共同确认。

### Phase 1：产品与设计系统，3～4 周

交付：

- 新信息架构，以及 User/Admin 两套 RouteCatalog；
- Channel Workspace、Model Commercialization、User 360、Request Trace、Pricing Governance 和 Finance Case 六个关联管理原型；
- 公共站点、用户中台、管理员后台高保真原型；
- Token v1；
- 30 个基础 Primitive；
- 10 个核心 Pattern；
- Shared Studio Admin Shell 的 1:1 交互原型、User/Admin 两种 Shell 配置、Donor Repository 组件账本，以及 Dashboard、Infrastructure、Mail、Profile、Chat 的迁移原型；
- Storybook、视觉回归和可访问性基线。

退出条件：登录、CollectionPage、EntityPage、TaskPage 和 SettingsPage 可在组件环境完整演示。

### Phase 2：工程底座，3 周

交付：

- Bun workspace；
- Astro Site、React User Console、React Admin Console 三个独立应用与构建；
- dist 合并和 Go Router 原型；
- OpenAPI 生成客户端；
- Shared Auth、User/Admin bootstrap、权限、i18n、主题、错误边界、Telemetry；
- 独立 V2 Preview Image、staging 域名、脱敏数据和外部集成 Sandbox；
- CI 全部门槛。

退出条件：User Console 和 Admin Console 空壳均可在独立 Preview Go Binary、外部静态预览和 Electron 测试包中打开；普通用户不下载 Admin feature；当前生产 `web/dist`、Go embed、Docker Release Job 和生产 Router 未改变。

### Phase 3：开发者黄金路径，4～5 周

本阶段只交付 User Console，不允许为了复用把 Admin feature 放入用户入口包。

范围：

- 安装向导；
- 注册/登录/2FA/Passkey/OAuth；
- 个性化首页；
- API Key；
- Playground；
- 用量和日志，其中日志采用 Mail 式主从详情布局；
- 余额、充值和订阅；
- 账户安全与会话。

Playground 保留现有流式请求、多模态、消息解析、AI Elements 和错误处理能力，只重构为“会话/预设 + AI 对话 + 参数/调试”三栏工作台，不采用模板的客服业务模型，也不通过 iframe 嵌入。

退出条件：新用户可以从注册到完成第一次成功 API 调用，并能定位成本和错误。

### Phase 4：网关与模型管理，4～5 周

本阶段开始交付 Admin Console；登录会话与 Shared Shell 可复用，但 Router、导航、搜索、Query Cache 和 feature 独立。

范围：

- 渠道 Collection、Entity 和创建向导；
- 连接测试、模型探测和批量操作；
- 模型元数据与部署；
- 路由、熔断和渠道亲和；
- 管理员运行概览和告警，采用 Infrastructure 与 Patient Monitoring 的信息结构作为参考。

退出条件：管理员可以不进入旧前端完成日常网关运维。

### Phase 5：定价、客户与财务，4～5 周

范围：

- 官方价、采购价、销售价本；
- 折扣计算和对账，价格编辑器参考 Invoice 的“编辑 + 实时预览”结构；
- 用户和权限；
- 财务、充值记录、回调事件；
- 兑换码和订阅管理。

退出条件：商业运营全流程完成审计和金额显示回归。

### Phase 6：系统设置与次级功能，3～4 周

范围：

- Site、Auth、Billing、Security、Integrations、Maintenance；
- 公共站点完整页面；
- 排名、社区、法律、关于；
- Chat、Chat2Link 等次级工具的最终去留和迁移。

退出条件：功能矩阵达到 100%，没有只能通过旧 UI 完成的配置。

### Phase 7：全量与清理，2～3 周

交付：

- 全浏览器 E2E、性能、可访问性和安全复核；
- 在功能和测试全部完成后执行 Blue–Green/双前端 Release；可观测条件允许时再进行 10% → 30% → 60% → 100% 的切换期流量验证，不向用户暴露未完成功能；
- User Console 与 Admin Console 使用独立切换开关和回滚指标；Release Candidate 必须同时完成，实际切换顺序可先 Admin 内部验证、再切 User Console；
- 旧路由重定向；
- 首次切换 Release 保留旧依赖、旧构建链和旧页面；观察期结束后另开清理 Release；
- 运维手册和回滚演练；
- 发布后数据复盘。

## 22. 团队与职责

| 角色               | 建议人数 | 主要职责                              |
| ------------------ | -------: | ------------------------------------- |
| Product Owner      |        1 | 范围、优先级、验收、关键指标          |
| UX Lead            |        1 | 信息架构、用户流程、研究、可用性测试  |
| Product Designer   |        1 | 视觉系统、原型、组件规范、设计 QA     |
| Frontend Architect |        1 | ADR、workspace、API、性能和代码审查   |
| Frontend Engineer  |        4 | 按领域交付页面和测试                  |
| QA Automation      |        1 | 测试矩阵、Playwright、发布验证        |
| Backend Engineer   |   0.5～1 | OpenAPI、错误契约、权限、必要接口调整 |
| SRE/DevOps         |     0.25 | 构建、静态缓存、Telemetry、灰度与回滚 |

推荐按领域组成两个交付小组，共享设计系统和架构负责人：

- Squad A：开发者体验、用量、计费、公共站点；
- Squad B：网关、模型、定价、运营和系统设置。

## 23. 项目治理

### 23.1 必须建立的 ADR

1. ADR-001：Site/User Console/Admin Console 三应用架构；
2. ADR-002：静态输出、Go embed 和 Router fallback；
3. ADR-003：Base UI + shadcn registry 设计系统；
4. ADR-004：OpenAPI codegen 与兼容策略；
5. ADR-005：认证、token 和跨标签页同步；
6. ADR-006：测试金字塔和发布门槛；
7. ADR-007：权限 capability 与 RouteCatalog；
8. ADR-008：i18n URL 和资源组织；
9. ADR-009：Telemetry 数据最小化；
10. ADR-010：旧版灰度、重定向和删除策略；
11. ADR-011：V2 零影响旁路开发、Blue–Green 切换和回滚策略。

### 23.2 评审机制

- 每周一次产品/设计/技术三方 scope review。
- 每周一次 Design System review，只处理跨领域 Pattern。
- 每个领域上线前完成 API、权限、计费和敏感信息专项检查。
- 每两周检查一次 bundle、Web Vitals、E2E 稳定率和 OpenAPI 覆盖率。
- 禁止以“临时页面”为由绕过 RouteCatalog、i18n、权限或测试。

## 24. 成功指标与发布门槛

### 24.1 产品指标

- 新用户从登录到首次成功 API 调用的中位时间降低 40%。
- API Key 创建成功率 ≥ 99%。
- 渠道创建后首次连接测试成功率提升 25%。
- 用户定位失败调用原因的中位时间降低 50%。
- 管理员完成常见渠道操作的点击/页面跳转数量降低 30%。
- 与导航、配置保存和权限相关的支持工单下降 30%。

### 24.2 工程门槛

- 关键功能矩阵覆盖 100%。
- 关键 E2E 在 staging 连续 20 次通过率 ≥ 98%。
- TypeScript、lint、format、unit、integration、E2E、OpenAPI diff 全部通过。
- 新增页面无阻断级 axe 问题。
- 性能满足第 15 节预算。
- V2 JS 错误率不高于旧版，关键 API 失败率无显著回归。
- 所有高风险写操作有确认、审计 request ID 和错误恢复路径。
- 生产镜像和 Electron 包均完成回滚演练。

## 25. 主要风险与缓解措施

| 风险                 | 影响                                     | 缓解                                                            |
| -------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| OpenAPI 不完整       | 前后端反复返工                           | Phase 0 先补已使用接口，按迁移波次完成契约                      |
| 隐藏功能遗漏         | 无法删除旧版                             | 建立页面/按钮/权限矩阵，旧版埋点识别真实使用                    |
| 双轨时间过长         | 维护成本翻倍                             | 每个领域设删除日期；不在旧版继续做纯视觉优化                    |
| 复杂表单失控         | 再次形成巨型组件                         | Schema、步骤状态机、FormSection 和领域 adapter 分层             |
| 设计系统过度抽象     | 延迟业务交付                             | 只有两个以上已确认用例才进入 Pattern；单一业务留在 Domain       |
| Bundle 再次膨胀      | 控制台体验下降                           | 路由预算、直接导入、重型库懒加载、CI 阻断                       |
| User/Admin 再次耦合  | 普通用户下载管理代码，发布和导航互相影响 | 独立 app、Router、RouteCatalog、QueryClient、构建和依赖边界检查 |
| 权限不一致           | 越权或入口混乱                           | 后端 capability、RouteCatalog、路由和 E2E 四层验证              |
| 计费展示错误         | 财务风险                                 | 金额/额度领域测试、后端值为准、禁止浮点自行推导                 |
| Electron 路由异常    | 桌面版不可用                             | Phase 2 即接入 Electron smoke，不留到最终阶段                   |
| 静态公共站点配置滞后 | 品牌/价格不及时                          | 稳定内容 SSG；运行时价格、状态和租户配置使用小型 Island         |

## 26. 前 30 天具体行动

### 第 1 周

- 建立 route/permission/API inventory；
- 从 GORM Model、查询和写操作提取实体关系、状态流转、删除约束、快照字段和跨库引用；
- 将每个现有管理入口映射到“页面 → 操作 → API → Service/Model → 受影响实体/缓存/审计”；
- 从旧前端和 Go Router 提取所有用户可见能力；
- 对 12 条关键任务录屏并记录当前步骤、耗时和错误点；
- 输出 OpenAPI 缺口列表；
- 确认浏览器、Electron 和部署支持矩阵。

### 第 2 周

- 完成 Site、User Console、Admin Console 三套信息架构与跨应用跳转规则；
- 由产品、后端、前端和实际运营人员评审六个业务聚合及其高频跨表任务；
- 为渠道、模型、用户、请求、价格和财务各完成一个桌面端关联管理低保真原型；
- 设计登录、API Key、渠道创建、日志定位四条流程；
- 用户和内部运营人员各进行至少 5 次可用性访谈/测试；
- 冻结 ADR-001、002、004、005。

### 第 3 周

- 创建 `frontend/` Bun workspace；
- 初始化 Astro Site、React User Console、React Admin Console 和共享 packages；
- 建立 Token、Button、Field、Dialog、DataGrid 基线；
- OpenAPI 生成第一个 typed client；
- 接入 Vitest、MSW、Playwright 和 CI。

### 第 4 周

- 完成可嵌入 Go 的构建合并；
- 实现 Auth Shell、Shared Console Shell、User/Admin RouteCatalog 和 capability bootstrap；
- 完成登录页、User Console 空首页和 Admin Console 空首页；
- 在 Electron 和外部静态部署模式运行同一产物；
- 提交第一个可演示的垂直切片。

## 27. 开工前必须确认的产品决策

以下决策不阻塞 RFC 评审，但必须在 Phase 0 结束前确认：

1. User Console 与 Admin Console 已决定拆成两个应用：分别使用 `/console/*` 和 `/admin/*`，共享会话与设计系统，不共享业务 Router 和 feature；Phase 0 只需确认旧 URL 映射。
2. 公共站点是产品营销站还是仅作为自托管实例门户；默认兼顾，但运行时租户内容通过 Island 加载。
3. Playground 是核心开发者能力，必须在 Phase 3 完成；管理员 Chat Preset 和 Chat2Link 是否保留为独立工具，在 Phase 0 结束前单独评审。
4. 是否需要组织/租户级工作空间；默认 V2 首期不新增，只预留 RouteCatalog 和 capability 维度。
5. 是否必须支持 RTL；默认不作为当前七语言硬门槛，但组件不得阻断未来 RTL。
6. 是否需要白标主题；默认只开放 Logo、名称、主色和明暗模式。
7. 浏览器基线；默认支持最近两个稳定版本的 Chrome、Edge、Firefox、Safari，以及 iOS Safari 近两个主版本。

## 28. 官方技术依据

- Astro 默认支持静态输出，并允许通过官方集成使用 React Island：<https://docs.astro.build/en/guides/framework-components/>、<https://docs.astro.build/en/reference/configuration-reference/>
- Astro 7 使用 Vite 8 和新的 Rust 编译链：<https://astro.build/blog/astro-7/>
- Vite 8 使用 Rolldown，并提供统一构建链和路由分包基础：<https://vite.dev/blog/announcing-vite8>
- TanStack Router 支持文件路由、类型安全 search params、intent preload 和自动代码分割：<https://tanstack.com/router/latest/docs/guide/code-splitting>
- Next.js 静态导出不包含依赖运行时服务器的能力：<https://nextjs.org/docs/pages/guides/static-exports>
- Base UI 提供无样式、可组合且遵循 WAI-ARIA 模式的 React Primitive：<https://base-ui.com/react/overview/about>、<https://base-ui.com/react/overview/accessibility>
- shadcn/ui 采用 open-code 和 registry 模型，适合作为自有组件系统的分发层：<https://ui.shadcn.com/docs>
- Console Shell 视觉与交互基线：<https://next-shadcn-admin-dashboard.vercel.app/dashboard/ecommerce>、<https://github.com/arhamkhnz/next-shadcn-admin-dashboard>
- Base UI/TanStack 页面实现 Donor Repository：<https://github.com/arhamkhnz/tanstack-shadcn-admin-dashboard>
- Donor Repository 组件配置与依赖：<https://github.com/arhamkhnz/tanstack-shadcn-admin-dashboard/blob/main/components.json>、<https://github.com/arhamkhnz/tanstack-shadcn-admin-dashboard/blob/main/package.json>
- 两个 Donor Repository 均采用 MIT License，迁移代码时必须保留相应许可证声明：<https://github.com/arhamkhnz/next-shadcn-admin-dashboard/blob/main/LICENSE>、<https://github.com/arhamkhnz/tanstack-shadcn-admin-dashboard/blob/main/LICENSE>
- openapi-typescript 可从 OpenAPI 3.0/3.1 生成无运行时代码的 TypeScript 类型：<https://openapi-ts.dev/introduction>
- MSW 的 handler 可在浏览器、测试和组件环境复用：<https://mswjs.io/>
- Playwright projects 可覆盖不同浏览器、设备和登录状态：<https://playwright.dev/docs/test-projects>

## 29. Studio Admin Console Shell 与页面复用审计

### 29.1 审计结论

本节包含两个不同层面的基准：

1. **Shared Console Shell 基准**：`next-shadcn-admin-dashboard` 在线 Demo。侧边栏、顶栏、全局搜索、主题与布局设置、账户入口和响应式外框原则上完整采用，分别组装到 User Console 与 Admin Console。
2. **页面实现 Donor**：与目标 Base UI 更兼容的 `tanstack-shadcn-admin-dashboard`，源码审计基准提交为 `9dc9372c04a057f96523c6c12ffbf6ccc104ebbc`。

审计日期为 2026-08-26。产品决策是“外框统一、内容可换”：不能因为某个右侧 Dashboard 组件不适合 Token Boat，就放弃已经成熟的 Shell；也不能因为采用 Shell，就默认迁移所有右侧页面。

本地审计确认：

- 生产构建成功，依赖安装时未报告已知安全漏洞；
- 约 307 个源码文件、214 个路由相关文件、61 个 UI Primitive，TypeScript/TSX 约 3.6 万行；
- 使用 React 19、TanStack Router/Start、Base UI、shadcn `base-nova`、Tailwind CSS v4；
- 当前项目与模板在 Base UI 和 shadcn 风格上高度兼容，但图标、图表、数据获取和构建运行时不同；
- 模板默认构建为 TanStack Start/Nitro Node SSR 产物，不满足 Go 单二进制静态嵌入目标；
- 模板没有自动化测试，页面主要依赖本地 Mock 数据和 Zustand，不包含 Token Boat 所需的 API、权限、i18n 和服务端分页；
- 源码中存在较多原始状态色、页面级 `dark:`、`space-*`、重复表格实现和大体积可选依赖，不能不经治理直接进入 V2。

因此，整体 Shell 和右侧内容采用不同复用等级：

| 层级                                       | 预估可复用比例 | 决策                                                                |
| ------------------------------------------ | -------------: | ------------------------------------------------------------------- |
| Base UI / shadcn Primitive                 |       70%～90% | 复用兼容概念，实际组件以 V2 registry 为准                           |
| Shared Console Shell、侧栏、顶栏、偏好设置 |       85%～95% | 作为两套新版应用壳的共同基线，按 Base UI 和 Token Boat 权限模型适配 |
| 页面布局与组合组件                         |       50%～75% | 主要价值，按页面迁移                                                |
| 图表、表格、表单实现                       |       30%～60% | 保留布局，接入 V2 统一内核                                          |
| 数据、权限、API 和业务逻辑                 |       低于 20% | 按 Token Boat 领域重写                                              |
| 整个模板代码库                             |    约 25%～35% | 不 Fork，不整体迁入                                                 |

### 29.2 Shared Console Shell 强制采用范围

| 模板能力                       | 采用决策           | Token Boat 适配                                                                                   |
| ------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------- |
| SidebarProvider / SidebarInset | 完整采用布局模型   | 保持内容区独立滚动、移动端 Drawer、桌面端折叠和 full-bleed 页面契约                               |
| AppSidebar                     | 完整采用视觉和交互 | User/Admin 分别注入 RouteCatalog；不共享菜单数据                                                  |
| NavMain                        | 完整采用           | 保留分组、二级折叠、活动状态、Badge、Tooltip 和 Icon Mode                                         |
| Header                         | 完整采用布局       | 左侧保留 Sidebar Trigger 和 Search；右侧放设置、主题、通知、语言、账户                            |
| SearchDialog                   | 完整采用交互       | User 搜索 Key、用量、任务和文档；Admin 搜索渠道、模型、用户、价格、订单和设置；分别经过权限过滤   |
| LayoutControls                 | 完整采用能力       | Theme Preset、Font、Mode、Page Layout、Navbar、Sidebar Style、Collapse、Density、Restore Defaults |
| ThemeSwitcher                  | 完整采用           | 提供 Light、Dark、System 快捷切换，与完整设置面板共享同一 Store                                   |
| AccountSwitcher                | 保留位置和菜单结构 | 接入真实用户、角色、账户设置和退出登录；管理员可在此进入 Admin 或返回 User Console                |
| GitHub Repositories Menu       | 替换               | 改为通知、系统状态、帮助文档和语言入口                                                            |
| Support Card                   | 二次开发           | 改为文档、社区、工单或系统告警摘要                                                                |

Shell 不得在各业务路由重复实现。目标组件边界为：

```text
SharedConsoleShell
├── appConfig
│   ├── UserConsoleConfig
│   └── AdminConsoleConfig
├── AppSidebar
│   ├── Brand / App Switcher
│   ├── CapabilityFilteredNavigation
│   ├── SupportOrStatusCard
│   └── UserMenu
├── ConsoleHeader
│   ├── SidebarTrigger
│   ├── GlobalSearch
│   ├── LayoutControls
│   ├── ThemeSwitcher
│   ├── Notifications / Status / Language
│   └── AccountSwitcher
└── ConsoleContent
    ├── StandardPageSlot
    └── FullBleedPageSlot
```

共享 Appearance Store 至少包含：`theme_mode`、`theme_preset` 和 `font`；User/Admin 各自的 Layout Store 包含 `content_layout`、`navbar_style`、`sidebar_variant`、`sidebar_collapsible` 和 `density`。所有值必须经过白名单解析；未知值回退默认值。外观切换通过根元素 class 和 `data-*` 属性驱动，不允许业务页面直接订阅全部偏好 Store。

这里的 Layout Controls 是当前用户的外观设置；Token Boat 的站点、认证、计费、安全、模型等 System Settings 仍然是右侧业务页面。两者名称、存储和权限边界不得混用。

### 29.3 直接迁移或低改造页面

“直接迁移”只指布局和组合组件，数据适配器、权限、i18n 和测试仍必须重新实现。

| 模板页面/组件                    | V2 目标页面                      | 可保留部分                                                                   | 必须改造部分                                                                                                | 优先级 |
| -------------------------------- | -------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| Dashboard Shell                  | User/Admin 共享框架              | 分组侧栏、折叠菜单、顶栏、全局搜索、账户切换、动态主题、布局偏好和响应式导航 | 移除 GitHub 菜单和 Server Function；抽成 Shared Shell，由两套 appConfig 接入 RouteCatalog、capability、i18n | P0     |
| Default Dashboard                | 开发者/管理员总览                | MetricCard、趋势、近期记录和异常摘要布局                                     | 指标模型、时间范围、真实 API、权限                                                                          | P0     |
| Analytics                        | 用量与运营分析                   | KPI、时间筛选、趋势、排行和实时数据布局                                      | 使用统一图表组件；替换流量语义和 Mock 数据                                                                  | P0     |
| Infrastructure                   | 渠道、Provider 和系统运行监控    | 健康状态、延迟、可用率、分组和快捷操作                                       | 删除固定 1700px 宽表格；改为核心列、可选列和详情 Sheet                                                      | P0     |
| Mail                             | 使用日志、任务日志、请求追踪     | 可调整宽度的列表/详情、移动端 Drawer                                         | 邮件内容改成概览、请求、响应、计费、路由、错误标签页                                                        | P0     |
| Tasks                            | 用户异步任务中心                 | 类型切换、状态与日期筛选、分页和详情结构                                     | 按图片/视频/音频拆分 shadcn Tabs；桌面四列卡片展示核心状态，完整字段进入详情 Dialog；后续接服务端分页       | P0     |
| Users                            | 管理员用户页                     | 页面信息密度、筛选和动作布局                                                 | 权限、服务端查询、批量操作和移动端卡片                                                                      | P1     |
| Roles                            | 权限管理页                       | 分组和角色信息结构                                                           | 与后端 capability 模型对齐，不伪造不存在的 RBAC 能力                                                        | P1     |
| Profile                          | 用户、渠道、模型、Key 等实体详情 | Header、Tabs、主内容和状态侧栏                                               | 抽象为 `EntityDetailLayout`，替换领域内容                                                                   | P1     |
| Finance                          | 钱包、充值、订阅、财务运营       | 余额、交易、分布和快捷操作                                                   | 统一金额精度、时区、审计和权限                                                                              | P1     |
| Auth v1/v2                       | 登录和注册外壳                   | 分栏、品牌区和响应式结构                                                     | Passkey、OAuth、OTP、Turnstile、协议和错误契约                                                              | P1     |
| Unauthorized / Not Found / Error | 401/403/404/500/503              | 错误页视觉壳和返回动作                                                       | i18n、request ID、重试和错误上报                                                                            | P1     |

### 29.4 适合二次开发的页面

| 模板页面           | V2 使用方向                         | 复用策略                                                                                |
| ------------------ | ----------------------------------- | --------------------------------------------------------------------------------------- |
| Chat               | Playground                          | 只取三栏、会话列表、Thread、Composer 外壳和移动端 Sheet；保留 Token Boat 的 AI 业务内核 |
| Invoice            | 销售价目表、渠道配置、价格版本编辑  | 采用“左侧编辑 + 右侧实时预览”，替换发票领域和计算逻辑                                   |
| Logistics          | 异步绘图/视频任务、请求路由链路     | 保留主从详情、阶段状态和移动端 Sheet；世界地图默认删除                                  |
| File Manager       | Files API、批处理文件或模型资源目录 | 有明确产品能力后再启用，保留搜索、网格/列表切换和批量动作                               |
| E-commerce         | 模型市场、模型目录、公开定价        | 参考商品、热门项目和订单布局，领域内容全部重写                                          |
| Patient Monitoring | 实时渠道监控和 NOC 运行中心         | 波形和病人卡片改为吞吐、并发、延迟、错误、队列和熔断                                    |
| Kanban             | 渠道接入、模型商业化、价格发布流程  | 路由级加载 DND，只在流程状态确实存在时开发                                              |
| CRM                | 渠道接入或经销商管理                | 保留 Pipeline、任务和机会结构，业务模型重写                                             |
| Productivity       | 管理员工作台                        | 参考待处理事项、快捷动作和右侧辅助栏                                                    |

### 29.5 只参考布局或默认放弃的页面

| 页面/模块                                    | 决策     | 原因                                                                                          |
| -------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| Academy                                      | 只参考   | 可用于 Getting Started 和文档中心，但教育业务模型无复用价值                                   |
| Calendar                                     | 默认放弃 | 当前缺少核心日历场景，FullCalendar 成本和包体不值得                                           |
| Legacy Dashboards                            | 放弃     | 与新版 Dashboard 重复，只增加维护面                                                           |
| Dashboard Chat/Mail iframe 路由              | 放弃     | Playground 和日志必须是一等路由，不允许 iframe 包装                                           |
| GitHub Repository 菜单                       | 放弃     | 与 Token Boat 产品任务无关                                                                    |
| 未经设计验收的新增主题预设                   | 默认放弃 | 保留模板现有 Default、Brutalist、Soft Pop、Tangerine；新增预设需完成完整 Token 和可访问性验收 |
| Mock 数据和演示 Store                        | 放弃     | 不得成为生产领域模型或 Query Cache 的替代品                                                   |
| 重复 Tasks/Users/Roles 表格实现              | 放弃     | 统一收敛到 V2 DataGrid Pattern                                                                |
| D3 世界地图、Flag CSS、Simple Icons 全量资源 | 默认放弃 | 只有明确页面需求时才按需引入                                                                  |

### 29.6 Playground 专项迁移方案

模板 Chat 是客服会话模型；Token Boat Playground 是 AI API 调试工作台。现有 Playground 约 6,500 行，AI Elements 约 7,800 行，已经覆盖模板不具备的流式请求、多模态、消息解析、Reasoning、Tool、代码/JSON 渲染、参数、错误和重试能力。

因此不得以模板 Chat 替换现有业务实现。目标页面结构为：

```text
┌──────────────┬──────────────────────────┬────────────────────┐
│ 会话与预设     │ AI 消息、结果和 Composer   │ 参数、用量和调试信息   │
│ 历史会话       │ Streaming               │ 模型、渠道、协议       │
│ Prompt 预设    │ Reasoning / Tool         │ System Prompt       │
│ 收藏与搜索     │ Image / Code / JSON      │ Temperature / Top P │
│              │ Retry / Stop / Branch    │ Token / Cost / TTFT │
└──────────────┴──────────────────────────┴────────────────────┘
```

迁移边界：

- 可采用 Chat Sidebar、Conversation List、Thread Header、Scroller、Composer 外壳和移动端 Sheet。
- 联系人详情侧栏改为模型参数、请求指标、原始 Payload 和响应调试。
- 消息内容继续使用 V2 AI Elements，不复制模板客服消息模型。
- 发送逻辑继续使用 SSE/流式请求，保留停止、重试、重新生成、分支和多模态能力。
- `/console/playground` 作为一等路由；不使用模板的 Dashboard iframe 包装。

当前 V2 已交付基线：

- 页面采用 shadcn `Message`、`InputGroup`、`Select`、`Sheet`、`Slider`、`ScrollArea`、`Empty` 和 `Alert` 组合为单栏 AI Chatbox；Composer 保持大输入区，并支持 Enter 发送、Shift+Enter 换行和停止请求。
- 顶部必须选择有效 API Key；密钥切换联动环境、分组、剩余额度和可用模型。请求携带可选 `api_key_id`，后端校验密钥归属、启用状态、有效期、额度、分组和模型白名单；旧前端未携带此字段时行为不变。
- 每轮请求携带完整 user/assistant 对话上下文，而非只发送最后一条消息；回复展示输入/输出 Token、延迟和预估费用，并提供复制操作。
- System Prompt、Temperature、Maximum Output Tokens 收入右侧参数 Sheet；无有效密钥、配置加载失败和空对话均有明确状态。
- `@shadcn/helpers/ai-sdk` 与 `@shadcn/helpers/tanstack-ai` 适用于无模型、无网络的确定性流式演示和测试，不负责生产 API Key 鉴权；V2 现有 Demo Repository 已承担同类离线职责，因此暂不引入重复运行时依赖。

下一阶段仍需补齐 SSE 增量渲染、Markdown/代码块、Reasoning/Tool/Source、多模态附件、重试/重新生成/分支和持久化会话，之后再演进为上图所示三栏调试工作台。

### 29.7 模板无法覆盖的 V2 范围

以下内容必须独立设计和实现，不能因为采用后台模板而降低排期：

- 公共首页、功能介绍、公开模型定价、模型详情和排行榜；
- Wiki、Getting Started、关于、社区、协议、隐私和退款；
- 首次安装 Setup Wizard；
- Passkey、OAuth、OTP、验证码、找回密码和登录安全；
- 渠道创建、动态渠道配置、模型映射、模型能力和连接测试；
- 官方价格、采购价、销售价目表、折扣、核对和熔断分析；
- 多层系统设置、权限、模块开关和审计；
- 七语言、API 契约、服务端分页、错误处理和可观测性。

### 29.8 迁移工作包与顺序

1. **P0 Shell 包**：Studio Admin Sidebar、Header、Command Search、Layout Controls、Theme Store、响应式导航和 PageHeader。
2. **P0 数据概览包**：Default Dashboard、Analytics、MetricCard、DateRangeFilter。
3. **P0 运维包**：Infrastructure、渠道健康、告警摘要和 Entity Detail。
4. **P0 日志包**：Mail 式主从布局、Resizable、移动端 Drawer 和日志标签页。
5. **P0 Playground 包**：Chat 三栏布局与现有 AI Elements 集成。
6. **P1 业务包**：Profile、Users、Roles、Finance、Auth 和错误页。
7. **P2 运营包**：Invoice、Logistics、Patient Monitoring、Kanban 和 File Manager，逐项产品立项。

每个工作包必须独立完成来源登记、依赖裁剪、真实 API、权限、i18n、响应式、测试和许可证检查，禁止先复制全部模板再集中清理。

## 30. 领域关系与管理方式决策

V2 的右侧业务页面最终按“Shell + 业务聚合工作台”组织，而不是按现有菜单或数据库表逐页翻版。第一轮代码盘点确认至少存在以下六个跨表管理聚合：

| 聚合工作台              | 核心关联                                                                      | 主要管理模式                                        |
| ----------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| Channel Operations      | Channel、ChannelModel、Ability、Model Mapping、Probe、Usage、Purchase Price   | EntityPage + Tabs + Health Context + Impact Preview |
| Model Commercialization | Model、Routing Target、ChannelModel、Ability、Official/Purchase/Sales Price   | Checklist + EntityPage + 价格血缘与版本 diff        |
| User 360                | User、Token、安全凭据、Subscription、Price Book Assignment、资金和 Log        | EntityPage + 关联表 + 审计时间线                    |
| Request Trace           | Log、User、Token、Channel、Task、RequestPricingSnapshot                       | Mail 式 Master–Detail + 只读诊断 Tabs               |
| Pricing Governance      | Official/Purchase Price Version、Price Book/Version/Item、Change Batch、Audit | Workflow + Version/Diff + 发布影响预览              |
| Finance Case            | TopUp/Subscription Order、User、Callback Event、额度入账和 Audit              | 案件详情 + Timeline + 受控人工命令                  |

关系盘点必须区分稳定 ID 的直接关联、业务键的逻辑关联、不可变历史快照和主库/日志库跨库引用。界面只展示对当前任务有帮助的关系，不把数据库 ER 图直接当作产品导航。

详细关系图、现有后台管理方式初审、六个工作台结构、Pattern 选择规则、API 缺口和 Phase 0 验收矩阵统一维护在 [`Frontend V2 Phase 0：领域关系与关联管理盘点`](./frontend-v2-phase-0-domain-inventory.zh_CN.md)。该文档与 route/permission/API inventory 一起作为页面设计和接口开发的前置输入。

---

《Frontend V2 Phase 0：领域关系与关联管理盘点》已建立第一版。下一步必须补齐可逐项验收的 route/permission/API/action matrix，列出每个旧路由、页面、接口、权限、模块开关、关联实体、写入副作用、迁移目标和删除条件。没有完成并评审该矩阵前，不应开始批量编写新页面。

## 31. User Console Shell 当前落地状态

截至 2026-08-28，`frontend/apps/console` 已按 `next-shadcn-admin-dashboard` 的 Dashboard Shell 结构完成第一版落地。这里采用的是模板的信息架构、布局和交互模式，并按 Base UI API 二次开发，不是把模板业务页面和依赖整仓复制进来。

当前已完成：

- Shell 已从页面手写侧栏和遮罩切换为 shadcn Sidebar + Sheet，保留 Sidebar/Floating/Inset、Icon/Offcanvas、桌面折叠、移动端抽屉和快捷键；顶部搜索切换为 shadcn Command，并按首次打开异步加载；
- 左侧栏、折叠导航、移动端抽屉、顶部搜索、动态明暗主题、数据源状态和响应式内容区；
- 侧栏底部登录信息区直接读取同一份 Session，展示头像、显示名、邮箱和账户分组，并提供账户、主题设置和退出登录入口；顶栏右侧同步保留响应式账户入口，共用同一账户菜单和 Session；
- 不再在顶栏或侧栏提供独立 Preferences 菜单；完整设置整合到 Account 的“主题设置”标签，提供 Theme Mode、Theme Preset、18 项字体 Registry、语言、Content Layout、Navbar Behavior、Sidebar Style、Sidebar Collapse Mode、当前侧栏状态、信息密度和减少动效；修改即时作用于 Shared Shell 并自动保存，旧 `/console/preferences` 地址兼容重定向到该标签；
- 偏好使用白名单校验的 `console_layout_preferences_v3`，能迁移 `v2` 的布局/动效值和 `v1` 的侧栏状态，非法或未知值回退默认值；
- 默认语言改为简体中文，只允许用户在简体中文和英文之间主动切换并持久化；其余五种资源、运行时注册和入口已删除；
- 当批 User Console V2 仍只在 `frontend/`、`/console/*` 和独立开发端口运行；该阶段性隔离已由第 54 节的联合发布链路取代。隔离 Compose 仍只用于明确的回归测试。

模板右侧 Dashboard 示例仍不作为 Token Boat 业务页面直接迁入；全部业务页面继续使用 Token Boat 自身领域模型与 API 契约。当前 Demo Repository 用于完整 UI 评审，Live Repository 只复用已确认接口；缺失的团队、告警和价格字段必须在隔离环境完成后端契约后才能切换生产。

## 32. ToB API 商户用户中台产品审计与调整结论

### 32.1 用户真正要完成的工作

用户中台的主线不是“浏览后台菜单”，而是持续完成五个闭环：找到合适模型和真实价格、完成安全接入、确认生产流量健康、控制成本与余额、让团队按职责协作。页面按这些任务聚合，不按数据库表逐页映射。

| 用户任务     | 用户核心问题                                             | 页面与关键交互                                                                                                                               |
| ------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 选择模型     | 能否使用、支持什么能力、上下文多大、按当前账户到底多少钱 | Models & Pricing：搜索、类型/可用性筛选、上下文、输入/输出价、能力标签、复制 Model ID、进入 Playground                                       |
| 完成接入     | Base URL、认证方式、SDK 示例、端点、生产检查是什么       | Integration Center：环境信息、代码示例、端点表、密钥安全、重试与 Request ID 检查清单                                                         |
| 管理凭证     | 哪个应用、哪个环境、能用哪些模型、哪些 IP、额度和有效期  | API Keys：环境标识、模型白名单、IP/CIDR、账户分组、额度、过期、停用、撤销、Secret 一次性展示                                                 |
| 观测调用     | 哪些请求失败、慢在哪里、花了多少钱、如何关联自己的日志   | Usage + Request Logs：趋势聚合、模型维度、状态筛选、Request ID 主从详情、Token、延迟、价格和错误上下文                                       |
| 管理异步任务 | 图片/音频/视频任务是否完成、失败和费用如何               | Tasks：图片/视频/音频独立 Tabs、桌面四列卡片、状态与日期筛选、12/24/48 分页、进度、平台、动作、费用/额度、耗时、结果、失败原因和类型专属详情 |
| 控制成本     | 当前余额、选定周期花费、交易、套餐和预警如何             | Billing + Alerts：余额、周期消费、交易、套餐、余额/消费/错误率/延迟规则与通知渠道                                                            |
| 团队协作     | 谁能开发、看账单、改密钥或管理成员                       | Team & Access：成员、邀请、角色、状态、最后活跃和最小权限说明                                                                                |
| 保障账户     | 资料、2FA/Passkey、会话和通知偏好是否安全                | Account：资料、通知、安全能力、活跃会话和撤销操作                                                                                            |

### 32.2 页面级体验标准

- 所有统计、日志、任务和交易的时间筛选统一使用共享 Date Range Picker；它由 shadcn `Popover + Calendar(mode="range") + ToggleGroup + Separator` 组成，桌面端采用“左侧快捷范围、右侧自定义日历”的分栏布局，移动端自动切换为上下布局。组件必须同时提供今天、最近 7 天、最近 30 天、最近 90 天和日历自定义范围；自定义范围必须校验完整性和先后顺序，后端请求统一传开始与结束时间戳。
- 概览只显示能促成下一步行动的指标；余额、成功率、请求量均可跳转到对应工作台，不把静态装饰图表当作信息。
- 所有错误必须带 Request ID、状态码、模型、端点、Token、延迟、成本和可读错误原因；Request ID 是用户日志与平台支持之间的主关联键。
- 价格页面必须展示“当前用户分组/当前销售价格表”的结果，不能向用户暴露采购价、渠道成本或管理员定价血缘。
- API Key 默认按应用和环境隔离；生产 Key 不鼓励无限额度，撤销必须二次确认，完整 Secret 只展示一次。
- 空状态必须告诉用户为什么为空以及下一步动作；加载、错误、无权限和功能未开通不能共用同一种空白页。
- 图表无数据时保留 Card 标题、说明和日期范围，但不渲染没有信息价值的空坐标轴；图表区域使用统一 `ChartEmptyState` 保持稳定高度，并区分“所选周期确实无请求”“已有汇总但接口缺少每日序列”和“数据加载失败”。前两类分别引导扩大时间范围、进入 Playground 或查看请求日志，加载失败提供原范围重试。
- 所有表格必须保留表头并在 `TableBody` 内展示统一的 `TableEmptyState`；筛选无结果与尚无数据使用不同文案，可执行场景提供创建、充值、邀请或进入 Playground 等下一步操作，服务端分页表格在 0 条数据时仍展示分页信息。
- 所有表格列遵循“主视图摘要、完整值可达”：长文本单行截断并保留完整标题提示，详情型数据进入 Dialog/Sheet；长 ID 使用前后片段，时间使用紧凑格式，数值右对齐并使用等宽数字，重复单位使用 `/1M`、`/次`、`/秒` 等短记法，多标签只展示前两项和 `+N`。除名称、状态和主操作外，不允许任一低频列无限撑宽表格。
- 桌面表格在窄屏允许横向滚动，移动端优先保留状态、名称和主操作；复杂筛选进入 Popover/Sheet，不压缩成不可点击的小控件。
- 顶栏保留搜索、帮助/接入、告警、外观和账户；侧栏按“工作台、接入开发、运营监控、管理”分组，普通用户不出现 Admin 入口。

### 32.3 当前实现与后端契约边界

新增的 Integration、Models、Request Logs、Alerts 和 Team 页面已经具备完整 Demo UI 与 Repository 契约。现有后端可以直接支撑模型列表、公开价格、请求日志和部分账户告警偏好；团队成员/角色、统一告警规则、事件历史、价格上下文窗口与能力元数据仍需专用接口。Live Adapter 不在浏览器下载全量数据推算，也不把字段缺失转换成具体业务事实；关键契约缺失时整块数据进入错误态，可选观测字段缺失时只显示“— / 未记录 / 暂不可用”。详细规则见第 37 节。

### 32.4 shadcn 组件优先审计结论（2026-08-28）

User Console 已完成一次逐页组件审计，执行规则是“官方组件负责交互语义，业务组件负责领域组合”，不再用页面级 CSS 重写已有 Primitive：

| 场景               | 统一实现                                     | 已替换范围                                                                 |
| ------------------ | -------------------------------------------- | -------------------------------------------------------------------------- |
| 应用外框与移动导航 | Sidebar + Sheet + Tooltip                    | 桌面侧栏、Icon/Offcanvas、Floating/Inset、移动抽屉、导航 Tooltip           |
| 全局搜索           | Command + Dialog + Kbd                       | 页面筛选、键盘选择、无结果状态、`⌘/Ctrl + K` 提示；搜索包按需加载          |
| 用量趋势           | ChartContainer + Recharts AreaChart          | Usage 请求量趋势、主题色、日期坐标、Tooltip、键盘/读屏可访问层             |
| 可滚动交互区       | ScrollArea                                   | Playground 会话区                                                          |
| 重复信息行         | Item                                         | 概览步骤与快捷动作、告警规则与事件、活跃会话、请求详情、环境信息、角色说明 |
| 参数滑杆           | Slider                                       | Playground Temperature                                                     |
| 空状态与通知       | Empty + Alert                                | 图表、表格、Playground、告警历史、API Key、任务空状态和登录 Demo 提示      |
| Secret 复制        | InputGroup                                   | API Key 一次性 Secret 展示与复制动作                                       |
| 登录安全验证       | InputOTP + Field + Separator                 | 密码登录后的 2FA 验证码/备用码切换，以及能力驱动的 Passkey 登录入口        |
| 账户访问表单       | Field + InputGroup + Alert                   | 注册、邮箱验证码、Turnstile、密码找回、防账户枚举提示与一次性新密码复制    |
| 数据集合           | Table                                        | Models、Usage、Logs、Team、Billing 等表格继续由 Table 自带横向滚动         |
| 日期范围           | Popover + Calendar + ToggleGroup + Separator | 所有统计、日志、任务和交易筛选                                             |

以下保留为业务布局，不视为重复造组件：代码示例的 `pre/code` 滚动容器、登录页品牌分栏、表格外层边框和 Card/Grid 页面编排。它们不承担 Dialog、Menu、Select、Tabs、Slider 等交互语义，强行包装成新的 Primitive 反而会降低可读性。后续新增交互组件必须先检查 shadcn registry；CLI 添加前执行 `--dry-run`，已有本地组件默认不覆盖。

## 33. User Console 本地 Live 联调环境

截至 2026-08-30，本地开发统一复用一套 Go 后端：`127.0.0.1:3000` 连接本地 PostgreSQL 数据库。旧版和新版前端不再各自启动后端，也不在日常开发中使用 `3001` 快照 API。

共享入口与边界：

- `http://localhost:5173/console/` 访问 User Console V2；
- `http://localhost:5173/` 及其他非 `/console` 路由访问旧版前端；
- V2 Vite 作为共享入口运行在 `5173`，旧版前端开发服务器只在内部 `5174` 提供页面资源；
- 两个前端的 `/api`、`/mj`、`/pg` 和 `/v1` 请求都发送到同一个 `3000` 后端，因此登录态、用户、密钥、日志、账单和任务数据来自同一个本地 PostgreSQL；
- `5174` 只是第二个前端构建服务，不是第二套后端；
- 新版账户菜单不增加“返回旧版”入口，新旧版本通过明确 URL 区分；
- 该模式会直接读写本地开发数据库，真实模型调用也可能产生供应商成本，执行充值、支付和真实调用时仍需遵守本地测试边界。

启动方式：

```bash
cd /Users/kakui/projects/token-boat/frontend
bun run dev
```

`bun run dev` 等价于 `bun run dev:dual`，只启动两套前端开发服务器，不启动任何后端。运行前确认本地 `3000` Go 服务已经连接 PostgreSQL。

只开发其中一个前端时仍复用同一个后端：

```bash
bun run dev:new       # 仅启动 V2，入口为 localhost:5173/console/
bun run dev:legacy    # 仅启动旧版，入口为 localhost:5173/
```

Demo 模式继续使用 `bun run dev:demo`，它不连接后端。`frontend/docker-compose.live.yml` 和快照脚本只保留给明确的隔离回归测试，不属于日常新旧前端开发启动链路。

变更报告规则：V2 后续开发如修改任何 Go 后端代码，交付说明必须单独列出 Go 文件、修改原因、接口或数据影响、兼容性与回归结果；纯前端改动也必须明确写明“本次未修改 Go 后端”，不能只在综合 diff 中隐含呈现。

## 34. API Key 详情与更新闭环

截至 2026-08-29，User Console 的 API Key 页面已从“列表、创建、启停、撤销”补齐为可管理的凭证工作台：

- 密钥名称作为详情入口，使用 shadcn `Sheet` 展示状态、脱敏密钥、分组、创建/最后使用时间、剩余与已用额度、有效期、额度使用率、模型白名单和 IP/CIDR 限制；完整 Secret 仍只在创建成功后展示一次；
- 详情中的“编辑设置”使用 shadcn `Dialog + Field + Select + Switch + Input`，可更新名称、分组、有效期、剩余额度、是否不限额度、模型白名单和 IP/CIDR；列表保留启停与不可恢复的撤销动作；
- 列表操作列新增带 Tooltip 的直接编辑入口，不再要求先打开详情；Integration Center 所选 API Key 下方同步提供“编辑设置”，保存后立即更新共享 Query 缓存并重新加载密钥、模型权限、概览和接入状态；
- Live Repository 直接复用现有 `PUT /api/token/`，保持 `model_limits_enabled`、`model_limits`、`allow_ips`、`group`、`auto_groups` 和 `cross_group_retry` 的既有契约，没有新增接口、数据库字段或 Go 后端改动；
- Demo Repository 同步实现相同更新契约；列表、详情和更新交互均有组件测试，Live Adapter 有精确请求体契约测试；
- 本地 Live 环境已完成只读视觉验收，确认真实 PostgreSQL 快照数据能打开详情与编辑弹窗，验收过程未提交修改、未触发上游调用。

当前后端 Token 模型没有独立的“环境”持久化字段；V2 Live 模式将其标记为“未分类”且不在列表中展示 Development/Staging/Production。若需要让环境成为可持久化、可筛选和可审计的正式属性，应作为后端契约与表结构扩展放到后续阶段统一实施，不能在前端伪造持久化结果。

## 35. 账户登录会话安全管理

截至 2026-08-29，账户设置的“会话”标签已从基础设备列表补齐为可操作的安全工作台：

- 登录会话展示友好的浏览器与设备摘要，并保留登录方式、IP、最后活跃时间和“当前会话”标识；列表超过 10 项后使用统一分页，避免历史设备撑高整个设置页面；
- 点击“查看详情”使用 shadcn `Sheet` 展示完整 User Agent、登录时间、最后活跃、过期时间和 Session ID；详情抽屉和所有关闭动作均支持中英文与无障碍名称；
- 单个非当前会话可以在 shadcn `AlertDialog` 二次确认后退出；页面同时提供“一键退出其他会话”，确认窗口明确受影响数量并保证当前会话继续有效；
- Live Repository 复用现有 `GET /api/user/sessions`、`DELETE /api/user/sessions/:sid` 和 `POST /api/user/sessions/revoke-others`，Demo Repository 提供相同行为；没有新增 Go 接口或表结构；
- 个人资料页在 Live 模式下将邮箱明确设为只读，因为现有 `PUT /api/user/self` 只更新显示名称；邮箱绑定继续由既有验证流程管理，前端不再产生“编辑已保存”的假象；
- 会话详情和批量退出有组件测试，Live Adapter 有接口契约测试；本地真实 PostgreSQL 快照环境已完成只读验收，确认 18 个真实快照会话可分页、查看详情并打开批量退出确认，验收中未执行任何退出操作。

该模块按账户页签异步加载，生产构建会将会话管理拆成独立 chunk，避免安全管理组件进入用户中台首屏主包。

## 36. 接入中心动态首请求生成器

截至 2026-08-29，Integration Center 已从静态示例页升级为基于真实账户权限的接入工作台：

- 首请求生成器读取当前环境返回的 Base URL、账户已启用的 API Key、密钥分组和模型白名单；模型列表继续复用 Playground 的权限查询，同一分组只请求一次并共享 TanStack Query 缓存；
- cURL、TypeScript 和 Python 示例使用所选 Key 真正可用的模型 ID，并自动清理 Base URL 末尾斜杠；代码只引用 `TOKEN_BOAT_API_KEY` 环境变量，不把完整 Secret 写入页面、日志或生成内容；
- 无有效 Key、模型加载失败、无可用模型和复制失败均有独立状态；未满足条件时复制按钮保持禁用，并引导用户进入 API Key 管理，而不是生成看似可用的假代码；
- Live Repository 会先访问现有公开 `GET /api/status`，成功后才返回当前环境并标记可访问；页面按 `operational / degraded / outage` 映射状态，连接就绪卡片再结合有效 Key 和端点目录实时判断，不再把生产建议伪装成已完成检查；
- 核心端点表补充逐行复制操作，继续保留统一表头、空状态和紧凑列规则；环境加载错误提供原地重试。

本轮复用现有 `getIntegration`、API Key 列表和按分组获取可用模型的接口，没有修改 Go 后端、接口契约或数据库表结构。后续如果要提供 SDK 包管理器安装命令、API Key 级连通性探测或在线执行首请求，应在后端契约阶段统一设计，并按“涉及接口与表结构的新增功能最后实施”处理。

## 37. Live 数据真实性与禁止兜底规则

User Console V2 将“页面可显示”与“数据事实正确”分开处理。Live 模式默认连接真实 API；只有明确设置 `VITE_CONSOLE_DATA_MODE=demo` 或执行 `bun run dev:demo` 才允许加载演示数据。环境变量缺失时不得自动进入 Demo，也不得在接口失败后回退到 Demo Repository。

### 37.1 禁止生成具体值的字段

以下字段会影响用户的路由、计费、安全、排障或自动化决策，缺失时禁止使用 `0`、`false`、`default`、`USD`、`/v1/chat/completions`、任意模型名、历史累计值或前端推断值补齐：

- 请求事实：日志类型、请求 ID、端点、模型、API Key、来源 IP、状态、状态码、Token、缓存 Token、延迟、首 Token 延迟、流式状态、费用和服务追踪 ID；
- 金融事实：余额、价格、币种、计价单位、额度换算因子、充值最低金额、折扣、套餐总额、购买上限、待处理金额和告警阈值；
- 权限与安全事实：账户分组、Key 状态/有效期/额度/模型/IP 限制、登录会话、认证能力、2FA/Passkey 状态和通知目标；
- 模型与任务事实：模型可用性、供应商、类型、上下文、输入/输出各自的计价单位、任务类型、状态、进度、更新时间和结果；
- 统计事实：所选周期请求量、成功率、模型明细、日趋势和平均延迟。周期内请求数为 0 时必须保留真实 0，不能替换为历史累计值；分母为 0 的成功率必须显示未知，不能显示 0%。

### 37.2 缺失值的三种处理

| 数据级别                 | 缺失处理                                     | 页面表现                                                   |
| ------------------------ | -------------------------------------------- | ---------------------------------------------------------- |
| 关键契约                 | 抛出 `LiveDataContractError`，终止当前 Query | 独立错误态、保留重试，不渲染部分真假混合数据               |
| 可选观测字段             | 映射为 `null`                                | 显示“— / 未记录 / 暂不可用”，不参与求和、平均和筛选判断    |
| 明确枚举但服务端返回新值 | 映射为 `unknown`                             | 展示“未知”，不得归入启用、成功、排队、图片、对话等已有分类 |

只有展示与交互层默认值可以保留，例如默认语言、主题、页面布局、日期筛选初始范围、表单草稿、空搜索词、分页页码以及服务端明确规定的稀疏折扣“未配置即无折扣”。这些默认值不得写回成后端事实。

### 37.3 已落实的关键修正

- 请求日志只接受消费/错误两类请求日志，并携带 `scope=request`；登录、管理等日志不再伪装成 `/v1/chat/completions`。端点、模型、IP、缓存 Token、流信息缺失时显示未知，不制造默认值。
- 请求活动类型只按真实 `request_path` 分类，不再根据模型名称猜测图片、对话或向量请求；状态码和错误码读取日志中的真实观测字段。模型名称包含 `image` 等词时也不能覆盖端点事实。
- 模型价格要求币种、计费模式、价格结构、组件、金额、单位和单位大小满足完整契约；输入价与输出价分别保存自己的单位，不能用输出单位替代输入单位。账户报价只接受当前账户分组的销售价格，不能用最低价或官方参考价冒充；没有价格目录时只展示“价格不可用”，不附加 USD 或 `/1M`。
- 充值和套餐要求真实最低金额、启用的支付渠道、折扣、币种、价格、额度和购买上限；不完整的金融响应直接进入错误态。
- 账户余额告警阈值为服务端默认时映射为 `null`，页面提示用户填写明确金额后再保存，而不是假设 1 USD；现有账户设置接口没有返回告警规则启停状态，因此 Live 页面显示“状态暂不可用”，不能把通知目标存在误判为规则已启用；团队目录和平台事件历史在现有接口未提供时明确标记不可用。模型用量拆分、日趋势和精确平均延迟现已由账户范围聚合接口提供，历史日志没有精确延迟事实时继续显示“—”，不使用秒级 `use_time` 或 0 兜底。
- 登录、注册和密码找回在认证能力接口加载失败时必须阻断表单并展示错误，不能假设“密码登录可用 / Turnstile 关闭”；创建 API Key 的初始分组来自当前 Session，未取得分组时禁止提交，不能默认写入 `default`。
- 任务缺失模型、平台或动作时统一显示“—”；终态任务缺少完成时间时耗时为未知，不能用当前时间继续累计。任务类型只允许根据任务平台/动作分类，模型名称不能作为类型兜底。
- 过滤、分页和日期范围变化时不复用旧 Query 数据冒充新条件结果；加载期间使用 Skeleton 或“—”，成功返回后才展示 0、false 等真实值。

后续新增接口必须先在 Repository 契约中标注每个字段属于“必需 / 可选 / 枚举未知”哪一类，再开发页面。任何为了让 UI 看起来有数据而新增的业务兜底，都应视为数据正确性缺陷。

## 38. 概览与用量工作台闭环

截至 2026-08-30，用户中台概览和用量页完成了一轮面向商户决策的边界重构：

- 概览日期范围进入 URL 搜索参数，快捷范围与自定义范围均可刷新恢复、复制分享和前进后退；不再仅保存在页面组件状态中；
- 概览统计和入门进度拆分为独立 Query 错误边界。统计失败时仍保留快捷操作与入门流程，入门失败时仍展示已经成功返回的真实统计，避免一个次要接口让整个工作台消失；
- 余额、请求量、有效 API Key 和成功率指标均成为可键盘访问的业务入口，分别进入账单、用量、密钥和请求日志；最近活动直接携带真实 Request ID 进入日志精确搜索；
- 入门清单的完成数分母改为服务端返回步骤数，不再硬编码 `3`；每一步直接进入对应页面，错误态支持原范围重试；
- 用量页对单一聚合数据源采用页面级错误边界，接口失败时不再留下空指标、空表头或看似为 0 的数据；请求、Token、费用、平均延迟和成功率同时展示，其中缺失的平均延迟或成功率只显示“—”；
- 用量指标可直接进入日志或账单，请求列表的 Request ID 可进入日志精确搜索；模型明细和请求列表在加载时使用统一表格 Skeleton，成功空数据继续使用统一空状态；
- 用量趋势继续使用 shadcn `ChartContainer` 与 Recharts AreaChart；“周期内无请求”和“已有汇总但没有每日序列”保持不同解释与下一步动作，网络错误统一由页面级重试承接。

本轮后续新增账户范围 `GET /api/log/self/usage` 聚合契约，由 Go 后端按当前用户、所选时间范围和浏览器时区返回请求/失败数、Token、额度、每日序列、模型明细与可选精确平均延迟。新日志会在公开 `other.response_time_ms` 中记录毫秒级耗时；历史日志缺少该字段时平均延迟返回 `null`，前端显示“—”。本次修改没有新增或修改数据库表结构。

## 39. 模型目录真实性与可分享详情

截至 2026-08-30，Models & Pricing 的目录摘要和详情交互完成第二轮收敛：

- 删除“API 兼容 OpenAI”“请求前可见价格”等静态业务结论，避免把页面设计文案误展示为当前账户事实；顶部只统计当前模型目录真实返回的可用模型数、已配置账户价格的模型数和模型类型数；
- 模型目录加载时保留筛选器、表头和统一表格 Skeleton，失败使用统一 `DataLoadError` 原地重试，成功且无数据继续区分“账户没有模型”和“筛选无结果”；
- 模型名称仍打开完整能力与报价，但选中模型 ID 进入 `detail` URL 搜索参数；刷新、复制链接、浏览器前进后退均可恢复同一个详情弹窗，关闭弹窗会清理该参数；
- URL 中的模型已经被移除或账户权限变化时，不静默失败，也不选择相似模型兜底；页面明确提示“所选模型不可用”并提供清除选择；
- 搜索、模型类型和可用性筛选变化时同步关闭旧详情，避免筛选条件与弹窗实体不一致；价格单元仍使用紧凑两位小数主显示与 Tooltip 完整精度，完整弹窗继续展示接口返回的所有账户计费项和官方参考项。

本轮复用现有模型目录与当前账户销售价格契约，仅调整前端展示、URL 状态和错误边界；没有修改 Go 后端、接口或数据库表结构。

## 40. 请求详情深链接与可观测上下文

截至 2026-08-30，请求日志从“列表内临时打开详情”升级为可恢复、可分享的诊断入口：

- 请求详情使用 `detail` URL 参数保存 Request ID，详情中的概览、用量与计费、诊断三个页签使用 `detailTab` 保存；刷新、复制链接、浏览器前进后退均能恢复同一个请求和详情页签；
- 请求日志表格点击 Request ID 直接更新 URL 并打开 shadcn `Sheet`，不通过 Effect 同步第二份选中状态，也不为打开当前行额外发送一次列表请求；
- 概览最近活动和用量最近请求携带 Request ID、精确搜索字段以及原页面日期范围进入日志页，到达后直接打开对应详情，而不是只停留在搜索结果列表；
- 日期、搜索字段、搜索词、状态、排序、分页或每页行数变化时清理旧详情与详情页签，避免筛选结果和抽屉实体不一致；
- 共享链接中的请求已不存在、超出账户权限或不在日期范围时，页面明确提示“请求详情不可用”，不自动打开第一条或相似请求作为替代；
- 请求列表加载时保留筛选器和完整表头，`TableBody` 使用统一 Skeleton；分页区域加载时也不显示虚假的 0 条统计。

本轮后续新增账户范围 `GET /api/log/self/detail/:request_id` 精确详情接口。接口同时校验当前用户和 Request ID，只返回请求/错误日志，并复用用户日志清洗逻辑移除模型映射、渠道和 `admin_info` 等内部字段；前端详情不再依赖当前分页列表中的临时行。本次修改没有新增或修改数据库表结构。

## 41. 任务中心可分享详情与独立错误边界

截至 2026-08-31，任务中心从每张卡片各自挂载详情弹窗，收敛为单一、可恢复的任务诊断入口：

- 任务详情使用 `detail` URL 参数保存 Task ID；刷新、复制链接、浏览器前进后退均可恢复同一任务，关闭详情会清理该参数；
- 页面只挂载一个 shadcn `Sheet`，不再为当前页每张任务卡重复创建完整 Dialog DOM；详情集中展示状态、进度、模型、平台、动作、提交/开始/完成/更新时间、耗时、费用、计费单位、结果地址、类型专属元数据、输入和失败原因；
- 日期、状态、顺序、任务类型、页码或每页数量变化时清理旧任务详情，避免筛选上下文与详情实体不一致；
- 共享链接中的任务已不存在、超出账户权限、筛选范围或当前页时，页面明确提示“任务详情不可用”，不打开第一条或相似任务作为替代；
- 图片、视频、音频和全部任务的数量加载期间使用 Skeleton，不再用 0 冒充尚未返回的统计；类型计数接口单独失败时只提示计数不可用，任务列表与详情仍可继续使用；
- 任务页顶部使用统一提示明确说明图片、视频和音频生成结果可能过期或失效，引导用户在任务成功后立即下载并自行妥善保存，避免把临时结果地址误认为长期存储；
- 任务列表主接口失败、成功空数据、加载中和类型统计失败保持四种独立状态；桌面端继续使用四列卡片及 12/24/48 的四倍数分页。

本轮继续复用现有任务分页与类型统计接口，仅调整新前端的 URL 状态、组件结构和异常边界；没有修改 Go 后端、接口契约或数据库结构。

## 42. 支付订单与余额账本可恢复详情

截至 2026-08-31，账单页的支付订单和余额账本完成 URL 状态与表格边界收敛：

- 支付订单详情使用 `detail` 保存订单号，余额事件详情使用 `ledgerDetail` 保存事件 ID；两个参数分别只在支付记录和余额活动页签有效，刷新、分享链接与浏览器前进后退均可恢复对应 Sheet；
- 支付记录、余额活动与套餐页签继续使用 `tab` 参数；切换页签会清理不属于新页签的详情，避免隐藏的 Sheet 状态在页签之间串联；
- 日期范围变化同时重置支付订单页码、余额账本页码和两类详情；搜索、类型、状态、排序、页码及每页数量变化时也会清理对应详情；
- 订单或余额事件已不存在、超出账户权限、筛选范围或当前页时，页面明确提示详情不可用，不选择第一条或相似记录作为替代；
- 两张表格加载期间保留完整表头，`TableBody` 使用统一 Skeleton，分页区域展示 Skeleton；成功空数据与请求失败继续保持独立状态；
- Sheet 关闭按钮使用中英文可访问名称；支付订单缺少账户币种时金额继续显示“—”，余额事件缺少结构化金额时继续显示“未记录”，不从描述文本解析或推断金额。

本轮继续复用现有账单摘要、支付订单分页和余额账本分页接口，仅调整新前端的 URL 搜索状态、shadcn 组合和错误边界；没有修改 Go 后端、接口契约或数据库结构。

## 43. 账户活动、接入中心与入门流程边界收敛

截至 2026-08-31，账户安全活动、接入中心和入门流程完成一轮可恢复交互与异常边界补强：

- 账户活动详情使用 `detail` URL 参数保存事件 ID，刷新、复制链接和浏览器前进后退可以恢复同一事件；日期、类别、排序、页码和每页数量变化时清理旧详情；事件不在当前账户、筛选结果或页码中时明确提示不可用，不选择其他事件替代；
- 账户活动表格加载时保留完整表头并在 `TableBody` 中展示统一 Skeleton，分页区域单独展示 Skeleton；成功空数据、加载、失败和共享详情失效保持四种独立状态；
- 接入环境主契约失败时只展示可重试错误，不再同时渲染“无端点”、占位首请求代码或其他容易被误判为真实环境的数据；核心端点表加载时保留表头与统一 Skeleton；
- API Key 查询失败与“查询成功但没有有效 Key”分开展示：前者标记“检查结果暂不可用”，后者才标记“需要处理”，避免把网络错误解释为账户配置事实；
- 入门页首请求代码复制增加失败反馈，拒绝的 Clipboard Promise 不再形成未处理异常；账户分组没有可用模型时使用 shadcn `Empty` 明确展示原因，不保留无标题的占位区域；
- 团队页在 Demo 数据加载期间不提前显示成员数 `0`，成员表继续保留表头和统一加载行；Live 模式仍严格保持个人工作区能力边界，不伪造成员目录或邀请成功。

本轮复用现有账户管理日志、接入环境、API Key、模型与入门聚合契约，只调整新前端 URL 状态、shadcn 组合、加载和异常语义；没有修改 Go 后端、接口契约或数据库结构。

## 44. API Key 管理状态与危险操作闭环

截至 2026-08-31，API Key 管理在既有详情和编辑能力上补齐可恢复状态、列表加载与写操作反馈：

- API Key 详情使用数值型 `detail` URL 参数保存密钥 ID；刷新、复制链接和浏览器前进后退可以恢复同一密钥详情，关闭详情会清理该参数；
- 搜索词、状态、排序、页码或每页数量变化时清理旧详情，避免筛选上下文与详情实体不一致；共享链接中的密钥已不存在、超出账户权限、筛选范围或当前页时，页面明确提示“API 密钥详情不可用”，不选择第一条或其他密钥替代；
- API Key 表格加载期间保留完整表头，`TableBody` 使用统一 Skeleton，分页区域单独展示 Skeleton；成功空数据、加载、失败和共享详情失效保持四种独立状态；
- 创建、编辑、启停和撤销统一使用页面所属 `QueryClient` 更新当前分页缓存，再失效 API Key、概览与入门查询；写操作失败展示明确反馈，不再形成未处理 Promise 或无响应按钮；
- 创建表单限制名称长度、必填分组和正数额度；完整 Secret 仍只展示一次，Clipboard 写入失败会明确提示且不会误报复制成功；
- 撤销继续使用 shadcn `AlertDialog` 二次确认，提交期间确认与取消动作锁定并显示 Loading；成功后立即从当前页移除密钥并同步总数，若正在查看该密钥则同时关闭失效详情；
- 启停 Loading 只锁定当前行，其他密钥仍可继续操作，避免一个请求阻塞整张表。

本轮继续复用现有 API Key 列表、创建、更新、启停与撤销接口，仅调整新前端 URL 状态、TanStack Query 缓存、shadcn 组合和异常反馈；没有修改 Go 后端、接口契约或数据库结构。

## 45. 告警中心与账户通知配置闭环

截至 2026-08-31，告警中心和账户通知设置完成一轮数据依赖拆分、表单边界与错误恢复补强：

- 告警中心不再为了读取余额通知设置而加载登录会话、Passkey 和两步验证状态；Live Repository 只并行读取通知设置、额度换算和公开状态监控，减少无关请求与故障耦合；
- 平台状态接口不可用或响应契约异常时，已保存的余额告警规则仍可正常展示；平台状态明确标记为“暂不可用”，监控数和在线率不生成兜底值，并提供独立“重试状态检查”操作；
- 账户设置主查询失败时使用统一 `DataLoadError`，可在保留当前页签的情况下原地重试，不再只显示无法操作的错误提示；
- 账户资料、通知、安全与会话写操作统一更新当前 React 应用实际使用的 `QueryClient`，不再依赖模块级全局实例，避免测试、嵌入式页面或多 Provider 场景出现缓存分裂；
- 通知邮箱在提交前校验完整邮箱格式；Webhook、Bark 和 Gotify 地址要求完整 HTTP/HTTPS URL；Gotify Token 在服务端尚未配置时保持必填，优先级必须是 0 到 10 的整数；
- 所有无效字段同时设置 `data-invalid` 与 `aria-invalid`，展示具体错误原因并禁用提交；表单提交处理器再次校验状态，避免回车或程序化提交绕过按钮禁用；
- 通知渠道继续使用 shadcn `ToggleGroup`，字段使用 `Field` 组合，提交 Loading 与错误 Toast 保持统一交互。

本轮复用现有 `/api/user/setting`、额度换算和 `/api/uptime/status` 接口，只调整新前端请求编排、缓存归属、表单验证和部分失败状态；没有修改 Go 后端、接口契约或数据库结构。消费告警、错误率告警、延迟告警和历史触发事件仍需要后端告警服务与持久化契约，继续按计划放在后端依赖功能阶段实施，前端不伪造规则或事件。

## 46. 认证与支付流程缓存一致性

截至 2026-08-31，认证、账单、充值、订阅购买和支付回跳完成一轮 Query 缓存归属与金融交互边界收敛：

- Session Provider、账单页、充值页、订阅购买弹窗和支付确认 Hook 全部改为使用当前 React Tree 所属的 `useQueryClient()`；功能模块不再直接导入应用级全局实例，避免测试、嵌入式页面或多 Provider 场景把登录态和余额写入错误缓存；
- 充值、兑换码、订阅购买和支付确认成功后统一刷新账单摘要、余额账本、支付订单、概览和入门清单，避免余额已变化但订单、账本或“为账户充值”步骤仍保持旧状态；
- 支付回跳所需订单在 Hook 初始化时读取，即使支付状态参数在组件挂载后才生效，也可以继续恢复并确认原订单；组件卸载继续通过 `AbortController` 终止轮询，临时接口故障不会被直接误判为支付失败；
- 自定义充值金额低于当前支付方式最低金额、不是安全整数或超出安全整数范围时，输入框明确标记无效并禁用下一步；页面不会创建与展示金额规则不一致的支付订单；
- 报价接口失败与“尚未输入金额”保持不同状态：失败时显示独立错误、解释当前不能创建订单并支持原金额重试，不再只显示“—”让用户误以为应付金额为空或为零；
- 充值确认弹窗增加取消操作，支付订单提交期间锁定关闭和重复提交；兑换码提交前清理首尾空格，账单页提交期间同样锁定弹窗，避免用户重复兑换或误以为请求已经取消；
- 支付回跳标题和说明改为明确状态映射，分别覆盖已取消、确认中、成功、失败、超时和已提交，不再使用多层嵌套条件导致错误文案分支。

本轮继续复用现有认证、充值报价、创建支付订单、查询支付结果、兑换码和订阅购买接口，仅调整新前端 QueryClient 归属、缓存失效范围、表单与支付状态；没有修改 Go 后端、接口契约或数据库结构。

## 47. 游乐场失败恢复与回复重新生成

截至 2026-08-31，游乐场在现有 API Key、模型权限和完整上下文对话基础上补齐可恢复交互：

- API Key 或模型目录加载失败时使用 shadcn `Alert` 原地解释并重试，不要求刷新整个页面；重试期间保留当前对话、输入内容和参数设置；
- 对话请求失败时在消息流内展示明确错误和“重试”操作，不再只弹出瞬时 Toast；重试复用失败请求的完整 API Key、分组、模型、System Prompt、上下文和生成参数，避免用户设置已经变化后产生隐式不同的请求；
- 最新一条模型回复支持“重新生成”；操作会移除旧回复并基于旧回复之前的完整上下文再次请求，不重复追加用户消息，也不会把被替换的模型回复继续发送；
- 用户主动停止请求继续只显示“生成已停止”，不渲染成可重试的系统故障；页面卸载仍会中止在途请求，避免卸载后状态更新和无效网络占用；
- 失败、重试、重新生成和配置恢复均有回归测试，覆盖请求上下文不丢失、不重复以及异常提示在成功后清理。

本轮继续复用现有游乐场模型列表与非流式对话接口，只调整新前端的 shadcn 组合和请求状态管理；没有修改 Go 后端、接口契约或数据库结构。SSE 增量渲染、多模态附件、Reasoning/Tool/Source 和服务端会话持久化仍按独立能力包推进，不使用假数据或浏览器端推断替代后端契约。

## 48. 认证入口恢复能力与重复请求防护

截至 2026-08-31，登录、注册和密码找回入口补齐认证能力查询失败后的恢复操作，并收紧多种认证方式之间的并发边界：

- 公开认证能力查询继续严格依赖真实 `/api/status` 契约；加载失败时仍不假设密码登录、注册、验证码、Turnstile、Passkey 或 OAuth 已启用，但错误态新增原地“重试”操作，不再要求用户手动刷新整个页面；
- Session Context 分离会话恢复与认证能力恢复状态，`retryCapabilities` 只重新请求公开认证配置，不会清空当前 Session、表单草稿或其他 Query 缓存；重试期间按钮展示独立 Loading 并禁止重复点击；
- 密码、Passkey 和 OAuth 登录共享一次性请求锁，一种登录方式进行中时其他入口同步禁用，避免快速点击产生并发认证流、重复 OAuth state 或多个 WebAuthn 弹窗；
- 注册提交与邮件验证码发送共享请求锁；密码找回、密码重置和两步验证也增加同步锁，防止按钮状态尚未完成重绘时的连续点击绕过 Loading；
- 锁在失败后可靠释放，允许用户修正输入或再次发起请求；OAuth 成功启动后保持锁定直至页面跳转，避免同一页面创建第二条授权流；
- 新增中英文错误与重试文案，并增加 Session Provider、登录页和注册页回归测试，覆盖认证能力接口从失败到恢复的完整路径。

本轮只调整新前端认证状态编排、shadcn `Alert + Button` 错误组合和交互防重，没有修改游乐场、Go 后端、接口契约或数据库结构。

## 49. 全局命令菜单与退出登录闭环

截至 2026-08-31，用户中台应用外框补齐命令菜单的加载反馈、可搜索快捷操作和跨入口退出防重：

- 命令菜单继续按需拆包，搜索按钮在鼠标悬停、键盘聚焦时预加载，`⌘/Ctrl + K` 触发时也会立即启动加载；兼顾首屏包体和首次打开速度；
- 慢网络或首次下载命令菜单代码期间使用 shadcn `Dialog + Skeleton` 展示可见、可关闭且带读屏状态的加载界面，不再以空白 Suspense fallback 让用户误以为点击无响应；
- “搜索页面和操作”现在除完整页面导航外，增加可搜索的浅色、深色、跟随系统和“打开主题设置”快捷操作；当前主题在命令项中保持选中标识，操作后立即关闭菜单并生效；
- 账户退出状态提升到 Session Context，页面头部与侧边栏两个账户入口共享同一个 `signingOut` 状态；任一入口退出期间两个触发器同步锁定并显示明确语义；
- Session Provider 会合并同一时刻的重复退出调用，只向现有退出接口发送一次请求；失败后释放锁并保留当前 Session，成功后才清理账户 Query 缓存并进入登录页；
- 新增命令搜索、快捷操作、退出请求合并和账户触发器 Loading 回归测试，并在本地 PostgreSQL Live 环境使用真实账户完成命令菜单视觉与键盘可访问结构验收。

本轮复用现有布局偏好和退出登录接口，只调整新前端全局 Shell、Query 状态和 shadcn 组件组合；没有修改游乐场、Go 后端、接口契约或数据库结构。

## 50. 认证路由与受保护深链接恢复

截至 2026-08-31，用户中台补齐从受保护页面进入认证流程、完成多种登录方式后返回原工作上下文的路由闭环：

- 未登录用户直接访问模型详情、请求日志筛选、账单页签等受保护深链接时，Session Boundary 会将完整 `/console` 路径、查询参数和锚点写入登录页 `redirect` 参数；登录成功后返回原页面，不再统一丢回概览；
- 返回地址只接受规范化后的站内 `/console` 路径；外部绝对地址、协议相对地址、反斜杠路径、Console 之外页面以及登录/注册/找回页循环均会被拒绝，避免开放重定向和认证死循环；
- 密码登录、两步验证和 Passkey 登录使用相同返回目标；OAuth 发起时按服务端签发的 flow token 将目标暂存于当前标签页 `sessionStorage`，回调消费一次后立即删除，既跨越外部授权跳转又不写入长期存储；
- 注册页保留邀请代码与返回目标，注册成功进入登录页时继续携带目标；登录、注册和密码找回之间的互相跳转也不会丢失返回上下文；OAuth 失败返回登录页时同样保留已验证目标；
- 登录、注册和密码找回成为访客边界页面：Session 查询完成前只展示 shadcn Skeleton，不提前渲染可提交表单；已有 Session 的用户访问这些页面会直接进入返回目标或概览；Session 检查失败时使用可重试错误态，不把错误解释成“未登录”；
- 新增重定向安全、OAuth 一次性恢复、访客边界 Loading/错误/已登录跳转、受保护页面拦截和各认证方式恢复目标的回归测试；本地 Live 环境已验证已登录账户访问带返回参数的登录页会直接恢复到模型目录。

本轮复用现有 Session、登录、注册、Passkey、OAuth 与密码找回接口，只调整新前端路由状态和认证编排；没有修改游乐场、Go 后端、接口契约或数据库结构。

## 51. 全局页面恢复与浏览器复制能力收敛

截至 2026-08-31，用户中台补齐路由级异常恢复、部署后旧 Chunk 失效处理和跨页面复制失败边界：

- 路由错误继续按 401、403、404、5xx 和未知异常展示不同语义；401 的“前往登录”会保留当前受保护页面、查询参数和锚点，重新登录后可恢复原工作上下文；
- 动态模块下载失败、旧版本 Chunk 已被部署替换或 CSS 预加载失败时，不再展示无效的普通“重试”；页面明确提示需要更新，并通过“重新加载页面”保留当前地址获取最新资源；
- 服务异常返回支持参考编号时，错误页增加复制操作；复制成功和失败都有明确反馈，不再要求用户手动选中可能被截断的编号；
- 非游乐场页面的模型 ID、请求 ID、任务 ID、订单号、账本事件 ID、API Key、接入代码、Base URL、密码重置结果、2FA 设置密钥和恢复代码统一使用同一浏览器复制工具；
- 复制工具优先使用标准 Clipboard API；浏览器暴露接口但因安全上下文或权限失败时，会在当前用户手势内使用临时文本域降级，并在完成后清理节点、恢复原焦点；两种方式都失败时抛出明确错误，由页面展示失败反馈；
- 修复模型目录、请求详情和两步验证原先复制失败形成未处理 Promise、无反馈或仍误报成功的问题；新增 Clipboard API 成功、降级成功、完全不可用和空值拒绝测试，以及动态模块失效恢复与登录深链接回归测试。

本轮只调整新前端的全局路由状态、浏览器能力封装、中英文文案和错误反馈；遵循“游乐场先不动”的当前约束，没有修改游乐场、Go 后端、接口契约或数据库结构。

## 52. 首批生产范围冻结与验收基线

截至 2026-08-31，首批生产范围按当前产品决策冻结。以下能力保留现状，不进入本批生产收口：

- 告警中心；
- 团队与权限；
- Playground；
- 新版 Admin Console；
- 新版公共站点。

本批生产收口范围为其余 User Console V2 能力，包括认证入口、概览、API Key、模型与价格、请求日志与详情、用量分析、任务中心、账户充值与账单、账户活动、接入中心、账户设置、全局导航、主题和语言。收口规则如下：

- Live 模式只连接本地真实 Go API 与同一 PostgreSQL 数据库；接口失败时进入错误态，不回退 Demo 或生成业务事实；
- 请求日志的每日/模型聚合和精确详情使用账户范围专用接口，避免浏览器聚合、分页依赖和越权读取；
- 所有关键写操作需要 Loading、防重复提交、明确成功/失败反馈；危险操作需要二次确认；
- 表格、图表和卡片区分加载、真实空数据、接口失败和契约缺失；金额、价格、IP、端点、模型、状态、延迟等事实不使用误导性兜底；
- 新前端必须通过完整单元/组件测试、Lint、Format、TypeScript 类型检查和生产构建；Go 模块必须通过 `go test ./...`；
- 本地 PostgreSQL Live 验收至少验证登录服务、用量聚合、请求列表、来源 IP、账户范围详情以及内部字段清洗；
- 本批不执行线上构建替换、域名切流、数据库迁移或生产部署。旧版与新版并行访问策略保持不变，待用户明确授权上线后再执行发布清单。

当前代码验收结果：Frontend V2 共 60 个测试文件、292 个测试通过，Lint、Format、TypeScript 类型检查和生产构建通过；Go 全量测试通过；本地 PostgreSQL Live 接口已验证账户用量聚合、请求统计与请求列表使用同一筛选口径，请求列表包含真实来源 IP，精确详情可按 Request ID 返回且不会暴露 `admin_info`。历史请求没有毫秒级延迟时返回未知，符合“不能兜底”的数据规则。

仍依赖生产外部配置、不能仅靠仓库代码宣告完成的项目包括 OAuth 回调注册、Passkey 的 RP/Origin 配置，以及支付渠道沙箱、回调地址和签名密钥联调。这些项目在正式上线前必须使用目标域名与真实供应商配置单独验收。

## 53. 历史日志可选扩展字段兼容

截至 2026-08-31，本地 PostgreSQL Live 巡检发现部分历史系统审计日志将未记录的 `other` 扩展字段保存为 JSON `null`。该字段只承载操作参数、User-Agent、流式诊断等可选观测信息，不应因为缺失而阻断整个页面：

- Live Repository 新增可选对象解析边界，将数据库中的 `NULL`、空值和 JSON `null` 统一映射为空观测上下文；
- 非法 JSON、数组、字符串或数字仍视为契约损坏并进入可重试错误态，避免静默吞掉真实数据异常；
- 请求活动、请求详情和账户活动共用该规则，必需的类型、时间、Request ID、Token 与费用字段仍保持严格验证；
- 使用本地真实账户对 16 个非暂缓只读能力完成 Repository 级巡检，概览、入门、API Key、用量、接入、模型、请求日志、账户活动、账本、任务、账单、充值和账户设置全部通过；
- 新增可重复执行的 `bun run live:smoke`，通过环境变量接收本地验收账号，不在仓库或输出中保存密码；后续真实 API 契约漂移可以在页面评审前直接暴露；
- 本次只修改 Frontend V2 契约适配器和回归测试，没有修改 Go 后端、接口或数据库结构。

## 54. 新旧前端联合发布链路

截至 2026-08-31，新旧前端已从“仅开发环境并行”推进为“同一产物并行发布”，但本批仍不执行线上部署：

- `make build-all-web` 先构建旧版 `web/dist`，再构建 User Console V2，并将 V2 产物装配到 `web/dist/console`；
- Go 二进制继续只嵌入一个 `web/dist`，旧版入口保持 `/`，新版入口固定为 `/console/`；`/console/*` 深链接使用 V2 的 SPA Index 回退，不会误落到旧版页面；
- `/console` 统一以 `308` 跳转到 `/console/` 并保留查询参数；`/console/` 由显式 SPA 入口处理，避免嵌入式文件服务把目录反向规范化到 `/console` 形成重定向环路；
- 标准 Dockerfile、ECR Dockerfile、Linux/macOS/Windows Release 与 Electron 构建均执行两套前端构建，因此以后修改旧版并走正常发布时，会同时带上当次提交中的新版；
- CI 新增 Frontend V2 的测试、类型检查、Lint、格式检查和生产构建门槛；
- 新旧前端仍共享同一个 Go API、登录会话和数据库，不复制后端服务，也不增加“返回旧版”账户菜单；
- 联合 Docker 产物已完成本地验收：旧版 `/`、新版 `/console/`、新版深链接 `/console/logs` 和 `/console/assets/*` 均由同一容器正确返回；开发环境继续通过 `bun run dev:dual` 启动两个前端入口并共享端口 `3000` 的同一后端与 PostgreSQL；
- 告警中心、团队与权限、Playground、新版 Admin Console、新版公共站点继续暂缓，不因联合发布而扩大首批生产功能范围。

## 55. 用量统计口径修正与折叠导航复验

截至 2026-09-01，首批生产范围继续完成统计口径与全局导航验收：

- 峰值 RPM 改为统计同一分钟内的全部请求，不再只计算成功请求；失败状态筛选也会返回真实峰值，而不是错误显示为 0；
- 峰值 TPM 仍只累计有实际用量的成功请求 Token，避免失败记录把未知用量计入吞吐；
- 缓存命中率统一为“缓存读取 Token / 输入 Token”，不再使用包含输出 Token 的总 Token 作为分母；每日分桶、账户汇总和旧统计接口使用同一口径；
- MySQL 的峰值分钟桶显式使用 `FLOOR(created_at / 60)`，与 SQLite、PostgreSQL 和 ClickHouse 的整分钟分组语义保持一致；
- 后端回归测试覆盖同一分钟成功/失败请求、缓存输入占比、自定义筛选和四种数据库的分钟桶表达式；
- 在 Frontend V2 Demo 模式下折叠侧边栏，逐项点击概览、快速开始、接入中心、API 密钥、模型与价格、用量分析、请求日志、任务、充值中心、账单与订阅、账户活动和账户设置，全部正确跳转且浏览器控制台无错误；暂缓模块未纳入本次验收。

## 56. 缓存统计观测边界与账户活动来源 IP

截至 2026-09-01，请求日志和用量统计继续收敛缓存口径，并补齐用户主动操作的来源 IP：

- 新文本请求在服务端已经收到规范化 Usage 时始终保存 `input_tokens_total`，包括观测值为 0 的情况；缺少上游 Usage 的请求不写入该字段，继续保持未知；
- 缓存命中率只使用同时观测到 `cache_tokens` 与 `input_tokens_total` 的日志计算，不再从 `prompt_tokens` 或总 Token 推算；筛选范围混入缺少完整输入观测的历史缓存日志时返回 `null`，前端显示“—”，避免跨 OpenAI/Anthropic 语义误判；
- 缓存读取 Token 仍展示实际已记录的合计值；SQLite、MySQL、PostgreSQL 与 ClickHouse 均使用各自兼容的 JSON 读取表达式；
- Live Repository 直接采用服务端返回的缓存命中率，序列与汇总不再二次使用总 Token 重算；Demo Repository 使用完整输入 Token，并把失败请求纳入峰值 RPM、只把成功请求 Token 纳入峰值 TPM；
- 两步验证设置、启停和备用码重置、通用安全验证、签到，以及管理员为用户重置订阅额度等 HTTP 操作现在保存真实来源 IP；注册赠送、定时重置等没有客户端请求的系统事件继续保留空 IP，不制造来源；
- 账户设置接口新增 `record_ip_forced` 返回平台强制策略，并把 `record_ip_log` 规范化为当前实际生效值；强制策略开启时，即使客户端提交关闭也会保存为启用。新版账户设置页同步锁定开关并解释平台策略，不再允许用户保存一个实际不会生效的关闭状态。

## 57. 账户设置草稿离开保护

截至 2026-09-01，账户资料和通知设置补齐未保存修改的离开确认：

- 账户资料或通知设置与最近一次服务端数据不一致时，站内切换账户页签、点击侧栏进入其他页面或触发其他路由导航会统一展示 shadcn `AlertDialog`，不再静默丢弃草稿；
- 浏览器刷新、关闭标签页和离开站点时启用原生 `beforeunload` 保护；没有未保存修改时不注册阻断，避免干扰正常导航；
- 用户选择继续编辑时取消原导航并保留全部输入；选择放弃时先恢复最近一次成功查询的账户数据，再继续原导航，避免同一账户页面隐藏页签残留旧草稿；
- 保存成功、手动把字段改回持久化值或账户身份发生变化时立即清理脏状态；后台 Query 刷新仍不会覆盖正在编辑的草稿；
- 新增回归测试覆盖后台刷新草稿保留、站内导航阻断、继续编辑、放弃恢复和改回原值后解除阻断。

本轮只修改 Frontend V2 的账户设置交互、中英文文案和组件测试，没有修改 Go 后端、接口契约或数据库结构。告警中心、团队与权限、Playground、新版 Admin Console 和新版公共站点继续保持暂缓。

## 58. 多标签页认证状态同步

截至 2026-09-01，User Console 补齐同一浏览器内多个标签页之间的认证状态同步：

- 密码、2FA、Passkey 或 OAuth 在一个标签页完成登录后，只向其他标签页广播不含用户资料和访问令牌的 `authenticated` 事件；接收端使用 HttpOnly Refresh Cookie 重新获取自己的访问令牌，不在 BroadcastChannel 或 Local Storage 中传递凭据；
- 一个标签页成功退出后广播 `signed-out` 事件，其他标签页立即清空 Repository 内存访问令牌、当前 Session 和账户范围 Query 数据，不再等待旧令牌过期或下一次接口 401；
- 优先使用原生 `BroadcastChannel`，不支持时使用只存放一次性事件标记的 `storage` 事件；浏览器禁用跨标签存储时不影响当前标签页正常登录和退出；
- 跨标签登录恢复不携带本标签页旧 Session ID，避免新 Refresh Cookie 与旧 Session Header 产生错误的会话不匹配；刷新暂时遇到网络错误时保留当前状态，不把网络故障解释成退出；初始化或跨标签登录刷新尚未返回又收到更新的退出事件时会取消旧请求并丢弃旧结果，不能重新恢复已经退出的会话；
- 修正退出流程直接 `QueryClient.clear()` 后 Session Observer 可能不再收到空会话的问题：现在保留 Session 与公开认证能力 Query，只移除账户私有查询并显式写入空 Session，受保护路由可以立即进入登录页；
- 新增回归测试覆盖本标签页重复退出合并、退出后的界面更新、跨标签登录恢复、跨标签退出、过期异步结果隔离、BroadcastChannel 消息最小化、Storage 降级和监听器清理。

本轮只修改 Frontend V2 的会话编排、Repository 本地会话清理契约和测试，没有修改 Go 后端、HTTP 接口、Cookie 协议或数据库结构。真实多标签页下的 Refresh Cookie 轮换仍需要在目标 Origin 配置环境完成最终验收。

## 59. 会话撤销交互与失败恢复

截至 2026-09-01，账户设置中的设备会话撤销补齐目标级 Loading、防重复操作和失败恢复：

- 单设备撤销使用正在处理的 Session ID 标识目标，只有对应确认按钮展示 Loading；“退出其他会话”使用独立状态，避免两类操作互相冒充完成；
- 任一撤销请求进行中时，其他设备的撤销入口、批量撤销入口和分页操作统一锁定，防止并发请求让账户会话列表出现竞态；
- 从会话详情发起撤销后不再立即关闭详情。请求失败时保留设备信息和确认上下文，恢复按钮供用户重试；只有服务端成功响应并从账户会话数据中移除该设备后，详情和确认层才自动关闭；
- 请求处理中确认与取消按钮均锁定，并展示明确旋转进度；当前设备继续只允许查看、不提供撤销入口，避免误退出正在使用的会话；
- 新增组件回归测试，覆盖单设备撤销的请求中、失败恢复和成功移除，以及批量撤销期间的按钮锁定。

本轮只调整 Frontend V2 的账户会话交互和组件测试，没有修改 Go 后端、接口契约或数据库结构。告警中心、团队与权限、Playground、新版 Admin Console 和新版公共站点继续保持暂缓。

## 60. API 密钥一次性 Secret 防丢失

截至 2026-09-01，API 密钥创建成功后的唯一一次完整 Secret 展示补齐防误关保护：

- 一次性 Secret 使用受控 shadcn `Dialog`，移除通用关闭按钮，并拒绝 Esc 与遮罩点击产生的关闭请求；在页面内必须明确点击“我已保存”才会清除当前 Secret；
- 复制成功后复制按钮切换为完成状态并保持可访问名称，复制失败仍保留原 Secret 和重试入口，不会误报成功或关闭结果；
- Secret 只保留在当前 React 内存状态，不写入 URL、Local Storage、Session Storage、跨标签同步事件或 Query Cache；
- 新增组件回归测试，覆盖关闭按钮缺失、Esc 和遮罩无法误关、复制完成反馈以及明确确认后关闭。

本轮只调整 Frontend V2 的 API 密钥一次性结果交互和组件测试，没有修改密钥接口、Go 后端或数据库结构。告警中心、团队与权限、Playground、新版 Admin Console 和新版公共站点继续保持暂缓。

## 61. 支付与兑换同步防重复提交

截至 2026-09-01，充值、兑换码和订阅购买补齐浏览器同一渲染帧内的同步请求锁：

- 充值订单确认、充值中心兑换码、账单页兑换码和订阅购买在调用 React Query Mutation 前先同步占用动作锁，不再只依赖下一次渲染才生效的 `isPending`；极快双击只能发出一个请求；
- 请求期间继续使用 shadcn Button 的禁用状态和 Loader 反馈，并阻止关闭支付确认层；同步锁与可见 Loading 分工明确，既覆盖同帧竞态，也保留用户可感知状态；
- 成功或失败进入 `onSettled` 后统一释放动作锁；失败时保留原订单确认、兑换码或套餐选择，用户可以修正问题并重试，不需要刷新页面；
- 新增共享 `useActionLock`，只保存当前组件内的布尔引用，不写浏览器存储、不创建全局监听，也不把支付参数带入额外状态容器；
- 回归测试覆盖快速连续确认只创建一个充值订单、两个兑换入口只提交一次，以及余额购买套餐只扣一次；同时验证失败后按钮恢复并允许一次新请求。

本轮是前端防御性收口，不替代后端既有的支付限流、兑换码事务锁和订单结算校验；没有修改 Go 后端、支付接口或数据库结构。告警中心、团队与权限、Playground、新版 Admin Console 和新版公共站点继续保持暂缓。

## 62. API 密钥写操作并发与失败恢复

截至 2026-09-01，API 密钥创建、编辑、启停与撤销补齐同一渲染帧内的请求去重和处理中保护：

- 创建、编辑和撤销在调用 React Query Mutation 前使用组件内同步动作锁，按钮尚未完成下一次渲染时的连续点击也只会发送一个请求；请求成功或失败后统一释放锁，失败时无需刷新即可重试；
- 启停操作按 API Key ID 独立加锁，同一密钥不会产生并发状态写入，不同密钥仍可独立操作；同时维护每个密钥的可见处理中集合，多个启停请求并行时不会因为 Mutation 的最后一个 `variables` 覆盖前一个密钥的 Loading 状态；
- 创建或编辑请求进行中时隐藏通用关闭按钮、拒绝 Esc 与遮罩关闭，并锁定取消和提交入口；失败后保留全部表单内容与错误上下文，恢复关闭和再次提交；
- 撤销确认在失败后继续保留，取消和撤销按钮恢复可用；成功并从服务端列表移除密钥后才结束确认上下文；
- 回归测试覆盖创建、编辑、启停和撤销的快速连续操作、不同密钥并行启停、处理中不可误关，以及创建、编辑和撤销失败后的重试路径。

本轮复用 `useActionLock` 并新增按业务 ID 隔离的 `useKeyedActionLock`，两者都只保存组件生命周期内的瞬时引用，不创建全局监听、不写浏览器存储，也不改变 API Key 接口或后端权限校验。告警中心、团队与权限、Playground、新版 Admin Console 和新版公共站点继续保持暂缓。

## 63. Passkey 与两步验证安全操作收口

截至 2026-09-01，账户安全设置补齐浏览器安全弹窗和一次性恢复码场景的同步请求锁、失败恢复与防误关保护：

- Passkey 注册、替换和移除在发起 WebAuthn 或安全验证前同步占用动作锁，同一渲染帧内的快速连续点击只触发一次浏览器验证；处理中隐藏关闭入口并锁定取消按钮，失败后保留验证码和确认上下文供用户重试；
- 两步验证初始化、启用、停用和恢复码重新生成分别使用独立动作锁，不能在按钮 Loading 尚未重绘前创建并发安全请求；启用或停用失败后继续保留当前设置与验证码输入；
- 两步验证初始化失败时在当前 Dialog 内展示明确错误和“重试设置”入口，不要求用户关闭后重新开始，也不会使用虚构二维码、密钥或恢复码兜底；
- 重新生成的恢复码继续按一次性敏感结果处理：服务端成功返回后隐藏通用关闭按钮并拒绝 Esc、遮罩关闭，只有明确点击“我已保存恢复码”才清除当前结果；
- 中英文语言包补齐初始化失败和重试文案；回归测试覆盖 Passkey 注册/移除、2FA 初始化/启用/停用、恢复码重置的快速连续点击、处理中不可误关、失败重试与一次性结果确认。

本轮只调整 Frontend V2 的账户安全交互、瞬时请求锁、中英文文案和组件测试，没有修改 WebAuthn/2FA 接口、Go 后端、凭据存储或数据库结构。实现遵循 shadcn Dialog/AlertDialog 的可访问标题、禁用按钮与 Loader 组合，并使用组件内 `ref` 保存不参与渲染的同步锁。告警中心、团队与权限、Playground、新版 Admin Console 和新版公共站点继续保持暂缓。

## 64. 账户资料与用量通知保存一致性

截至 2026-09-01，账户资料和用量通知设置补齐保存期间继续编辑时的数据一致性与同步防重复提交：

- 资料与通知表单在调用 React Query Mutation 前使用独立的同步动作锁，同一渲染帧内连续提交只发送一次请求；成功或失败后统一释放锁，失败后保留当前草稿并允许重试；
- 提交时保存一份精确快照。请求返回后只有当前草稿仍等于该快照时，才使用服务端规范化结果更新表单并清除未保存状态；
- 如果用户在请求期间继续编辑，旧请求成功只更新账户缓存和最近一次服务端基线，不覆盖较新的输入，也不错误解除离开页面保护；
- 资料输入通过同步引用组合下一份草稿，避免连续字段事件使用上一帧闭包值覆盖另一个字段；通知设置继续提交完整的强类型设置对象，不使用局部字段或默认值拼接；
- 回归测试覆盖资料与通知的快速重复提交、请求期间产生新草稿、旧请求成功后新草稿保留以及未保存导航保护继续生效。

本轮只调整 Frontend V2 的账户资料、通知保存编排和组件测试，没有修改 Go 后端、账户接口或数据库结构，也没有新增业务数据兜底。告警中心、团队与权限、Playground、新版 Admin Console 和新版公共站点继续保持暂缓。

## 65. 接入中心密钥编辑防重复提交

截至 2026-09-01，接入中心“第一个请求”中的 API 密钥快捷编辑与密钥管理页使用相同的写操作并发边界：

- 快捷编辑在调用更新接口前同步占用动作锁，按钮尚未完成 Loading 重绘时连续点击只发送一个更新请求；
- 请求期间复用 API 密钥编辑 Dialog 的关闭保护、字段禁用和 Loader，不能通过 Esc、遮罩或取消按钮丢失正在提交的上下文；
- 成功或失败后统一释放动作锁；失败时 Dialog 与已填写设置保持不变，按钮恢复后可以直接重试；成功后更新当前密钥缓存并刷新概览、入门进度和密钥列表；
- 回归测试覆盖快速连续保存只调用一次接口，以及首次失败后无需刷新即可重新提交。

本轮只调整 Frontend V2 接入中心的 API 密钥更新编排和组件测试，没有修改 API 密钥接口、Go 后端或数据库结构。告警中心、团队与权限、Playground、新版 Admin Console 和新版公共站点继续保持暂缓。

## 66. 设备会话撤销同步防重

截至 2026-09-01，账户设置中的单设备撤销和“退出其他会话”在既有目标级 Loading 与失败恢复基础上补齐同步防重：

- 两类会话撤销共享一个组件生命周期内的同步动作锁，当前渲染帧内连续确认或交叉触发只允许一个请求进入；
- 单设备请求继续只在目标设备上展示 Loading，批量请求使用独立可见状态；任一请求处理中锁定其他撤销入口、详情操作和分页；
- 成功或失败进入 Mutation `onSettled` 后释放共享锁；失败继续保留设备详情和确认层，按钮恢复后可以直接重试；
- 回归测试覆盖单设备确认的快速连续点击只发送一次请求，以及失败后同一确认上下文可以再次提交。

本轮只调整 Frontend V2 的设备会话撤销编排和组件测试，没有修改会话接口、登录凭据或 Go 后端。告警中心、团队与权限、Playground、新版 Admin Console 和新版公共站点继续保持暂缓。

## 67. Playground CopilotKit 浏览器本地会话与工作区改版

截至 2026-09-01，Playground 根据新的明确需求恢复开发，并按 CopilotKit V2 的 Self-managed Threads 方式接入，不启用只适用于 CopilotKit Intelligence Thread API 的 `useThreads`：

- `<CopilotKit>` 继续作为稳定的 Runtime Provider，不再用 `key` 重挂整个 Provider；每个浏览器本地会话使用明确的 `threadId`，只对最小的 `<CopilotChat>` 子树切换 key，避免线程切换时丢失 Runtime 配置或产生重复 Agent；
- 会话元数据和用户/助手文本消息保存在按用户 ID 隔离、带版本号的浏览器 `localStorage` 中；不保存 Access Token、原始 API Key 或其他认证凭据。读取时严格校验版本与字段，不对损坏或旧格式数据做推断兜底；
- 不新增 Playground 会话/消息数据库表，也不提供会话列表、创建、重命名或删除 API。AG-UI `connect` 仅把客户端随本次请求提交的本地消息返回为 `MESSAGES_SNAPSHOT`，`run` 只把当前上下文转发给既有 Playground Relay，不写会话历史；
- Playground 改为“历史侧栏 + 顶部模型配置 + 沉浸式 CopilotChat”工作区。桌面端常驻历史侧栏，小屏使用 Sheet；无会话、无 API Key、无可用模型、配置加载失败和会话加载失败均有独立状态；
- 同浏览器多窗口仅广播“本地会话变化”的 Thread ID，不广播消息、Prompt、Access Token 或 API Key；接收方从同源 `localStorage` 重新读取，会话进行中的流式输出不会实时镜像到另一个窗口；
- 浏览器本地历史不会跨设备、跨浏览器或跨站点 Origin 同步，清除站点数据会删除历史。模型调用仍经过后端，并继续生成计费、审计和可观测所需的标准 API 请求日志；这类平台请求日志不属于 Playground 会话历史；
- 当前开源 SSE Runtime 不宣称拥有 CopilotKit Intelligence 的实时协同能力；跨设备同步、服务端可恢复的中断流和官方 Threads Drawer 如后续需要，必须另行评审后端存储与隐私策略；
- Demo Repository 不连接 `/pg/copilotkit`，只展示不发送请求的工作区预览，避免演示数据模式把 Runtime 404 误报成真实功能故障；Live Repository 才挂载完整 `<CopilotChat>` 与账户后端。

本轮包含 Go 后端无状态 AG-UI 适配、Frontend V2 浏览器本地存储、CopilotKit V2 Thread 接入、中英文文案和回归测试；不包含 Playground 会话数据库迁移，仍不执行线上部署，也不把 Playground 自动纳入此前确定的首批生产发布范围。
