# 对外 API 安全与性能审查报告

审查日期：2026-08-27
审查分支：`codex/sales-price-books`
审查方式：源码静态审查；未对线上环境执行渗透、压测或破坏性测试。

## 结论

对外 API 的认证、请求体大小限制、敏感参数日志脱敏、SSR​​F 防护、计费快照与预扣/结算链路已经具备较好的基础，但当前仍有 1 个 P0、6 个 P1 和若干 P2 问题。

在 P0 修复前，不建议把当前版本直接扩大到公开流量。P1 中的请求取消/超时、响应体上限和限流问题会直接影响网关在慢上游、异常上游或突发请求下的稳定性，应在正式发布或扩量前完成。

## 已确认的有效防护

- Relay 请求统一经过 32 MB 的解压后大小限制，可以阻止压缩炸弹绕过普通 Content-Length 限制：`middleware/gzip.go:26-95`。
- 上游失败日志对请求体做敏感字段遮盖并限制为 8 KB：`common/request_log.go:13-154`、`relay/channel/api_request.go:551-589`。
- 用户可控的图片/媒体抓取路径已有 SSRF 校验和受保护的 HTTP Client：`relay/mjproxy_handler.go:156-173`、`service/http_client.go:54-72`。
- 新定价链路在请求预扣前创建价格快照，重试期间保留已冻结的价格依据：`controller/relay.go:206-287`。
- API Key 使用密码学安全随机源生成：`common/utils.go:246-256`。

## P0

### API-SEC-001：Midjourney 图片代理未认证，存在越权读取与公共带宽代理风险

**证据**

- `/mj/image/:id` 与 `/:mode/mj/image/:id` 在 `TokenAuth` 注册前公开：`router/relay-router.go:218-220`。
- 处理函数仅按 `mj_id` 查询任务，没有校验当前用户：`relay/mjproxy_handler.go:134-142`、`model/midjourney.go:136-143`。
- 成功后直接把远端图片流式转发，未配置下载限流或响应大小上限：`relay/mjproxy_handler.go:174-201`。

**影响**

知道或获得任务 ID 的未登录访问者可以读取其他用户的生成结果；该路由还可被反复调用消耗出口带宽和上游流量。任务 ID 不易猜中只能降低被发现概率，不能替代对象级授权。

**修复建议**

1. 把图片路由移到 `TokenAuth` 之后，并使用 `(user_id, mj_id)` 查询。
2. 若确实需要公开展示，改成带过期时间、对象 ID 和签名的短期下载 URL，而不是永久裸 ID。
3. 增加独立的下载限流、缓存、允许的 Content-Type 和最大响应字节数。

**临时缓解**

在入口网关先禁止匿名访问这两个路径，或只允许站内受信来源访问。

## P1

### API-REL-002：客户端断开不会取消上游请求，默认总超时为无限

**证据**

- HTTP、表单和异步任务请求使用 `http.NewRequest`，没有绑定 `c.Request.Context()`：`relay/channel/api_request.go:309-336`、`339-368`、`667-686`。
- WebSocket 上游连接使用 `Dial` 而不是 `DialContext`：`relay/channel/api_request.go:371-398`。
- Relay Client 仅在 `RELAY_TIMEOUT != 0` 时设置总超时，而默认值为 `0`：`service/http_client.go:101-109`、`common/init.go:108-114`。
- Transport 有连接和 TLS 握手超时，但没有响应头超时：`service/http_client.go:74-94`。

**影响**

客户端取消、浏览器关闭或入口超时后，上游请求仍可能继续运行并产生费用；慢上游或不返回响应头的上游会长期占用连接和 goroutine。并发放大时会形成资源耗尽。

**修复建议**

- 普通 Relay 使用 `http.NewRequestWithContext(c.Request.Context(), ...)`；WebSocket 使用 `DialContext`。
- 后台异步任务使用独立但有明确截止时间的 context，不复用已经结束的客户端 context。
- 给非流式请求配置总超时；给流式请求配置连接、TLS、响应头和空闲读取超时，不要设置会截断正常 SSE 的短全局 `WriteTimeout`。
- 对不同渠道/接口允许覆盖合理的超时档位，并设置平台上限。

### API-SEC-003：异步任务把完整上游请求体明文持久化，且没有长度上限

**证据**

- 每次上游请求都会完整读取请求体，并在成功发送前保存，不仅限于失败请求：`relay/channel/api_request.go:480-507`、`593-600`。
- 保存内容直接使用原始 `string(body)`：`relay/channel/api_request.go:510-521`。
- 完整 Body 被写入任务 `private_data`，写入时还会开启事务和行锁：`model/task.go:144-166`。
- 日志路径使用了 8 KB 脱敏预览，但数据库持久化路径没有使用相同的脱敏函数：`relay/channel/api_request.go:551-589`。

**影响**

提示词、回调地址、嵌入字段中的密钥、Base64 图片或文件内容可能长期保存在数据库中；单个任务最多可接近请求体上限，造成数据库膨胀、大 JSON 行更新、锁等待和备份敏感面扩大。

**修复建议**

- 默认只保存脱敏后的有限预览、原始大小、哈希、Content-Type 和字段清单。
- 文件、multipart 内容和 Base64 只保存元数据，不保存正文。
- 完整诊断包如果业务必须保留，应改成显式开启、加密存储、严格管理员权限和短期自动清理。
- 避免在请求热路径用行锁重写整个 `private_data` 大字段。

### API-REL-004：大量上游响应使用无上限 `io.ReadAll`，异常响应可耗尽内存

**证据**

- OpenAI 非流式响应直接完整读取：`relay/channel/openai/relay-openai.go:246-254`。
- 统一错误处理也会完整读取错误响应：`service/error.go:87-102`。
- 相同模式还存在于 Claude、Gemini、图片、音频和异步任务等多个适配器。
- Midjourney 图片的正常响应虽然是流式复制，但没有最大字节数：`relay/mjproxy_handler.go:174-201`。

**影响**

错误配置、受攻击或异常的上游可以返回超大 JSON/错误页面/媒体文件，使单个请求分配大量内存并触发 Pod OOM；并发时风险更高。

**修复建议**

- 建立统一的受限响应读取函数；错误体使用较小上限，普通 JSON 根据接口设置上限。
- 图片、音频、视频等二进制响应优先流式传输，同时用 `io.LimitReader`/计数 Writer 强制最大值。
- 超限时返回统一的 `upstream_response_too_large`，日志只保留有限预览。

### API-SEC-005：模型请求限流默认关闭，且未覆盖全部计费接口

**证据**

- `ModelRequestRateLimitEnabled` 默认是 `false`：`setting/rate_limit.go:12-16`。
- 模型限流只注册在 `/v1` 和 Gemini `/v1beta`：`router/relay-router.go:79-83`、`204-209`。
- `/v1/models`、`/mj`、`/suno` 等接口没有使用该限流中间件：`router/relay-router.go:19-60`、`183-202`。

**影响**

泄露或被滥用的 API Key 可以快速制造昂贵上游请求、数据库写入和异步任务；只依赖余额不足并不能阻止并发尖峰和信任额度用户的攻击。

**修复建议**

- 默认启用保守限流，并同时限制请求速率与并发数。
- 维度至少包括用户、Token、模型和来源 IP；昂贵的图片/视频任务应有更严格且独立的额度。
- 覆盖所有公开 Relay/Task/下载路由；返回 `429` 和 `Retry-After`。
- 应用限流与入口网关/WAF 限流同时保留，不能互相替代。

### API-SEC-006：现有限流器存在竞态与语义错误

**证据**

- 更新分组限流映射时使用读锁却写入全局 map：`setting/rate_limit.go:30-36`。
- Redis 成功请求限制由 `LLen`、`LIndex`、`LPush`、`LTrim`、`Expire` 多条非原子命令组成：`middleware/model-rate-limit.go:25-75`。
- Redis 操作使用 `context.Background()`，客户端取消后仍继续：`middleware/model-rate-limit.go:79-87`。
- 内存实现检查 `_check` key，却把真正成功数写入另一个 key，实际变成“到达中间件的请求数”限制：`middleware/model-rate-limit.go:132-164`。

**影响**

高并发下可能超发或误限流；动态更新配置有数据竞争风险；Redis 慢请求在客户端取消后仍占资源。作为费用保护边界时可靠性不足。

**修复建议**

- 更新配置改用写锁，并增加并发读写回归测试。
- Redis 限流改为单条 Lua 脚本或已有的原子 token bucket/sliding-window 实现。
- 使用请求 context，并给 Redis 操作设置短超时。
- Redis 与内存模式统一相同的“总请求/成功请求”语义。

### API-PERF-007：每次模型调用解析销售价需要多次串行数据库查询

**证据**

- 每个 Relay 都调用 `ResolveSalesPrice`：`service/pricingruntime/relay.go:155-158`。
- 单次解析依次查询模型、用户绑定/默认报价组、报价组、当前版本和模型报价项：`service/pricingruntime/sales_price_book.go:24-97`、`100-125`。

**影响**

TOB 请求通常产生 5 次左右串行查询，TOC 还可能包含默认报价查询；推理接口的基础延迟和数据库连接占用随请求量线性增长。与预扣、快照、日志写入叠加后，数据库容易先于上游成为瓶颈。

**修复建议**

- 缓存“用户当前报价组/版本”和不可变的已发布版本模型价格，使用版本 ID 做缓存键。
- 用户绑定使用短 TTL，并在绑定/发布时主动失效；报价项随已发布版本不可变，可长时间缓存。
- 仍在请求中写入已解析的版本、报价项和表达式快照，不能因缓存优化破坏计费冻结。
- 增加命中率、解析耗时、数据库查询次数与慢查询指标。

## P2

### API-SEC-008：HTTP Server 与调试端口缺少纵深防护

**证据**

- 主服务未设置 `ReadHeaderTimeout`、`IdleTimeout`、`MaxHeaderBytes`：`main.go:209-212`。
- 开启 `ENABLE_PPROF=true` 后，标准 pprof 直接监听 `0.0.0.0:8005`，没有认证和专用 mux：`main.go:39`、`162-168`。
- panic 具体内容直接返回给客户端：`main.go:181-188`。

**影响**

缺少入口代理保护时，慢请求头可占用连接；误开 pprof 会泄露运行时、请求栈和内存信息；panic 内容可能暴露内部实现。

**修复建议**

- 设置 `ReadHeaderTimeout`、`IdleTimeout` 和 `MaxHeaderBytes`；SSE 不使用短全局写超时。
- pprof 仅绑定 loopback/管理网，使用独立 mux、网络策略和认证。
- 客户端只返回通用 500 与 request ID，详细 panic 仅写服务端日志。

### API-SEC-009：API Key 在数据库中以可直接使用的明文保存

**证据**

- `Token.Key` 是可读字符串列：`model/token.go:14-18`。
- 鉴权直接按原始 Key 查询：`model/token.go:287-308`。

**影响**

数据库快照或只读查询权限一旦泄露，攻击者可立即使用全部用户 Key。当前前端遮罩不会降低数据库泄露风险。

**修复建议**

采用“一次展示”的 Key，数据库只保存固定算法 HMAC/哈希和可识别前缀；Redis 缓存也保存不可逆标识。该改动需要双读迁移、Key 轮换和兼容期，不宜直接原地改列。

### API-SEC-010：默认信任整个私网代理地址段

**证据**

`TRUSTED_PROXIES` 未设置时默认信任 loopback、RFC1918 和 IPv6 ULA：`middleware/trusted_proxies.go:13-26`。

**影响**

在共享集群或存在旁路访问时，任意内网工作负载可能伪造转发 IP，影响 IP 白名单、审计和基于 IP 的限流。风险取决于网络拓扑。

**修复建议**

生产环境强制配置精确的 ingress/LB 地址或 CIDR；服务不会被代理时配置 `TRUSTED_PROXIES=none`，并在启动检查中把生产环境缺失配置视为错误。

### API-SEC-011：Relay CORS 配置过宽且凭据语义冲突

**证据**

Relay 全局允许任意 Origin、任意 Header，同时允许 Credentials：`middleware/cors.go:9-15`、`router/relay-router.go:13-16`。

**影响**

Bearer API 本身不依赖 Cookie，因此直接 CSRF 风险有限；但 `AllowCredentials` 没有必要，任意站点都能在用户主动提供 API Key 后调用接口，且通配 Origin 与凭据组合在浏览器中的行为容易产生兼容性误判。

**修复建议**

公开 Bearer API 保留通配 Origin 时关闭 Credentials，并显式列出允许的 Header/Method；若未来 Relay 使用 Cookie，则必须切换为明确 Origin 白名单并加 CSRF 防护。

### API-SEC-012：缺少 Go 依赖漏洞扫描门禁

本地未发现 `govulncheck` 命令，也未在 `.github` 工作流中发现 `govulncheck`/`gosec`。这不代表当前依赖必然存在漏洞，但表示依赖升级时缺少自动化发现机制。

**修复建议**

CI 增加 `govulncheck ./...`；静态规则扫描可补充 `gosec`，但结果必须人工复核，不能把静态工具输出直接等同于可利用漏洞。

## 建议实施顺序

1. 先修复 `API-SEC-001`，阻断匿名对象读取。
2. 同一批处理 `API-REL-002`、`API-REL-004`、`API-SEC-005`、`API-SEC-006`，建立请求取消、超时、响应上限和可靠限流四道资源保护。
3. 处理 `API-SEC-003`，停止新增原始大请求体并制定存量数据清理策略。
4. 优化 `API-PERF-007`，以版本化缓存降低计费热路径数据库开销。
5. 在上线清单中落实 P2 的 server、pprof、trusted proxies、CORS、Key 存储和依赖扫描。

## 验收建议

- 断开一个正在等待上游的非流式/SSE/WebSocket 客户端，确认上游连接和相关 goroutine 能按策略释放。
- 使用超大错误响应和超大成功 JSON 的模拟上游，确认进程内存有上限且返回明确错误。
- 100～1000 并发压测限流边界，验证 Redis 与内存模式结果一致、不会明显超发。
- 用用户 A 的 Midjourney task ID 请求用户 B/匿名接口，必须返回 403/404。
- 对异步任务提交包含大 Base64 和敏感字段的请求，确认数据库只保存脱敏有限预览。
- 压测销售价解析，记录每请求 SQL 数、P50/P95/P99 解析耗时和缓存命中率，并确认重试/异步结算仍使用原价格快照。
