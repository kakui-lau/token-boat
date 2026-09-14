import type { SiteLocale } from "@/content/site-copy";

type LegalDocumentKey = "privacy" | "terms";

export const legalDocuments: Record<SiteLocale, Record<LegalDocumentKey, string>> = {
  zh: {
    terms: `# Token Boat 服务条款

**最后更新：2026 年 9 月 12 日**

本条款由 Token Boat 服务运营方发布。订单、单独签署的协议或依法应当优先适用的规则与本条款不一致时，以相应文件为准。

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

有关账户、计费、安全或本条款的问题，请通过[支持中心](/support)进入相应处理路径，或发送邮件至 [support@quantumnous.com](mailto:support@quantumnous.com)。订单或单独协议约定了通知方式的，请同时遵循相应约定。
`,
    privacy: `# Token Boat 隐私政策

**最后更新：2026 年 9 月 12 日**

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

我们仅在实现本政策所述目的、履行合同、处理争议以及满足法律、财务和安全要求所必要的期间保存信息。具体期限会根据数据类别、账户状态、法定时效、安全需要和服务提供商的必要处理周期确定。

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

有关隐私、数据安全或个人权利的问题，请通过[支持中心](/support)提交，或发送邮件至 [support@quantumnous.com](mailto:support@quantumnous.com)。为保护账户与个人信息，我们可能要求验证请求人的身份。
`,
  },
  en: {
    terms: `# Token Boat Terms of Service

**Last updated: September 12, 2026**

These terms are published by the operator of the Token Boat service. If an order, separately signed agreement, or mandatory law conflicts with these terms, the applicable document or rule controls.

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

For account, billing, security, or terms questions, use the [Support Center](/en/support) or email [support@quantumnous.com](mailto:support@quantumnous.com). Follow any additional notice method stated in your order or separate agreement.
`,
    privacy: `# Token Boat Privacy Policy

**Last updated: September 12, 2026**

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

We keep information only as long as necessary for the purposes in this policy, contract performance, disputes, and legal, financial, or security requirements. The period depends on the data category, account status, legal limitation periods, security needs, and necessary processing cycles of service providers.

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

For privacy, data-security, or individual-rights requests, use the [Support Center](/en/support) or email [support@quantumnous.com](mailto:support@quantumnous.com). We may verify your identity before acting to protect accounts and personal data.
`,
  },
  ja: {
    terms: `# Token Boat 利用規約

**最終更新日：2026年9月12日**

本規約は Token Boat サービス運営者が公開するものです。注文書、別途締結した契約、または強行法規と本規約が矛盾する場合は、該当する文書または法令が優先されます。

## 1. 規約への同意

Token Boat のウェブサイトへのアクセス、アカウントや API キーの作成、入金、API の利用により、本規約と[プライバシーポリシー](/ja/legal/privacy)に同意したものとみなされます。組織を代表して利用する場合、あなたはその組織を本規約に同意させる権限を有することを表明します。

## 2. サービス内容

Token Boat は、統合 AI API ゲートウェイ、モデルカタログ、アカウント管理、利用記録、課金、および関連する開発者向け機能を提供します。利用可能なモデル、エンドポイント、地域、機能、料金、制限は、上流プロバイダー、契約プラン、サービス設定により変わる場合があります。

一部の処理は第三者のモデルプロバイダーが行います。Token Boat はそれらのモデルを所有または管理しておらず、出力品質、可用性、コンテンツ規則、データ処理はプロバイダーごとに異なります。

## 3. アカウントと API キー

正確なアカウント情報を維持し、パスワード、二要素認証情報、API キーを安全に管理してください。API キーは信頼できるサーバー環境だけに保存し、フロントエンド、公開リポジトリ、ログ、チャットに記録しないでください。

アカウントまたはキーから送信されたリクエストは、原則として利用者が承認したものとして扱われます。漏えい、不審な請求、無断利用を発見した場合は、直ちにキーを失効させ、時刻と Request ID を添えて[サポートセンター](/ja/support)へ連絡してください。

## 4. 適正利用

違法行為、第三者の権利侵害、安全対策の回避、マルウェア、不正アクセス、サービス妨害、または選択したプロバイダーのポリシーに反する目的で本サービスを利用してはなりません。プランまたは書面契約で明示的に認められていない限り、アカウント特典の転売、共有、濫用も禁止します。

利用者は、自身のアプリケーション、エンドユーザー、プロンプト、入力データ、出力の利用、必要な人手による確認に責任を負います。医療、法律、金融、安全管理などの高リスク判断をモデル出力だけに依存してはなりません。

## 5. 入力、出力、知的財産

利用者は、適法に保有する提出コンテンツの権利を保持し、その処理権限を有することを保証します。サービス提供、安全確保、改善、または法令遵守に必要な限定的権利を除き、本規約は入力の所有権を移転しません。

モデル出力は不正確、不完全、偏りを含む、または他者向けの出力と類似する場合があります。利用・公開前に検証し、第三者の権利を侵害しないことを確認してください。権利帰属は適用法や上流プロバイダーの規約にも左右されます。

## 6. 料金、残高、課金

公開モデルページは公開料金または見積項目を表示します。実際のアカウント料金、割引、為替、課金単位、残高、最終請求は、ログイン後の課金ページと請求記録が基準です。

料金はトークン、リクエスト、画像、メディア時間、解像度、タスク数などの公表単位で計算されます。事前控除額と最終額は実利用により異なる場合があります。利用前に料金と予算を確認し、十分な残高を維持してください。

法令、注文書、公開された返金規則に定めがある場合を除き、消費済みの API 利用料は原則返金されません。重複請求または明白な課金誤りは調査を依頼できます。

## 7. 制限、変更、可用性

アカウント、モデル、プロバイダー、負荷に応じて RPM、TPM、同時実行数、タスク数を制限する場合があります。保守、障害、コンプライアンス、上流の変更、合理的な管理を超える事象により、機能が中断、低下、終了する場合があります。

重大な変更は状態ページ、通知、コンソールなど合理的な方法で案内しますが、特定のモデル、料金、エンドポイント、機能の永続的な提供は保証しません。

## 8. データとプライバシー

アカウント情報、リクエストメタデータ、利用量、必要なサービスデータは[プライバシーポリシー](/ja/legal/privacy)に従って処理します。選択したモデルの呼び出しに必要な内容は、対応する上流プロバイダーへ送信される場合があります。不要な個人情報、認証情報、規制対象データ、機密情報を送信しないでください。

他者の個人情報を送信する場合、適切な法的根拠を確保し、必要な通知または同意を得る責任があります。

## 9. 利用停止と終了

セキュリティ上の危険、未払い、明白な濫用、違法行為、プラットフォームや第三者への危険、本規約違反がある場合、モデル利用や API キーを制限し、サービスを停止または終了することがあります。状況が許す場合は理由と是正手段を案内します。

利用者はいつでも利用を終了し、コンソールでキーとアカウントを管理できます。法令、紛争、会計監査、セキュリティ調査に必要な記録は必要な期間保持される場合があります。

## 10. 免責と責任の範囲

AI モデルは確率的に動作します。法令で求められる場合を除き、サービスは現状有姿で提供され、出力の正確性、独自性、継続性、特定目的への適合性を保証しません。利用者自身がモデル、プロバイダー、出力の適合性を判断してください。

法令で認められる範囲で、間接損害、逸失利益、データ損失、事業中断に対する責任は合理的に制限されます。法令上排除できない責任は除外されません。

## 11. 更新と連絡先

製品、プロバイダー、法令、セキュリティ実務の変更に応じて本規約を更新する場合があります。重要な変更は合理的な方法で通知し、更新日を表示します。

アカウント、課金、セキュリティ、本規約に関する問い合わせは[サポートセンター](/ja/support)または [support@quantumnous.com](mailto:support@quantumnous.com) へお寄せください。注文書や別途契約に通知方法が定められている場合は、その方法にも従ってください。
`,
    privacy: `# Token Boat プライバシーポリシー

**最終更新日：2026年9月12日**

## 1. 適用範囲

本ポリシーは、Token Boat がウェブサイト、アカウント、API ゲートウェイ、課金、ログ、サポートを提供する際の情報の取扱いを説明します。選択したモデルプロバイダーで処理されるデータには、そのプロバイダーのポリシーも適用される場合があります。

## 2. 処理する情報

- **アカウント情報：** ユーザー名、メールアドレス、組織・グループ情報、ログイン状態、設定。
- **認証情報：** 保護されたパスワード表現、OAuth 識別子、二要素認証やパスキーに必要な情報。サポート担当者が完全なパスワードや API キーを求めることはありません。
- **API・運用情報：** モデル ID、エンドポイント、時刻、トークンまたはメディア利用量、状態、遅延、Request ID、エラー、必要なネットワーク診断。
- **リクエスト内容：** プロンプト、メッセージ、ファイル、画像、音声、動画および出力。本文の記録有無はサービス設定、機能、適用規則によります。
- **課金情報：** 残高、入金、消費、注文、請求書、支払状態。カード情報は通常、決済事業者が処理します。
- **端末・ネットワーク情報：** IP アドレス、ブラウザー・端末種別、言語、時刻、Cookie、セッション識別子、セキュリティイベント。
- **サポート情報：** 問題の説明、Request ID、添付、連絡記録。

## 3. 処理目的

アカウントの作成・保護、API 認証、モデル呼び出しのルーティング、利用量と料金の計算、ログ表示、障害調査、不正防止、信頼性向上、契約履行、法令遵守のために必要な情報を処理します。送信前に個人情報や機密情報を最小化、匿名化、またはマスキングしてください。

## 4. 法的根拠

適用法と状況に応じ、契約履行、同意、法的義務、アカウントとプラットフォームの安全、その他の適法な根拠に基づいて処理します。個別または書面の同意が必要な場合、該当機能で通知し同意を取得します。

## 5. モデルプロバイダーとサービス提供者

選択されたモデル呼び出しを完了するため、必要なリクエスト内容と技術情報を対応する上流プロバイダーへ送信します。モデルの変更により実際の処理者も変わる場合があります。

クラウド、配信、監視、決済、認証、サポートの事業者を利用する場合があります。各事業者は契約サービスに必要な範囲でのみデータを処理し、適切な契約上・安全上の義務を負います。

## 6. 国・地域をまたぐ処理

プロバイダーやインフラは異なる国・地域に所在する場合があります。越境移転規則が適用される場合、必要な評価、通知、契約措置、同意を実施します。要件を満たせない地域では一部モデルを利用できない場合があります。

## 7. 保存期間

本ポリシーの目的、契約、紛争、法務、財務、セキュリティに必要な期間だけ情報を保存します。期間はデータ種別、アカウント状態、法定期間、安全上の必要性、サービス提供者の処理周期により決まります。不要になった情報は、法令に従い削除、匿名化、または処理を制限します。

## 8. 安全対策

データとリスクに応じ、アクセス制御、認証、キー分離、通信保護、監査ログ、バックアップ、脆弱性対応、インシデント対応など合理的な措置を講じます。漏えいが疑われる場合は直ちにキーを失効させ、完全なキーを含めずに時刻、Request ID、影響範囲を[サポートセンター](/ja/support)へ報告してください。

## 9. Cookie とローカルストレージ

ログイン、言語設定、安全確認、ページ設定のために必要な Cookie またはローカルストレージを使用する場合があります。不要な分析・広告技術を導入する場合は、事前に適切な説明と選択手段を提供します。

## 10. 利用者の権利

適用法の範囲で、個人情報へのアクセス、写し、訂正、削除、処理制限、同意撤回、アカウント閉鎖を求めることができます。法務、安全、課金、紛争対応に必要な記録は直ちに削除できない場合があります。対応前に本人確認を求めることがあります。

## 11. 子どもの利用

本サービスは主として必要な技術的・法的能力を有する開発者と組織向けであり、子どもを対象としていません。未成年者は保護者の同意と指導のもとで利用し、不要な個人情報や機密情報を送信しないでください。

## 12. 更新と連絡先

製品、プロバイダー、法令、セキュリティ実務の変更に応じて本ポリシーを更新する場合があります。重要な変更は合理的な方法で通知し、更新日を表示します。

プライバシー、データセキュリティ、個人の権利に関する依頼は[サポートセンター](/ja/support)または [support@quantumnous.com](mailto:support@quantumnous.com) へお寄せください。アカウントと個人情報を保護するため本人確認を行う場合があります。
`,
  },
  ko: {
    terms: `# Token Boat 서비스 이용약관

**최종 업데이트: 2026년 9월 12일**

본 약관은 Token Boat 서비스 운영자가 게시합니다. 주문서, 별도 서면 계약 또는 강행 법규가 본 약관과 충돌하는 경우 해당 문서나 법규가 우선합니다.

## 1. 약관 동의

Token Boat 웹사이트 방문, 계정 또는 API 키 생성, 충전, API 호출 시 본 약관과 [개인정보 처리방침](/ko/legal/privacy)에 동의한 것으로 봅니다. 조직을 대신해 서비스를 이용하는 경우 해당 조직을 본 약관에 동의하게 할 권한이 있음을 진술합니다.

## 2. 서비스

Token Boat는 통합 AI API 게이트웨이, 모델 카탈로그, 계정 관리, 사용 기록, 과금 및 관련 개발자 기능을 제공합니다. 이용 가능한 모델, 엔드포인트, 지역, 기능, 가격과 제한은 상위 공급자, 계정 플랜 및 플랫폼 설정에 따라 달라질 수 있습니다.

일부 요청은 제3자 모델 공급자가 처리합니다. Token Boat는 해당 모델을 소유하거나 통제하지 않으며 출력 품질, 가용성, 콘텐츠 정책과 데이터 처리 방식은 공급자마다 다를 수 있습니다.

## 3. 계정과 API 키

정확한 계정 정보를 유지하고 비밀번호, 2차 인증 정보 및 API 키를 안전하게 관리하세요. API 키는 신뢰할 수 있는 서버 환경에만 저장하고 프런트엔드 코드, 공개 저장소, 로그 또는 채팅에 기록하지 마세요.

계정이나 키로 전송된 요청은 원칙적으로 사용자가 승인한 것으로 처리됩니다. 유출, 예상하지 못한 요금 또는 무단 호출을 발견하면 즉시 키를 폐기하고 시간과 Request ID를 포함해 [지원 센터](/ko/support)로 문의하세요.

## 4. 허용되는 사용

불법 행위, 권리 침해, 안전장치 우회, 악성코드, 무단 접근, 서비스 방해 또는 선택한 공급자의 정책을 위반하는 목적으로 서비스를 이용할 수 없습니다. 플랜이나 서면 계약이 명시적으로 허용하지 않는 한 계정 혜택을 재판매, 공유 또는 남용할 수 없습니다.

사용자는 자신의 애플리케이션, 최종 사용자, 프롬프트, 입력 데이터, 출력 사용 및 필요한 사람의 검토에 책임을 집니다. 의료, 법률, 금융, 안전 통제 등 고위험 의사결정을 모델 출력에만 의존하지 마세요.

## 5. 입력, 출력 및 지식재산권

사용자는 합법적으로 보유한 제출 콘텐츠의 권리를 유지하며 해당 콘텐츠를 처리할 권한이 있음을 보증합니다. 서비스 제공, 보호, 개선 또는 법률 준수에 필요한 제한적 권리 외에는 본 약관으로 입력의 소유권이 이전되지 않습니다.

모델 출력은 부정확하거나 불완전하거나 편향될 수 있으며 다른 사용자의 결과와 유사할 수 있습니다. 사용 또는 게시 전에 검증하고 제3자의 권리를 침해하지 않는지 확인하세요. 권리 귀속은 관련 법률과 상위 공급자 약관의 영향을 받을 수 있습니다.

## 6. 가격, 잔액 및 과금

공개 모델 페이지는 공개 가격 또는 예상 구성 요소를 표시합니다. 실제 계정 가격, 할인, 환율, 과금 단위, 잔액 및 최종 요금은 로그인 후 과금 페이지와 청구 기록을 기준으로 합니다.

요금은 토큰, 요청, 이미지, 미디어 시간, 해상도, 작업 수 등 공개된 단위로 계산될 수 있습니다. 사전 차감액과 최종 금액은 실제 사용량에 따라 다를 수 있습니다. 호출 전 가격과 예산을 확인하고 충분한 잔액을 유지하세요.

법률, 주문 또는 공개된 환불 규칙에 달리 정한 경우를 제외하고 이미 사용한 API 요금은 일반적으로 환불되지 않습니다. 중복 청구나 명백한 과금 오류는 검토를 요청할 수 있습니다.

## 7. 제한, 변경 및 가용성

계정, 모델, 공급자 또는 시스템 부하에 따라 RPM, TPM, 동시 실행 및 작업 제한을 적용할 수 있습니다. 유지보수, 장애, 규정 준수, 상위 서비스 변경 또는 합리적인 통제를 벗어난 사유로 기능이 중단, 저하 또는 종료될 수 있습니다.

중대한 변경은 상태 페이지, 공지 또는 콘솔 등 합리적인 방식으로 안내하지만 특정 모델, 가격, 엔드포인트 또는 기능의 영구 제공을 보장하지 않습니다.

## 8. 데이터와 개인정보

계정 정보, 요청 메타데이터, 사용량 및 필요한 서비스 데이터는 [개인정보 처리방침](/ko/legal/privacy)에 따라 처리합니다. 선택한 모델 호출에 필요한 요청 내용은 해당 상위 공급자에게 전송될 수 있습니다. 필요하지 않은 개인정보, 자격 증명, 규제 대상 데이터 또는 민감한 업무 정보를 제출하지 마세요.

타인의 개인정보를 제출하는 경우 적절한 법적 근거를 확보하고 필요한 고지나 동의를 받을 책임이 있습니다.

## 9. 정지 및 종료

보안 위험, 미납, 명백한 남용, 불법 행위, 플랫폼이나 제3자에 대한 위험 또는 본 약관 위반이 있는 경우 모델이나 API 키를 제한하고 서비스를 정지 또는 종료할 수 있습니다. 가능한 경우 이유와 이의 제기 또는 시정 경로를 안내합니다.

사용자는 언제든 이용을 중단하고 콘솔에서 키와 계정을 관리할 수 있습니다. 법률, 분쟁, 재무 감사 또는 보안 조사에 필요한 기록은 필요한 기간 보관될 수 있습니다.

## 10. 면책 및 책임 범위

AI 모델은 확률적으로 작동합니다. 법률이 요구하는 경우를 제외하고 서비스는 현재 이용 가능한 상태로 제공되며 출력의 정확성, 고유성, 지속성 또는 특정 목적 적합성을 보장하지 않습니다. 사용자가 모델, 공급자 및 출력의 적합성을 판단해야 합니다.

법률이 허용하는 범위에서 간접 손실, 예상 이익 손실, 데이터 손실 또는 업무 중단에 대한 책임은 합리적으로 제한됩니다. 법률상 배제할 수 없는 책임은 배제되지 않습니다.

## 11. 변경 및 연락

제품, 공급자, 법률 또는 보안 관행의 변경에 따라 약관을 업데이트할 수 있습니다. 중요한 변경은 합리적인 방법으로 알리고 업데이트 날짜를 표시합니다.

계정, 과금, 보안 또는 약관 문의는 [지원 센터](/ko/support)를 이용하거나 [support@quantumnous.com](mailto:support@quantumnous.com)으로 이메일을 보내 주세요. 주문서나 별도 계약에 추가 통지 방법이 있으면 해당 방식도 따라야 합니다.
`,
    privacy: `# Token Boat 개인정보 처리방침

**최종 업데이트: 2026년 9월 12일**

## 1. 적용 범위

본 방침은 Token Boat가 웹사이트, 계정, API 게이트웨이, 과금, 로그 및 지원을 제공할 때 정보를 처리하는 방식을 설명합니다. 선택한 모델 공급자가 처리하는 데이터에는 해당 공급자의 개인정보 및 데이터 이용 정책도 적용될 수 있습니다.

## 2. 처리하는 정보

- **계정 정보:** 사용자 이름, 이메일, 조직 또는 그룹 정보, 로그인 상태 및 설정.
- **인증 정보:** 보호된 비밀번호 표현, OAuth 식별자, 2차 인증이나 패스키에 필요한 정보. 지원 담당자는 전체 비밀번호나 API 키를 요구하지 않습니다.
- **API 및 운영 정보:** 모델 ID, 엔드포인트, 요청 시간, 토큰 또는 미디어 사용량, 응답 상태, 지연, Request ID, 오류 및 필요한 네트워크 진단.
- **요청 내용:** 프롬프트, 메시지, 파일, 이미지, 오디오, 비디오 및 모델 출력. 본문 기록 여부는 서비스 설정, 기능과 적용 규칙에 따라 달라집니다.
- **과금 정보:** 잔액, 충전, 사용, 주문, 청구서 및 결제 상태. 카드 정보는 일반적으로 결제 서비스 제공자가 처리합니다.
- **기기 및 네트워크 정보:** IP 주소, 브라우저나 기기 유형, 언어, 시간, Cookie, 세션 식별자 및 보안 이벤트.
- **지원 정보:** 사용자가 제출한 문제 설명, Request ID, 첨부 파일 및 연락 기록.

## 3. 처리 목적

계정 생성과 보호, API 인증, 모델 호출 라우팅, 사용량과 요금 계산, 로그 표시, 장애 진단, 남용 방지, 신뢰성 개선, 계약 이행 및 법적 의무 준수를 위해 필요한 정보를 처리합니다. 전송 전에 개인정보와 기밀 정보를 최소화, 비식별화 또는 마스킹하세요.

## 4. 처리 근거

적용 법률과 상황에 따라 계약 이행, 동의, 법적 의무, 계정과 플랫폼 보안 또는 기타 적법한 근거에 의존합니다. 별도 또는 서면 동의가 필요한 경우 관련 기능에서 고지하고 동의를 받습니다.

## 5. 모델 공급자와 서비스 제공자

선택한 모델 호출을 완료하기 위해 필요한 요청 내용과 기술 정보를 해당 상위 모델 공급자에게 전송합니다. 모델 변경 시 실제 데이터 처리자도 변경될 수 있습니다.

클라우드 인프라, 콘텐츠 전송, 모니터링, 결제, 인증 및 고객 지원 제공자를 이용할 수 있습니다. 이들은 계약된 서비스를 제공하는 데 필요한 범위에서만 데이터를 처리하고 적절한 계약 및 보안 의무를 부담합니다.

## 6. 국외 처리

모델 공급자와 인프라는 다른 국가나 지역에 있을 수 있습니다. 국외 이전 규칙이 적용되는 경우 필요한 평가, 고지, 계약 조치 또는 동의를 이행합니다. 요건을 충족할 수 없는 지역에서는 일부 모델을 이용할 수 없습니다.

## 7. 보관 기간

본 방침의 목적, 계약, 분쟁, 법률, 재무 및 보안 요구에 필요한 기간만 정보를 보관합니다. 기간은 데이터 유형, 계정 상태, 법정 시효, 보안 필요와 서비스 제공자의 필수 처리 주기에 따라 결정됩니다. 더 이상 필요하지 않은 정보는 관련 요건에 따라 삭제, 익명화 또는 처리를 제한합니다.

## 8. 보안 조치

데이터와 위험에 따라 접근 제어, 인증, 키 분리, 전송 보호, 감사 로그, 백업, 취약점 대응 및 사고 대응 등 합리적인 조치를 적용합니다. 유출이 의심되면 즉시 키를 폐기하고 전체 키를 포함하지 않은 채 시간, Request ID 및 영향 범위를 [지원 센터](/ko/support)에 알려 주세요.

## 9. Cookie와 로컬 저장소

로그인, 언어 설정, 보안 확인 및 페이지 설정을 위해 필요한 Cookie나 로컬 저장소를 사용할 수 있습니다. 필수적이지 않은 분석 또는 마케팅 기술을 도입할 경우 활성화 전에 적절한 고지와 선택 수단을 제공합니다.

## 10. 정보주체의 권리

적용 법률의 범위에서 개인정보 열람, 사본, 정정, 삭제, 처리 제한, 동의 철회 또는 계정 해지를 요청할 수 있습니다. 법률, 보안, 과금 또는 분쟁 처리를 위해 필요한 기록은 즉시 삭제할 수 없을 수 있습니다. 계정과 정보를 보호하기 위해 신원 확인을 요청할 수 있습니다.

## 11. 아동

서비스는 필요한 기술적·법적 능력을 가진 개발자와 조직을 주 대상으로 하며 아동을 대상으로 하지 않습니다. 미성년자는 보호자의 동의와 지도 아래 이용하고 불필요한 개인정보나 민감 정보를 제출하지 않아야 합니다.

## 12. 변경 및 연락

제품, 공급자, 법률 또는 보안 관행의 변경에 따라 본 방침을 업데이트할 수 있습니다. 중요한 변경은 합리적인 방법으로 알리고 업데이트 날짜를 표시합니다.

개인정보, 데이터 보안 또는 정보주체 권리 요청은 [지원 센터](/ko/support)를 이용하거나 [support@quantumnous.com](mailto:support@quantumnous.com)으로 이메일을 보내 주세요. 계정과 개인정보 보호를 위해 신원을 확인할 수 있습니다.
`,
  },
  "zh-TW": {
    terms: `# Token Boat 服務條款

**最後更新：2026 年 9 月 12 日**

本條款由 Token Boat 服務營運方發布。訂單、另行簽署的協議或依法必須優先適用的規則與本條款不一致時，以相應文件或規則為準。

## 1. 接受條款

存取 Token Boat 網站、建立帳戶或 API Key、儲值或呼叫 API，即表示你同意本條款及[隱私權政策](/zh-TW/legal/privacy)。若你代表組織使用服務，你確認自己有權代表該組織接受本條款。

## 2. 服務內容

Token Boat 提供統一 AI API 閘道、模型目錄、帳戶管理、用量記錄、計費及相關開發工具。可用模型、端點、區域、能力、價格及限制可能依上游供應商、帳戶方案與平台設定而變動。

部分請求由第三方模型供應商處理。Token Boat 不擁有或控制這些模型，其輸出品質、可用性、內容政策及資料處理方式可能各不相同。

## 3. 帳戶與 API Key

你應維持正確的帳戶資訊，並妥善保管密碼、第二因素驗證資料與 API Key。API Key 只應存放在可信任的伺服器環境，不應寫入前端程式碼、公開儲存庫、記錄或聊天內容。

透過你的帳戶或 Key 發出的請求，原則上視為經你授權。若發現憑證外洩、異常扣款或未授權呼叫，請立即撤銷相關 Key，並帶上時間與 Request ID 透過[支援中心](/zh-TW/support)聯絡。

## 4. 合理使用

不得將服務用於違法活動、侵害他人權利、繞過安全控制、散布惡意軟體、未授權存取、干擾服務或違反所選供應商政策的行為。除非方案或書面協議明確允許，亦不得轉售、分享或濫用帳戶權益。

你應對自己的應用程式、最終使用者、提示詞、輸入資料、輸出使用及必要的人工審核負責。醫療、法律、金融、安全控制等高風險決策不應只依賴模型輸出。

## 5. 輸入、輸出與智慧財產權

你保留對合法提交內容所擁有的權利，並確認有權處理該內容。除提供、保護、改善服務或遵守法律所需的有限權利外，本條款不轉移輸入內容的所有權。

模型輸出可能不準確、不完整、有偏差，或與其他使用者的輸出相似。使用或發布前應自行驗證並確認不侵害第三方權利；權利歸屬亦可能受到適用法律與上游供應商條款影響。

## 6. 價格、餘額與計費

公開模型頁面顯示公開價格或估算項目。帳戶實際價格、折扣、匯率、計費單位、可用餘額及最終費用，以登入後的計費頁面與帳務記錄為準。

費用可能按 Token、請求、圖片、媒體時長、解析度、任務數量或其他公開單位計算。預扣與最終金額可能隨實際用量調整。呼叫前請確認價格與預算，並維持足夠餘額。

除適用法律、訂單或公開退款規則另有規定外，已實際使用的 API 費用通常不予退還。重複扣款或明顯計費錯誤可申請查核。

## 7. 限制、變更與可用性

平台可能依帳戶、模型、供應商或系統負載設定 RPM、TPM、並行及任務限制。維護、故障、法規要求、上游變更或合理控制範圍外的事件可能造成服務中斷、降級或停止。

重大變更會盡可能透過狀態頁、公告或控制台通知，但不保證任何模型、價格、端點或功能永久可用。

## 8. 資料與隱私

我們依[隱私權政策](/zh-TW/legal/privacy)處理帳戶資訊、請求中繼資料、用量及必要的服務資料。完成所選模型呼叫所需的請求內容可能傳送給對應的上游供應商。請勿提交任務不需要的個人資訊、憑證、受監管資料或敏感商業內容。

若你代表他人提交個人資訊，應確保具備適當法律依據，並完成必要的告知或同意。

## 9. 暫停與終止

若帳戶存在安全風險、欠款、明顯濫用、違法行為、對平台或第三方造成風險，或違反本條款，我們可能限制模型、暫停 API Key 或終止服務。情況允許時會提供說明與補救途徑。

你可以停止使用服務，並透過控制台管理 Key 與帳戶。法律、爭議、財務稽核或安全調查所需的記錄可能在必要期間繼續保留。

## 10. 免責與責任範圍

AI 模型具有機率性。除法律明確要求外，服務按目前可用狀態提供，不保證輸出準確、獨特、不中斷或適合特定目的。你應自行判斷模型、供應商與輸出是否適合使用情境。

在法律允許的範圍內，對間接損失、預期利益損失、資料遺失或業務中斷的責任應合理限制。依法不得排除的責任不受本條款排除。

## 11. 更新與聯絡

我們可能為反映產品、供應商、法律或安全實務的變更而更新本條款。重大變更會以合理方式通知並標示更新日期。

帳戶、計費、安全或條款問題可透過[支援中心](/zh-TW/support)處理，或寄信至 [support@quantumnous.com](mailto:support@quantumnous.com)。訂單或另行協議約定其他通知方式時，也請遵循該約定。
`,
    privacy: `# Token Boat 隱私權政策

**最後更新：2026 年 9 月 12 日**

## 1. 適用範圍

本政策說明 Token Boat 在提供網站、帳戶、API 閘道、計費、記錄與支援服務時如何處理資訊。透過所選模型供應商處理的資料，亦可能受該供應商的隱私與資料使用條款約束。

## 2. 我們處理的資訊

- **帳戶資訊：** 使用者名稱、電子郵件、組織或群組資訊、登入狀態與設定。
- **驗證資訊：** 受保護的密碼表示、OAuth 識別碼，以及第二因素驗證或 Passkey 所需資料。支援人員不需要你的完整密碼或 API Key。
- **API 與營運資料：** 模型 ID、端點、請求時間、Token 或媒體用量、回應狀態、延遲、Request ID、錯誤及必要網路診斷。
- **請求內容：** 提示詞、訊息、檔案、圖片、音訊、影片與模型輸出。是否記錄正文取決於服務設定、產品功能及適用規則。
- **計費資訊：** 餘額、儲值、消費、訂單、發票與付款狀態。卡片資料通常由付款服務商處理。
- **裝置與網路資訊：** IP 位址、瀏覽器或裝置類型、語言、時間、Cookie、工作階段識別碼與安全事件。
- **支援資訊：** 你提交的問題說明、Request ID、附件與聯絡記錄。

## 3. 處理目的

我們為建立與保護帳戶、驗證 API 請求、路由模型呼叫、計算用量與費用、顯示記錄、排查故障、防止濫用、改善可靠性、履行契約及法定義務而處理必要資訊。傳送前請將個人資訊與機密內容最小化、去識別化或遮蔽。

## 4. 處理依據

依適用法律與具體情況，處理可能基於履行契約、你的同意、法定義務、帳戶與平台安全或其他合法依據。需要單獨或書面同意時，會在相關功能提供具體告知與同意流程。

## 5. 模型供應商與服務提供商

為完成所選模型呼叫，Token Boat 會將必要的請求內容與技術資訊傳送給對應的上游模型供應商。更換模型也可能更換實際資料處理方。

我們亦可能使用雲端基礎設施、內容傳遞、監控、付款、驗證及客戶支援服務商。這些服務商只能在提供約定服務所需範圍內處理資料，並承擔適當的契約與安全義務。

## 6. 跨區域處理

模型供應商與基礎設施可能位於不同國家或地區。適用跨境傳輸規則時，我們會進行必要評估、告知、契約安排或取得同意。無法符合要求的地區可能無法使用部分模型。

## 7. 保存期限

資訊只會在達成本政策目的、履行契約、處理爭議及滿足法律、財務與安全要求所需期間保存。期限取決於資料類別、帳戶狀態、法定時效、安全需要與服務商必要處理週期。不再需要的資訊會依適用要求刪除、匿名化或限制處理。

## 8. 安全措施

我們依資料與風險採取存取控制、驗證、金鑰隔離、傳輸保護、稽核記錄、備份、漏洞修補與事件回應等合理措施。若懷疑外洩，請立即撤銷 Key，並在不提供完整 Key 的情況下，透過[支援中心](/zh-TW/support)回報時間、Request ID 與影響範圍。

## 9. Cookie 與本機儲存

網站可能使用維持登入、語言偏好、安全檢查與頁面設定所需的 Cookie 或本機儲存。若加入非必要的分析或行銷技術，會在啟用前提供適當說明與選擇機制。

## 10. 你的權利

在適用法律範圍內，你可要求查閱、取得副本、更正、刪除或限制處理個人資訊，撤回同意或註銷帳戶。法律、安全、計費或爭議處理所需記錄可能無法立即刪除。為保護帳戶與資訊，我們可能先驗證身分。

## 11. 未成年人

本服務主要提供給具備相應技術與法律能力的開發者與組織，不以未成年人為主要對象。未成年人應在監護人同意與指導下使用，且不應提交不必要的個人或敏感資訊。

## 12. 更新與聯絡

我們可能因產品、供應商、法律或安全實務變更而更新本政策。重大變更會透過合理方式通知並標示更新日期。

隱私、資料安全或個人權利請求可透過[支援中心](/zh-TW/support)提出，或寄信至 [support@quantumnous.com](mailto:support@quantumnous.com)。為保護帳戶與個人資訊，我們可能要求驗證身分。
`,
  },
};
