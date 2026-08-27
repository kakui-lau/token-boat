# Frontend V2 全量重构与开发推进方案

> 状态：Draft RFC
>
> 适用范围：Token Boat / new-api 全部 Web 前端，包括公共站点、用户控制台、管理控制台和 Electron 内嵌页面
>
> 更新时间：2026-08-27
>
> 目标：在不继承现有前端框架和实现约束的前提下，重新定义产品交互、技术架构、工程规范、迁移方式和交付计划

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
- 前端需支持 en、zh、zh-TW、fr、ru、ja、vi 七种语言。
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

| 方案 | 优势 | 主要问题 | 结论 |
| --- | --- | --- | --- |
| 单一 React SPA | 部署最简单，适合控制台 | 公共站点 SEO、首屏与内容构建能力弱，公共和后台依赖容易互相污染 | 不采用 |
| 单一 Next.js 应用 | 统一路由，SSR/RSC 能力强 | 静态导出不支持全部动态能力；完整能力需要 Node 生产运行时，影响单二进制和 Electron | 不采用 |
| 单一 Astro 应用 + 大型 React Island | 公共页面优秀 | 控制台边界不清，最终容易形成一个巨型 Island | 不采用 |
| Astro Site + 单一 React Console | 公共和应用依赖隔离；都可静态输出 | 用户功能与管理员功能仍共享路由、入口包和导航边界 | 不采用 |
| Astro Site + User Console + Admin Console | 三个产品面独立；用户不下载管理员业务；可分别测试、发布和限制网络访问；共享包可控 | Workspace、构建合并和认证跳转稍复杂 | **采用** |

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

| 层级 | 选择 | 使用原则 |
| --- | --- | --- |
| Workspace | Bun workspaces | 根目录统一安装、脚本和锁文件，不引入额外任务编排工具 |
| 公共站点 | Astro 7.x | 默认静态输出；React 仅用于动态 Island |
| 用户中台 | React 19.2 + Vite 8 | 独立 SPA；只包含普通用户和开发者能力 |
| 管理员后台 | React 19.2 + Vite 8 | 独立 SPA；管理员领域按路由级和功能级分包 |
| 路由 | TanStack Router | 文件路由、类型安全 params/search、beforeLoad、intent preload |
| 服务端状态 | TanStack Query | 查询缓存、并发去重、失效、预取和乐观更新 |
| 客户端状态 | React state/context；必要时 Zustand | 禁止把服务端数据复制到全局 store |
| API | openapi-typescript + openapi-fetch | 由 OpenAPI 生成类型；统一错误和请求 ID |
| 表单 | React Hook Form + Zod | Schema 为唯一客户端校验来源；映射服务端字段错误 |
| 表格 | TanStack Table + TanStack Virtual | 服务器分页优先；大列表虚拟化 |
| UI Primitive | Base UI | 负责弹层、焦点、键盘和 ARIA 行为 |
| UI Distribution | 自有 shadcn registry | 组件源码归项目所有；禁止业务页面直接拼第三方 Primitive |
| Shared Console Shell 基线 | `next-shadcn-admin-dashboard` Demo + 同作者 Base UI/TanStack 实现 | 共享组件与视觉语言；User/Admin 使用独立导航、搜索和业务 Slot |
| 样式 | Tailwind CSS + CSS Variables | 语义 Token；OKLCH；不在业务组件写品牌硬编码颜色 |
| 图标 | Lucide，直接路径导入 | 全产品只保留一个通用图标库；品牌图标例外 |
| 图表 | Apache ECharts，按模块导入 | 只在图表路由加载；封装主题、Tooltip 和无障碍摘要 |
| 代码编辑 | CodeMirror 6 | 仅在实际打开编辑器时动态加载 |
| i18n | i18next + ICU message | React 与非 React 共用资源；构建期检查缺失键 |
| 单元/组件测试 | Vitest + Testing Library | 测用户行为，不测实现细节 |
| API Mock | MSW | 开发、组件测试和部分 E2E 共用 handler |
| E2E | Playwright | Chromium 必跑；WebKit/Firefox 跑关键流程 |
| 静态检查 | TypeScript、Oxlint、Oxfmt、Knip | 不依赖预览版类型检查器作为唯一门槛 |
| 观测 | Web Vitals + 可替换错误上报 Adapter | 默认不上传敏感请求和模型内容 |

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

| 维度 | User Console | Admin Console |
| --- | --- | --- |
| 正式路径 | `/console/*` | `/admin/*` |
| 目标用户 | 普通用户、API 开发者 | 管理员、运营、财务和超级管理员 |
| Router | 独立 TanStack Router | 独立 TanStack Router |
| RouteCatalog | 只包含自助服务和开发工具 | 只包含运营和管理能力 |
| 全局搜索 | Key、用量、任务、文档和个人设置 | 渠道、模型、用户、请求、价格、订单和系统设置 |
| 构建产物 | `assets/console/*` | `assets/admin/*` |
| 偏好存储 | 共享 `appearance_preferences_v1`，布局使用 `console_layout_preferences_v1` | 共享 `appearance_preferences_v1`，布局使用 `admin_layout_preferences_v1` |
| 会话 | 与 Admin 共享服务端登录会话 | 与 User Console 共享会话，但额外校验管理员 capability |
| 部署 | 默认与 Go 静态产物一起发布 | 默认一起发布，未来可单独域名、内网或零信任访问 |

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
/console/playground              API Playground
/console/api-keys                API Key 管理
/console/usage                   用量与调用日志
/console/tasks                   图片、视频等异步任务
/console/billing                 余额、充值、订单、订阅
/console/account                 资料、安全、登录会话、OAuth 绑定
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
  | 'apiKeys.read'
  | 'apiKeys.write'
  | 'channels.read'
  | 'channels.write'
  | 'pricing.read'
  | 'pricing.approve'
  | 'finance.export'
  | 'system.maintain'
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

| 任务 | 组件 |
| --- | --- |
| 简单输入任务 | Dialog |
| 破坏性确认 | AlertDialog |
| 只读详情、辅助筛选 | Sheet |
| 移动端底部操作 | Drawer |
| 复杂创建/编辑 | 独立 TaskPage |
| 小型上下文信息 | Popover / HoverCard |

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

| 偏好 | 可选值 | V2 默认值 | 说明 |
| --- | --- | --- | --- |
| Theme Mode | Light / Dark / System | System | 跟随系统且允许手动覆盖 |
| Theme Preset | Default / Brutalist / Soft Pop / Tangerine | Default | 每套预设必须覆盖明暗模式和完整语义 Token |
| Font | V2 字体 Registry 中的可用字体 | Geist | 只加载当前字体，避免全量字体进入首屏 |
| Content Layout | Centered / Full Width | Centered | 数据密集页可自行请求 Full Width |
| Navbar Behavior | Sticky / Scroll | Sticky | 全屏工作台可覆盖为 Scroll 或隐藏 |
| Sidebar Style | Sidebar / Inset / Floating | Sidebar | 保留模板三种外观 |
| Sidebar Collapse Mode | Icon / Offcanvas | Icon | 桌面端默认 Icon；移动端统一 Drawer/Offcanvas |
| Density | Compact / Comfortable | Comfortable | Token Boat 增补，用于表格、设置和详情页 |

设置面板提供实时预览和 Restore Defaults。Theme Mode、Theme Preset 和 Font 写入共享、带版本的 `appearance_preferences_v1`；Content Layout、Navbar、Sidebar 和 Density 分别写入 User/Admin 布局 Store，防止管理后台的密集布局改变用户中台。应用启动时在 React 挂载前同步根元素的 `data-*` 属性和 `.dark` class，避免主题闪烁和布局跳动。未来如需要跨设备同步，可增加用户偏好 API，但本地偏好不得与管理员系统设置混存。

主题预设只能修改语义 CSS Variables，包括 background、foreground、card、primary、accent、border、ring、chart 和 sidebar Token。页面组件不得根据预设名称编写条件样式。Logo、系统名称、favicon 和租户品牌色属于管理员品牌配置；Theme、Font、Layout、Sidebar 和 Density 属于当前用户外观偏好，两类设置必须分离。

### 10.5 shadcn / Base UI 实现约束

V2 使用 `base-nova`，组件 API 以项目 `components.json` 和 `bunx --bun shadcn@latest info --json` 的实际输出为准。Studio Admin 的 Next 主仓库当前使用 Radix API，V2 只把它作为视觉与交互基线；代码优先取同作者 Base UI/TanStack 版本，或按 Base UI API 移植，不得直接复制 `asChild` 等 Radix 写法。

- 优先使用项目已安装组件；新增官方组件通过 shadcn CLI 添加，不手工下载 GitHub Raw 文件。
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
  id: number
  name: string
  provider: ProviderCode
  health: 'healthy' | 'degraded' | 'offline' | 'unknown'
  enabled: boolean
}
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
  all: ['channels'] as const,
  list: (filters: ChannelFilters) => [...channelKeys.all, 'list', filters] as const,
  detail: (id: number) => [...channelKeys.all, 'detail', id] as const,
}
```

- 路由 loader 使用 `ensureQueryData` 预取首屏数据。
- 独立请求并行发起，禁止可避免的 waterfall。
- mutation 明确声明失效范围，不允许全局 `invalidateQueries()`。
- 轮询仅在页面可见且任务未完成时运行。
- 大查询结果不持久化到 localStorage。
- 用户切换、登出或会话变化时清理用户级缓存。

### 11.4 状态归属

| 状态 | 存放位置 |
| --- | --- |
| 服务端实体、列表、统计 | TanStack Query |
| 搜索、分页、过滤、Tab | URL search params |
| 输入、校验、提交 | React Hook Form |
| 弹层开关、当前选中 | 页面局部 state |
| 主题、语言、密度 | 带版本的 preference storage |
| 登录会话摘要、capability | Auth context/store，内存为主 |
| 长任务进度 | Query/SSE + notification center |

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
  zh-TW/
  fr/
  ru/
  ja/
  vi/
```

- Key 使用稳定语义路径，不使用整句英文作为 key。
- 领域术语进入共享 glossary。
- 数量、复数、性别和插值使用 ICU message。
- 日期、时间、数字、金额和百分比必须使用 locale formatter。
- UI 布局必须覆盖法语/俄语长文本和 CJK 无空格文本。
- 公共站点为语言页面生成 canonical 与 `hreflang`。
- 默认语言 URL 不强制前缀，其他语言使用 `/{locale}/...`。
- Console 语言来自用户设置，未登录时使用浏览器语言，最后回退 en。

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

| 层级 | 目标 | 工具 |
| --- | --- | --- |
| Domain 单元测试 | 金额、额度、权限、过滤、状态机 | Vitest |
| Component 行为测试 | 表单、弹层、表格、键盘、错误状态 | Testing Library |
| API 集成测试 | 查询、mutation、错误、重试、缓存 | MSW + Vitest |
| Route 集成测试 | 权限、参数、预取、错误边界 | Router test harness |
| E2E | 用户完整任务 | Playwright |
| 视觉回归 | Shell、关键页面、明暗模式、语言 | Playwright screenshot |
| 契约测试 | OpenAPI 与客户端生成一致 | OpenAPI validation + typecheck |

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

| 模式 | 说明 |
| --- | --- |
| Embedded | 默认模式；`frontend/dist` 嵌入 Go 二进制 |
| External static | 通过 `FRONTEND_BASE_URL` 托管到 CDN/对象存储 |
| Electron | Electron 加载本地 Go 服务的 `/console` |
| Development | Site、Console 和 Go API 分别启动，通过 Vite/Astro proxy 访问 API |

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

| 层级 | 现有版本 | V2 开发期 | 隔离要求 |
| --- | --- | --- | --- |
| 源码 | `web/` | `frontend/` | 不直接导入旧前端内部模块，不覆盖生成文件 |
| Git | 当前稳定分支/工作区 | 独立 feature 分支或 worktree | 当前紧急修复按明确流程同步，不混合未完成 V2 变更 |
| 依赖 | `web/bun.lock` | `frontend/bun.lock` | 不共享 `node_modules`、锁文件或脚本副作用 |
| 构建 | `web/dist` | `frontend/dist` | 现有 Go embed 和 Docker Release Job 在切换前保持原样 |
| 运行 | 当前生产域名 | 独立本地端口和 staging 域名 | 不在生产 Router 暴露半成品路由 |
| API | 当前稳定契约 | Mock → staging API → Release Candidate | 新接口只做向后兼容扩展，不改变旧接口语义 |
| 数据 | 生产 DB/Redis | 脱敏 DB 副本、独立 Redis 和对象存储 | 禁止开发环境写生产数据 |
| 外部集成 | 生产 OAuth/支付/回调 | 独立应用、Sandbox 和 Callback Domain | 生产密钥不进入 V2 环境 |

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

| 角色 | 建议人数 | 主要职责 |
| --- | ---: | --- |
| Product Owner | 1 | 范围、优先级、验收、关键指标 |
| UX Lead | 1 | 信息架构、用户流程、研究、可用性测试 |
| Product Designer | 1 | 视觉系统、原型、组件规范、设计 QA |
| Frontend Architect | 1 | ADR、workspace、API、性能和代码审查 |
| Frontend Engineer | 4 | 按领域交付页面和测试 |
| QA Automation | 1 | 测试矩阵、Playwright、发布验证 |
| Backend Engineer | 0.5～1 | OpenAPI、错误契约、权限、必要接口调整 |
| SRE/DevOps | 0.25 | 构建、静态缓存、Telemetry、灰度与回滚 |

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

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| OpenAPI 不完整 | 前后端反复返工 | Phase 0 先补已使用接口，按迁移波次完成契约 |
| 隐藏功能遗漏 | 无法删除旧版 | 建立页面/按钮/权限矩阵，旧版埋点识别真实使用 |
| 双轨时间过长 | 维护成本翻倍 | 每个领域设删除日期；不在旧版继续做纯视觉优化 |
| 复杂表单失控 | 再次形成巨型组件 | Schema、步骤状态机、FormSection 和领域 adapter 分层 |
| 设计系统过度抽象 | 延迟业务交付 | 只有两个以上已确认用例才进入 Pattern；单一业务留在 Domain |
| Bundle 再次膨胀 | 控制台体验下降 | 路由预算、直接导入、重型库懒加载、CI 阻断 |
| User/Admin 再次耦合 | 普通用户下载管理代码，发布和导航互相影响 | 独立 app、Router、RouteCatalog、QueryClient、构建和依赖边界检查 |
| 权限不一致 | 越权或入口混乱 | 后端 capability、RouteCatalog、路由和 E2E 四层验证 |
| 计费展示错误 | 财务风险 | 金额/额度领域测试、后端值为准、禁止浮点自行推导 |
| Electron 路由异常 | 桌面版不可用 | Phase 2 即接入 Electron smoke，不留到最终阶段 |
| 静态公共站点配置滞后 | 品牌/价格不及时 | 稳定内容 SSG；运行时价格、状态和租户配置使用小型 Island |

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

| 层级 | 预估可复用比例 | 决策 |
| --- | ---: | --- |
| Base UI / shadcn Primitive | 70%～90% | 复用兼容概念，实际组件以 V2 registry 为准 |
| Shared Console Shell、侧栏、顶栏、偏好设置 | 85%～95% | 作为两套新版应用壳的共同基线，按 Base UI 和 Token Boat 权限模型适配 |
| 页面布局与组合组件 | 50%～75% | 主要价值，按页面迁移 |
| 图表、表格、表单实现 | 30%～60% | 保留布局，接入 V2 统一内核 |
| 数据、权限、API 和业务逻辑 | 低于 20% | 按 Token Boat 领域重写 |
| 整个模板代码库 | 约 25%～35% | 不 Fork，不整体迁入 |

### 29.2 Shared Console Shell 强制采用范围

| 模板能力 | 采用决策 | Token Boat 适配 |
| --- | --- | --- |
| SidebarProvider / SidebarInset | 完整采用布局模型 | 保持内容区独立滚动、移动端 Drawer、桌面端折叠和 full-bleed 页面契约 |
| AppSidebar | 完整采用视觉和交互 | User/Admin 分别注入 RouteCatalog；不共享菜单数据 |
| NavMain | 完整采用 | 保留分组、二级折叠、活动状态、Badge、Tooltip 和 Icon Mode |
| Header | 完整采用布局 | 左侧保留 Sidebar Trigger 和 Search；右侧放设置、主题、通知、语言、账户 |
| SearchDialog | 完整采用交互 | User 搜索 Key、用量、任务和文档；Admin 搜索渠道、模型、用户、价格、订单和设置；分别经过权限过滤 |
| LayoutControls | 完整采用能力 | Theme Preset、Font、Mode、Page Layout、Navbar、Sidebar Style、Collapse、Density、Restore Defaults |
| ThemeSwitcher | 完整采用 | 提供 Light、Dark、System 快捷切换，与完整设置面板共享同一 Store |
| AccountSwitcher | 保留位置和菜单结构 | 接入真实用户、角色、账户设置和退出登录；管理员可在此进入 Admin 或返回 User Console |
| GitHub Repositories Menu | 替换 | 改为通知、系统状态、帮助文档和语言入口 |
| Support Card | 二次开发 | 改为文档、社区、工单或系统告警摘要 |

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

| 模板页面/组件 | V2 目标页面 | 可保留部分 | 必须改造部分 | 优先级 |
| --- | --- | --- | --- | --- |
| Dashboard Shell | User/Admin 共享框架 | 分组侧栏、折叠菜单、顶栏、全局搜索、账户切换、动态主题、布局偏好和响应式导航 | 移除 GitHub 菜单和 Server Function；抽成 Shared Shell，由两套 appConfig 接入 RouteCatalog、capability、i18n | P0 |
| Default Dashboard | 开发者/管理员总览 | MetricCard、趋势、近期记录和异常摘要布局 | 指标模型、时间范围、真实 API、权限 | P0 |
| Analytics | 用量与运营分析 | KPI、时间筛选、趋势、排行和实时数据布局 | 使用统一图表组件；替换流量语义和 Mock 数据 | P0 |
| Infrastructure | 渠道、Provider 和系统运行监控 | 健康状态、延迟、可用率、分组和快捷操作 | 删除固定 1700px 宽表格；改为核心列、可选列和详情 Sheet | P0 |
| Mail | 使用日志、任务日志、请求追踪 | 可调整宽度的列表/详情、移动端 Drawer | 邮件内容改成概览、请求、响应、计费、路由、错误标签页 | P0 |
| Tasks | 通用 CollectionPage | 筛选栏、列设置、分页和行操作的视觉结构 | 不复制表格内核；使用 V2 服务端 DataGrid | P0 |
| Users | 管理员用户页 | 页面信息密度、筛选和动作布局 | 权限、服务端查询、批量操作和移动端卡片 | P1 |
| Roles | 权限管理页 | 分组和角色信息结构 | 与后端 capability 模型对齐，不伪造不存在的 RBAC 能力 | P1 |
| Profile | 用户、渠道、模型、Key 等实体详情 | Header、Tabs、主内容和状态侧栏 | 抽象为 `EntityDetailLayout`，替换领域内容 | P1 |
| Finance | 钱包、充值、订阅、财务运营 | 余额、交易、分布和快捷操作 | 统一金额精度、时区、审计和权限 | P1 |
| Auth v1/v2 | 登录和注册外壳 | 分栏、品牌区和响应式结构 | Passkey、OAuth、OTP、Turnstile、协议和错误契约 | P1 |
| Unauthorized / Not Found / Error | 401/403/404/500/503 | 错误页视觉壳和返回动作 | i18n、request ID、重试和错误上报 | P1 |

### 29.4 适合二次开发的页面

| 模板页面 | V2 使用方向 | 复用策略 |
| --- | --- | --- |
| Chat | Playground | 只取三栏、会话列表、Thread、Composer 外壳和移动端 Sheet；保留 Token Boat 的 AI 业务内核 |
| Invoice | 销售价目表、渠道配置、价格版本编辑 | 采用“左侧编辑 + 右侧实时预览”，替换发票领域和计算逻辑 |
| Logistics | 异步绘图/视频任务、请求路由链路 | 保留主从详情、阶段状态和移动端 Sheet；世界地图默认删除 |
| File Manager | Files API、批处理文件或模型资源目录 | 有明确产品能力后再启用，保留搜索、网格/列表切换和批量动作 |
| E-commerce | 模型市场、模型目录、公开定价 | 参考商品、热门项目和订单布局，领域内容全部重写 |
| Patient Monitoring | 实时渠道监控和 NOC 运行中心 | 波形和病人卡片改为吞吐、并发、延迟、错误、队列和熔断 |
| Kanban | 渠道接入、模型商业化、价格发布流程 | 路由级加载 DND，只在流程状态确实存在时开发 |
| CRM | 渠道接入或经销商管理 | 保留 Pipeline、任务和机会结构，业务模型重写 |
| Productivity | 管理员工作台 | 参考待处理事项、快捷动作和右侧辅助栏 |

### 29.5 只参考布局或默认放弃的页面

| 页面/模块 | 决策 | 原因 |
| --- | --- | --- |
| Academy | 只参考 | 可用于 Getting Started 和文档中心，但教育业务模型无复用价值 |
| Calendar | 默认放弃 | 当前缺少核心日历场景，FullCalendar 成本和包体不值得 |
| Legacy Dashboards | 放弃 | 与新版 Dashboard 重复，只增加维护面 |
| Dashboard Chat/Mail iframe 路由 | 放弃 | Playground 和日志必须是一等路由，不允许 iframe 包装 |
| GitHub Repository 菜单 | 放弃 | 与 Token Boat 产品任务无关 |
| 未经设计验收的新增主题预设 | 默认放弃 | 保留模板现有 Default、Brutalist、Soft Pop、Tangerine；新增预设需完成完整 Token 和可访问性验收 |
| Mock 数据和演示 Store | 放弃 | 不得成为生产领域模型或 Query Cache 的替代品 |
| 重复 Tasks/Users/Roles 表格实现 | 放弃 | 统一收敛到 V2 DataGrid Pattern |
| D3 世界地图、Flag CSS、Simple Icons 全量资源 | 默认放弃 | 只有明确页面需求时才按需引入 |

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

| 聚合工作台 | 核心关联 | 主要管理模式 |
| --- | --- | --- |
| Channel Operations | Channel、ChannelModel、Ability、Model Mapping、Probe、Usage、Purchase Price | EntityPage + Tabs + Health Context + Impact Preview |
| Model Commercialization | Model、Routing Target、ChannelModel、Ability、Official/Purchase/Sales Price | Checklist + EntityPage + 价格血缘与版本 diff |
| User 360 | User、Token、安全凭据、Subscription、Price Book Assignment、资金和 Log | EntityPage + 关联表 + 审计时间线 |
| Request Trace | Log、User、Token、Channel、Task、RequestPricingSnapshot | Mail 式 Master–Detail + 只读诊断 Tabs |
| Pricing Governance | Official/Purchase Price Version、Price Book/Version/Item、Change Batch、Audit | Workflow + Version/Diff + 发布影响预览 |
| Finance Case | TopUp/Subscription Order、User、Callback Event、额度入账和 Audit | 案件详情 + Timeline + 受控人工命令 |

关系盘点必须区分稳定 ID 的直接关联、业务键的逻辑关联、不可变历史快照和主库/日志库跨库引用。界面只展示对当前任务有帮助的关系，不把数据库 ER 图直接当作产品导航。

详细关系图、现有后台管理方式初审、六个工作台结构、Pattern 选择规则、API 缺口和 Phase 0 验收矩阵统一维护在 [`Frontend V2 Phase 0：领域关系与关联管理盘点`](./frontend-v2-phase-0-domain-inventory.zh_CN.md)。该文档与 route/permission/API inventory 一起作为页面设计和接口开发的前置输入。

---

《Frontend V2 Phase 0：领域关系与关联管理盘点》已建立第一版。下一步必须补齐可逐项验收的 route/permission/API/action matrix，列出每个旧路由、页面、接口、权限、模块开关、关联实体、写入副作用、迁移目标和删除条件。没有完成并评审该矩阵前，不应开始批量编写新页面。
