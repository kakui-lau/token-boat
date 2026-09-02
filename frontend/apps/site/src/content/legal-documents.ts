type LegalDocumentKey = "privacy" | "terms";
type LegalLocale = "en" | "zh";

export const legalDocumentDrafts: Record<LegalLocale, Record<LegalDocumentKey, string>> = {
  zh: {
    terms: `# Token Boat 服务条款

**最后更新：2026 年 9 月 2 日**

> 发布说明：本页面是公共站点初稿，用于说明当前产品和服务边界。运营主体名称、注册地址、正式通知邮箱、适用法律及争议解决地应在正式上线前由运营方确认。后台发布的正式文本、订单或另行签署的协议与本初稿不一致时，以正式文本为准。

## 1. 接受条款

访问 Token Boat 网站、创建账户、生成 API Key、充值或调用 API，即表示你已阅读并同意本条款及[隐私政策](/legal/privacy)。如果你代表公司或其他组织使用服务，你确认自己有权代表该组织接受这些条款。

## 2. 服务内容

Token Boat 提供统一的 AI API 网关、模型目录、账户管理、用量记录、计费与相关开发工具。具体可用模型、端点、区域、能力、价格和限额可能随上游供应商、账户等级及平台配置变化。

部分服务由第三方模型供应商实际处理。Token Boat 不拥有或控制第三方模型，其输出质量、可用性、内容政策和数据处理方式可能各不相同。

## 3. 账户与 API Key

你应提供真实、准确并保持更新的账户信息，并妥善保管密码、二次验证凭据和 API Key。API Key 应仅保存在可信的服务端环境，不应写入前端代码、公开仓库、日志或聊天记录。

通过你账户或 API Key 发起的请求，原则上视为由你授权。发现凭据泄露、异常扣费或未经授权的调用时，应立即撤销相关密钥，并通过[支持中心](/support)提交必要的 Request ID 和时间信息。

## 4. 合理使用

你不得使用服务从事违法活动、侵犯他人权益、绕过安全控制、传播恶意软件、未经授权访问系统、干扰平台稳定性或违反所选模型供应商的使用政策。你也不得转售、共享或滥用账户权益，除非账户方案或书面协议明确允许。

你应对自己的应用、最终用户、提示词、输入数据、输出使用和必要的人工审核负责。对于医疗、法律、金融、安全控制等高风险场景，不应仅依赖模型输出作出决定。

## 5. 输入、输出与知识产权

你保留对合法提交内容所拥有的权利，并保证自己有权提交和处理这些内容。除提供、保护和改进服务所必需，或法律另有要求外，本条款不转移你对输入内容的所有权。

模型输出可能不准确、不完整、具有偏差，或与其他用户获得的内容相似。你有责任在使用或发布前核验输出，并确认其不侵犯第三方权利。输出的权利归属还可能受到适用法律和上游供应商条款限制。

## 6. 价格、余额与计费

公共模型页面展示的是公开价格信息或估算组件；账户实际价格、折扣、汇率、计费单位和可用余额以登录后的计费页面及最终账单记录为准。

费用可能按 Token、请求、图片、音视频时长、分辨率、任务数量或其他公开计费单位计算。预扣金额与最终结算可能因实际用量不同而调整。你应在调用前确认价格和预算，并为账户保持足够余额。

除适用法律、订单或平台公布的退款规则另有规定外，已经实际消耗的 API 用量通常不予退还。对于明显的重复扣费或计费异常，可通过支持渠道申请核查。

## 7. 限流、变更与可用性

平台可能基于账户、模型、供应商或系统负载设置 RPM、TPM、并发和任务限制。服务可能因维护、故障、合规要求、上游变更或不可抗力而中断、降级或停止提供。

我们会在合理范围内通过状态页、公告或控制台提示重大变化，但不保证所有功能永久可用，也不保证任何模型、价格或端点长期保持不变。

## 8. 数据与隐私

我们会按照[隐私政策](/legal/privacy)处理账户信息、请求元数据、用量和必要的服务数据。为完成所选模型调用，请求内容可能被发送给相应的上游供应商。你不应提交完成任务并不需要的个人信息、密钥、受监管数据或敏感业务资料。

如果你代表他人提交个人信息，你应确保拥有适当的法律依据，并完成必要的告知、授权或同意。

## 9. 暂停与终止

如账户存在安全风险、欠费、明显滥用、违法行为、对平台或第三方造成风险，或违反本条款，我们可能限制模型、暂停 API Key 或终止服务。情况允许时，我们会提供说明和申诉或补救路径。

你可以停止使用服务，并按照控制台提供的能力管理密钥和账户。法律要求、争议处理、财务审计或安全调查所需的记录可能在必要期间继续保留。

## 10. 免责声明与责任边界

AI 模型具有概率性。除法律明确要求外，服务按当前可用状态提供，不保证输出准确、唯一、持续可用或适合特定目的。你应自行评估模型、供应商和输出是否适合业务场景。

在法律允许的范围内，任何一方对间接损失、预期收益损失、数据丢失或业务中断的责任应受到合理限制。不得通过本条款排除或限制依法不能排除的责任。

## 11. 条款更新与联系

我们可能为反映产品、供应商、法律或安全实践的变化而更新本条款。重大变更会通过合理方式提示，并在页面标明更新时间。

有关账户、计费、安全或本条款的问题，请通过[支持中心](/support)进入相应处理路径。正式运营主体和法律通知方式配置后，将在此处同步更新。
`,
    privacy: `# Token Boat 隐私政策

**最后更新：2026 年 9 月 2 日**

> 发布说明：本页面是公共站点初稿。正式上线前仍需补充运营主体名称、注册地址、个人信息保护联系方式、具体保存期限以及适用的跨境处理安排。后台发布的正式隐私政策将覆盖本初稿。

## 1. 适用范围

本政策说明 Token Boat 在提供网站、账户、API 网关、计费、日志与支持服务时如何处理信息。你通过所选模型供应商处理的数据，还可能受到该供应商自身隐私政策和数据使用条款约束。

## 2. 我们处理的信息

根据你使用的功能，我们可能处理以下类别的信息：

- **账户信息**：用户名、邮箱、组织或分组信息、登录状态及账户设置。
- **身份验证信息**：密码的安全摘要、OAuth 标识、二次验证或 Passkey 相关的必要凭据。我们不需要你向支持人员提供完整密码或 API Key。
- **API 与运行数据**：模型 ID、端点、请求时间、Token 或媒体用量、响应状态、延迟、Request ID、错误信息及必要的网络诊断信息。
- **请求内容**：为完成模型调用而提交的提示词、消息、文件、图片、音频或视频，以及模型返回的内容。是否记录正文取决于服务配置、产品功能和适用规则。
- **计费信息**：余额、充值、消费、订单、发票和支付状态。银行卡等支付凭据通常由支付服务提供商处理。
- **设备与网络信息**：IP 地址、浏览器或设备类型、语言、时间、Cookie、会话标识和安全事件信息。
- **支持信息**：你主动提交的问题描述、Request ID、附件和沟通记录。

## 3. 处理目的

我们为了创建和保护账户、验证 API 请求、路由模型调用、计算用量与费用、展示日志、排查故障、防止滥用、改进可靠性、履行合同和法定义务而处理必要信息。

我们不会为了与服务无关的目的要求你提交敏感信息。请在发送请求前对个人信息和机密内容进行最小化、去标识化或脱敏。

## 4. 处理依据

根据适用法律和具体场景，处理可能基于履行与你的合同、取得你的同意、履行法定义务、保护账户与平台安全，或其他适用的合法依据。需要单独同意或书面同意的场景，应在相应功能中另行告知并取得授权。

## 5. 模型供应商与服务提供商

为完成你选择的模型调用，Token Boat 会把必要的请求内容和技术信息发送给对应的上游模型供应商。更换模型可能同时更换实际处理数据的供应商。

我们也可能使用云基础设施、内容分发、监控、支付、身份验证和客户支持服务提供商。服务提供商只能在提供约定服务所需的范围内处理数据，并应受到相应合同和安全义务约束。

## 6. 跨区域处理

不同模型供应商和基础设施可能位于不同国家或地区，因此请求内容可能在你所在地区以外处理。需要进行个人信息跨境提供时，我们将按照适用法律完成必要评估、告知、合同安排或同意流程。无法满足相关要求时，部分模型或区域可能不可用。

## 7. 保存期限

我们仅在实现本政策所述目的、履行合同、处理争议以及满足法律、财务和安全要求所必要的期间保存信息。不同数据类型的期限可能不同；正式期限配置完成后将进一步公开。

当信息不再需要时，我们会按照适用要求删除、匿名化或采取限制处理措施。备份和安全日志可能在有限周期内继续存在。

## 8. 安全措施

我们会根据数据类别和风险采取访问控制、身份验证、密钥隔离、传输保护、日志审计、备份、漏洞修复和事件响应等合理措施。任何系统都无法保证绝对安全，因此你也应保护账户、启用可用的安全功能并定期轮换 API Key。

如果发现疑似泄露或未经授权的访问，请立即撤销相关密钥，并通过[支持中心](/support)报告时间、Request ID 和影响范围，不要在工单中发送完整密钥。

## 9. Cookie 与本地存储

网站可能使用必要的 Cookie 或本地存储来维持登录、语言选择、安全校验和页面设置。若未来加入非必要的分析或营销技术，应在启用前提供适当说明和选择机制。

## 10. 你的权利

在适用法律规定的范围内，你可以请求查阅、复制、更正、删除或限制处理个人信息，撤回基于同意的授权，或注销账户。某些记录可能因法律、安全、计费或争议处理要求而无法立即删除。

你可以先通过控制台管理账户资料和密钥；其他请求请通过[支持中心](/support)提交。为保护账户，我们可能需要验证请求人的身份。

## 11. 未成年人

本服务主要面向具有相应技术和法律能力的开发者与组织，不以未成年人为主要服务对象。未成年人应在监护人同意和指导下使用服务，不应提交不必要的个人或敏感信息。

## 12. 政策更新与联系

我们可能因产品、供应商、法律要求或安全实践变化而更新本政策。重大变更会通过合理方式提示，并在页面标明更新时间。

有关隐私、数据安全或个人权利的问题，请通过[支持中心](/support)提交。正式个人信息保护联系人配置后，将在本页面补充。
`,
  },
  en: {
    terms: `# Token Boat Terms of Service

**Last updated: September 2, 2026**

> Publication note: This is a public-site draft describing the current product and service boundaries. The legal operator name, registered address, formal notice email, governing law, and dispute forum must be confirmed before formal launch. A formally published agreement, order, or separately signed contract prevails if it conflicts with this draft.

## 1. Accepting these terms

By accessing Token Boat, creating an account, generating an API key, adding funds, or calling the API, you agree to these terms and the [Privacy Policy](/en/legal/privacy). If you use the service for an organization, you represent that you can accept these terms on its behalf.

## 2. The service

Token Boat provides a unified AI API gateway, model catalog, account management, usage records, billing, and related developer tools. Available models, endpoints, regions, capabilities, prices, and limits may vary with upstream providers, account plans, and platform configuration.

Some requests are processed by third-party model providers. Token Boat does not own or control those models, and their output quality, availability, content rules, and data practices may differ.

## 3. Accounts and API keys

Keep account information accurate and protect passwords, second-factor credentials, and API keys. API keys belong only in trusted server-side environments—not frontend code, public repositories, logs, or chat messages.

Requests made through your account or keys are generally treated as authorized by you. If you detect exposure, unexpected charges, or unauthorized calls, revoke the affected key immediately and use the [Support Center](/en/support) with the relevant time and Request ID.

## 4. Acceptable use

Do not use the service for unlawful activity, infringement, bypassing safeguards, malware, unauthorized access, service disruption, or conduct prohibited by the selected provider. Do not resell, share, or abuse account benefits unless your plan or a written agreement permits it.

You are responsible for your application, end users, prompts, input data, output use, and appropriate human review. Do not rely solely on model output for medical, legal, financial, safety-control, or other high-risk decisions.

## 5. Inputs, outputs, and intellectual property

You retain the rights you lawfully hold in submitted content and confirm that you are authorized to process it. These terms do not transfer ownership of your input except for the limited rights necessary to provide, secure, and improve the service or comply with law.

Model output may be inaccurate, incomplete, biased, or similar to content produced for others. You must verify output before use or publication and determine whether it infringes third-party rights. Ownership may also depend on applicable law and upstream provider terms.

## 6. Pricing, balance, and billing

Public model pages show public pricing information or estimated components. Account pricing, discounts, exchange rates, billing units, available balance, and final charges are determined by the signed-in billing page and billing records.

Charges may be based on tokens, requests, images, media duration, resolution, task count, or other published units. Pre-authorized and final amounts may differ with actual usage. Review prices and budgets before sending requests and maintain sufficient balance.

Except where law, an order, or a published refund rule requires otherwise, consumed API usage is generally non-refundable. You may request review of duplicate charges or clear billing errors.

## 7. Limits, changes, and availability

The platform may apply RPM, TPM, concurrency, or task limits by account, model, provider, or system load. Maintenance, incidents, compliance requirements, upstream changes, or events beyond reasonable control may interrupt, degrade, or discontinue features.

We will use reasonable channels such as status pages, notices, or console messages for significant changes, but do not promise permanent availability of any model, price, endpoint, or feature.

## 8. Data and privacy

We process account information, request metadata, usage, and necessary service data under the [Privacy Policy](/en/legal/privacy). Request content may be sent to the upstream provider needed to complete the selected model call. Do not submit personal data, credentials, regulated data, or sensitive business information unless it is necessary.

If you submit personal data for another person, you are responsible for having an appropriate legal basis and providing any required notice or consent.

## 9. Suspension and termination

We may restrict models, suspend API keys, or terminate service for security risk, non-payment, clear abuse, unlawful conduct, risk to the platform or third parties, or breach of these terms. Where circumstances allow, we will provide an explanation and a path to appeal or remedy.

You may stop using the service and manage keys and account options through the console. Records needed for law, disputes, financial audit, or security investigation may remain for a necessary period.

## 10. Disclaimers and liability boundaries

AI models are probabilistic. To the extent permitted by law, the service is provided as currently available without a promise that output is accurate, unique, uninterrupted, or fit for a particular purpose. You must evaluate whether each model, provider, and output suits your use case.

Where legally permitted, liability for indirect loss, lost expected profit, data loss, or business interruption should be reasonably limited. Nothing here excludes liability that cannot lawfully be excluded.

## 11. Updates and contact

We may update these terms to reflect changes in products, providers, law, or security practices. Material updates will be communicated through reasonable means and identified by the updated date.

For account, billing, security, or terms questions, use the [Support Center](/en/support). Formal operator and legal notice details will be added once configured.
`,
    privacy: `# Token Boat Privacy Policy

**Last updated: September 2, 2026**

> Publication note: This is a public-site draft. Before formal launch it must be completed with the legal operator name, registered address, privacy contact, specific retention periods, and applicable cross-border arrangements. A formally published privacy policy will replace this draft.

## 1. Scope

This policy explains how Token Boat handles information when providing the website, accounts, API gateway, billing, logs, and support. Data processed through a selected model provider may also be governed by that provider's privacy and data-use terms.

## 2. Information we process

Depending on the features you use, we may process:

- **Account data:** username, email, organization or group information, sign-in status, and settings.
- **Authentication data:** protected password representations, OAuth identifiers, and credentials needed for second-factor or passkey features. Support never needs your complete password or API key.
- **API and operational data:** model ID, endpoint, request time, token or media usage, response status, latency, Request ID, errors, and necessary network diagnostics.
- **Request content:** prompts, messages, files, images, audio, or video submitted for a model call and the resulting output. Whether body content is logged depends on service configuration, product features, and applicable rules.
- **Billing data:** balance, recharge, consumption, orders, invoices, and payment status. Payment-card credentials are generally handled by payment providers.
- **Device and network data:** IP address, browser or device type, language, timestamps, cookies, session identifiers, and security-event data.
- **Support data:** issue descriptions, Request IDs, attachments, and communications you submit.

## 3. Why we process information

We process necessary information to create and protect accounts, authenticate API requests, route model calls, calculate usage and charges, display logs, diagnose incidents, prevent abuse, improve reliability, perform contracts, and meet legal obligations.

We do not need sensitive information unrelated to the service. Minimize, de-identify, or redact personal and confidential content before sending a request.

## 4. Legal bases

Depending on applicable law and context, processing may rely on performing a contract with you, your consent, legal obligations, account and platform security, or another lawful basis. Where separate or written consent is required, the relevant feature should provide a specific notice and consent flow.

## 5. Model providers and service providers

To complete a selected model call, Token Boat sends the necessary request content and technical information to the corresponding upstream model provider. Changing models may also change the party processing the request.

We may also use cloud infrastructure, content delivery, monitoring, payment, authentication, and customer-support providers. They should process data only as needed to deliver the contracted service and remain subject to appropriate contractual and security duties.

## 6. Cross-region processing

Model providers and infrastructure may operate in different countries or regions, so request content may be processed outside your location. Where cross-border transfer rules apply, we will use required assessments, notices, contractual measures, or consent. Models or regions may be unavailable where those requirements cannot be met.

## 7. Retention

We keep information only as long as necessary for the purposes in this policy, contract performance, disputes, and legal, financial, or security requirements. Different data categories may have different periods; formal periods will be published once configured.

When information is no longer needed, we delete, anonymize, or restrict it as required. Backups and security logs may remain for a limited cycle.

## 8. Security

We use reasonable measures based on data type and risk, which may include access controls, authentication, key isolation, transport protection, audit logging, backups, remediation, and incident response. No system can guarantee absolute security, so you should also protect accounts, enable available security features, and rotate API keys.

If you suspect exposure or unauthorized access, revoke the key immediately and report the time, Request ID, and affected scope through the [Support Center](/en/support). Never place a complete key in a support request.

## 9. Cookies and local storage

The website may use necessary cookies or local storage for sign-in, language preferences, security checks, and page settings. If non-essential analytics or marketing technology is introduced, an appropriate notice and choice mechanism should be provided before activation.

## 10. Your rights

Subject to applicable law, you may request access, a copy, correction, deletion, or restriction of personal data, withdraw consent, or close an account. Some records cannot be deleted immediately when required for law, security, billing, or dispute handling.

Use the console for available account and key controls. Submit other requests through the [Support Center](/en/support). We may verify identity before acting to protect the account.

## 11. Children

The service is designed primarily for developers and organizations with the necessary technical and legal capacity, not for children. A minor should use it only with guardian consent and guidance and should not submit unnecessary personal or sensitive information.

## 12. Updates and contact

We may update this policy for changes in products, providers, law, or security practices. Material changes will be communicated through reasonable means and identified by the updated date.

For privacy, data-security, or individual-rights requests, use the [Support Center](/en/support). A formal privacy contact will be added here once configured.
`,
  },
};
