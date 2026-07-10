# Token Boat / new-api 二次开发快速指南

本文档用于帮助二次开发者快速熟悉项目代码结构、核心链路和常见改造入口。

## 1. 项目定位

Token Boat 基于 new-api 项目演进，是一个 AI API 网关和管理平台。它把 OpenAI、Claude、Gemini、Azure、AWS Bedrock 等多个上游 AI 服务统一成兼容接口，并提供用户管理、密钥管理、渠道管理、计费、额度、日志、后台管理等能力。

核心请求路径可以概括为：

```text
客户端请求
  -> 路由 router
  -> 中间件 middleware
  -> 控制器 controller 或转发层 relay
  -> 业务层 service
  -> 数据层 model
  -> 上游 AI 服务或数据库
```

后台管理接口和模型转发接口是两条最重要的主线：

```text
后台管理：/api/* -> router/api-router.go -> controller/* -> service/* -> model/*
模型转发：/v1/* -> router/relay-router.go -> middleware/* -> relay/* -> relay/channel/* -> service/model
```

## 2. 技术栈

- 后端：Go、Gin、GORM
- 前端默认版：React、TypeScript、Rsbuild、Base UI、Tailwind CSS
- 前端 classic 版：React、Vite、Semi Design
- 数据库：SQLite、MySQL、PostgreSQL
- 缓存：Redis 和内存缓存
- 鉴权：JWT、OAuth、WebAuthn/Passkeys
- 前端包管理：Bun

## 3. 推荐阅读顺序

第一次熟悉项目时，建议按下面顺序读代码：

```text
1. main.go
2. router/main.go
3. router/api-router.go
4. router/relay-router.go
5. router/web-router.go
6. model/main.go
7. model/option.go
8. setting/config/config.go
9. relay/relay_adaptor.go
10. relay/compatible_handler.go
11. relay/channel/adapter.go
12. middleware/distributor.go
13. middleware/auth.go
14. service/channel_select.go
15. service/pre_consume_quota.go
16. service/billing.go
17. service/log_info_generate.go
18. web/default/src/routes
19. web/default/src/features/channels
20. web/default/src/features/system-settings
21. web/default/src/features/keys
```

## 4. 目录结构说明

### 后端核心目录

```text
router/        HTTP 路由注册，区分后台 API、转发 API、前端页面
controller/    后台管理 API handler，负责参数解析和响应
service/       业务逻辑，包含扣费、渠道选择、日志、权限、任务结算
model/         GORM 数据模型、数据库访问、缓存读写
relay/         AI API 转发核心，包含 OpenAI 兼容处理和各供应商 adapter
middleware/    鉴权、限流、渠道分发、CORS、日志、性能统计
setting/       系统配置、模型倍率、价格、运行配置
common/        通用工具，JSON、Redis、额度计算、加密、环境变量
dto/           请求和响应结构体
constant/      渠道类型、API 类型、上下文 key 等常量
types/         公共类型定义
oauth/         GitHub、Discord、OIDC 等 OAuth 登录实现
pkg/           内部独立包，例如 billing expression
i18n/          后端国际化
```

### 前端目录

```text
web/default/                 默认新版前端
web/default/src/routes        路由定义
web/default/src/features      页面和业务模块
web/default/src/components    通用组件
web/default/src/i18n          前端多语言
web/classic/                  classic 旧版前端
```

默认前端常见模块：

```text
web/default/src/features/about             关于页面
web/default/src/features/auth              登录、注册、认证
web/default/src/features/channels          渠道管理
web/default/src/features/keys              API key 管理
web/default/src/features/models            模型管理
web/default/src/features/pricing           价格展示
web/default/src/features/system-settings   系统设置
web/default/src/features/usage-logs        使用日志
web/default/src/features/users             用户管理
web/default/src/features/wallet            钱包、充值、额度
```

## 5. 启动流程

入口在 `main.go`。

启动时大致会完成这些事情：

```text
1. 初始化配置
2. 初始化日志
3. 初始化数据库连接和迁移
4. 初始化缓存
5. 注册系统配置
6. 初始化渠道、模型、倍率等运行时配置
7. 注册定时任务
8. 嵌入并挂载前端静态资源
9. 注册 Gin 路由
10. 启动 HTTP 服务
```

如果要了解一个功能如何被挂载，优先从 `main.go` 和 `router/main.go` 开始追。

## 6. 后台管理 API 链路

后台管理接口主要在 `/api/*` 下，入口是：

```text
router/api-router.go
```

典型链路：

```text
router/api-router.go
  -> controller/channel.go
  -> service/*
  -> model/channel.go
```

常见改造点：

```text
用户管理       controller/user.go + model/user.go
令牌管理       controller/token.go + model/token.go
渠道管理       controller/channel.go + model/channel.go + service/channel_select.go
系统配置       controller/option.go + model/option.go + setting/*
模型管理       controller/model.go + model/model.go + setting/model*
价格/倍率      controller/pricing.go + setting/ratio* + service/billing*
日志查询       controller/log.go + model/log.go + service/log_info_generate.go
```

## 7. 模型转发链路

模型转发接口主要由 `router/relay-router.go` 注册。

典型 OpenAI 兼容请求链路：

```text
POST /v1/chat/completions
  -> router/relay-router.go
  -> middleware.TokenAuth
  -> middleware.Distribute
  -> relay/compatible_handler.go
  -> relay/relay_adaptor.go
  -> relay/channel/<provider>/*
  -> service/pre_consume_quota.go
  -> service/log_info_generate.go
```

这个链路中最关键的职责：

```text
TokenAuth       校验调用方 API key
Distribute      选择可用渠道并写入上下文
relay handler   解析请求、转换格式、调用 adapter
channel adapter 对接具体供应商 API
service billing 预扣费、结算、退款、写日志
model           更新用户额度、写消费日志
```

如果请求出现“选不到渠道”“扣费异常”“供应商请求格式不对”，基本都沿这条链路排查。

## 8. 新增供应商或渠道

新增一个上游供应商时，通常需要关注这些位置：

```text
constant/                 增加渠道类型、API 类型等常量
relay/channel/<provider>  新增供应商 adapter
relay/relay_adaptor.go    注册 adapter
relay/common/             如有通用请求/响应处理，放这里
setting/                  增加模型、倍率、供应商配置
service/channel_select.go 如渠道选择需要特殊逻辑，在这里处理
web/default/src/features/channels 如后台渠道表单需要新增字段，改这里
```

开发时要确认：

```text
1. 供应商是否支持流式输出
2. 请求格式是否 OpenAI 兼容
3. 响应 usage 字段是否可信
4. 错误码如何映射
5. 模型名是否需要映射
6. 计费依据是 token、图片数量、时长还是供应商返回值
7. 是否需要异步任务轮询
```

如果供应商支持 stream options，需要检查并更新支持流式统计的渠道列表。

## 9. 计费、额度和日志

计费相关代码是二次开发的高风险区域。

重点文件：

```text
service/pre_consume_quota.go       预扣费
service/billing.go                 普通请求计费
service/task_billing.go            异步任务计费
service/log_info_generate.go       消费日志生成
common/quota_math.go               quota 安全换算
pkg/billingexpr/expr.md            动态计费表达式设计文档
```

重要原则：

```text
1. 不要直接用 int(float64(...)) 做额度换算
2. 优先使用 common.QuotaFromFloat、common.QuotaRound、common.QuotaFromDecimal
3. 用户可控的数量、时长、图片张数、batch 数都必须有上限
4. 预扣费和结算都不能产生负扣费或溢出
5. 新增 billing path 时，要同时考虑日志审计
```

如果改动态计费或表达式计费，先完整阅读：

```text
pkg/billingexpr/expr.md
```

## 10. 数据库和配置

项目要求同时兼容：

```text
SQLite
MySQL
PostgreSQL
```

数据库相关重点文件：

```text
model/main.go       数据库初始化、迁移、兼容逻辑
model/option.go     系统配置项
model/user.go       用户
model/token.go      API key
model/channel.go    渠道
model/log.go        日志
model/pricing.go    价格
```

开发原则：

```text
1. 优先用 GORM，不要随意写 raw SQL
2. raw SQL 必须考虑三种数据库方言差异
3. 不要使用某个数据库独有的 JSON 类型或 ALTER COLUMN 语法
4. SQLite 迁移尤其要谨慎
5. 不要轻易添加会导致 AutoMigrate 反复变更的 boolean default tag
```

系统配置通常经过这几层：

```text
setting/*
  -> model/option.go
  -> controller/option.go
  -> web/default/src/features/system-settings
```

## 11. 前端开发

默认前端在：

```text
web/default/
```

常用命令：

```bash
cd web/default
bun install
bun run dev
bun run build
bun run typecheck
bun run lint
bun run i18n:sync
```

新增或修改页面时，通常看：

```text
web/default/src/routes
web/default/src/features/<module>
web/default/src/components
```

用户可见文案必须走 i18n：

```text
web/default/src/i18n/locales/en.json
web/default/src/i18n/locales/zh.json
web/default/src/i18n/locales/fr.json
web/default/src/i18n/locales/ja.json
web/default/src/i18n/locales/ru.json
web/default/src/i18n/locales/vi.json
```

React 组件里使用：

```tsx
const { t } = useTranslation();
t('English source text');
```

修改文案后运行：

```bash
cd web/default
bun run i18n:sync
```

## 12. 品牌信息修改入口

品牌、域名、关于页面、页脚、文档链接，常见位置：

```text
web/default/src/features/about/index.tsx
web/classic/src/pages/About/index.jsx
web/default/src/components
web/default/src/features/system-settings
web/default/src/i18n/locales/*.json
README*.md
docs/*
```

建议用 `rg` 搜索旧品牌和旧域名：

```bash
rg -n "new-api|newapi|newapi.pro|github.com/QuantumNous|token-boat.pro"
```

注意区分：

```text
1. 展示给用户的品牌信息，可以改
2. Go module import path，不能随便改，除非整体改 module
3. GitHub API release check 这类功能性地址，要确认是否仍需要保留
```

代码里出现类似下面的 import：

```go
github.com/QuantumNous/new-api/model
github.com/QuantumNous/new-api/service/authz
```

这是 Go module 路径引用，不代表项目运行时依赖远程仓库。只要本地 `go.mod` 的 module 仍是这个路径，内部包引用就必须保持一致。若要彻底改成新 module，需要整体修改 `go.mod` 和全项目 import，风险比改品牌文案高很多。

## 13. 常用排查命令

搜索代码：

```bash
rg -n "关键字"
rg --files
```

查看 Git 状态：

```bash
git status --short
git diff
```

后端测试：

```bash
go test ./...
```

前端构建：

```bash
cd web/default
bun run build
```

Docker amd64 镜像：

```bash
docker buildx build --platform linux/amd64 -t <image>:<tag> .
```

## 14. 二次开发建议

建议先建立三条主线的熟悉度：

```text
1. 后台管理线
   router/api-router.go -> controller -> service -> model

2. 模型转发线
   router/relay-router.go -> middleware -> relay -> relay/channel

3. 计费日志线
   pre_consume_quota -> billing -> log_info_generate -> model/log
```

常见需求的定位方式：

```text
改后台页面       web/default/src/features/*
改后台接口       router/api-router.go + controller/*
改数据库模型     model/*
改系统设置       setting/* + model/option.go + controller/option.go
改模型转发       relay/* + relay/channel/*
改渠道选择       middleware/distributor.go + service/channel_select.go
改扣费逻辑       service/pre_consume_quota.go + service/billing.go
改消费日志       service/log_info_generate.go + model/log.go
改品牌文案       web/default + web/classic + README/docs + i18n
```

## 15. 开发注意事项

后端：

```text
1. JSON marshal/unmarshal 使用 common/json.go 里的 wrapper
2. 数据库逻辑必须兼容 SQLite、MySQL、PostgreSQL
3. 计费相关必须防止溢出、负扣费、无上限用户输入
4. relay 请求中的可选数值字段应使用指针类型配合 omitempty
5. 不要随意改变 provider 协议语义来适配测试
```

前端：

```text
1. 默认使用 web/default
2. 包管理和脚本优先使用 bun
3. 用户可见文案必须走 i18n
4. 修改 UI 后至少跑 bun run build
5. 表单、渠道配置、系统设置要注意和后端 DTO 对齐
```

发布：

```text
1. 构建前确认 git diff
2. 前端构建通过
3. 后端测试或至少目标模块测试通过
4. Docker 镜像按目标架构构建，例如 linux/amd64
5. 推送镜像后用 registry 或云厂商 CLI 确认 tag/digest
```

