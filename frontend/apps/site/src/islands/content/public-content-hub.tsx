import { useEffect, useState } from "react";
import { siteLocaleMeta, type SiteLocale } from "@/content/site-copy";
import {
  parsePublicNotice,
  parsePublicStatus,
  type PublicAnnouncement,
  type PublicContent,
  type PublicFaq,
} from "./public-content";

type Props = { locale: SiteLocale; mode: "faq" | "changelog" };

const fallbackFaq: Record<SiteLocale, PublicFaq[]> = {
  zh: [
    {
      id: "fallback-01",
      question: "Token Boat 是什么？",
      answer:
        "Token Boat 是统一 AI API 网关。你可以通过一套账户、API Key 和兼容端点调用多个模型，并在控制台查看用量、请求日志和账户价格。",
    },
    {
      id: "fallback-02",
      question: "如何完成第一次 API 调用？",
      answer:
        "登录控制台创建 API Key，在模型目录确认当前可用模型，然后按照开发者文档中的 Curl、Python 或 JavaScript 示例调用。先在测试环境使用较小请求验证模型 ID、端点和返回格式。",
    },
    {
      id: "fallback-03",
      question: "可以继续使用 OpenAI SDK 吗？",
      answer:
        "兼容端点通常可以配合 OpenAI SDK 使用，只需替换 Base URL、API Key 和模型 ID。不同模型可能支持不同参数与端点，生产接入前请核对模型详情和文档。",
    },
    {
      id: "fallback-04",
      question: "应该选择哪个模型？",
      answer:
        "先按任务类型筛选文本、推理、代码、图像或视频模型，再比较上下文、输出限制、延迟和价格。模型排行榜反映匿名聚合用量，不等同于质量基准或官方推荐。",
    },
    {
      id: "fallback-05",
      question: "公共价格与账户价格有什么区别？",
      answer:
        "公共页面用于比较公开计费组件；折扣、分组倍率、渠道调整、汇率和账户实际价格以登录后的计费页面为准。发起大批量任务前应先确认账户价格。",
    },
    {
      id: "fallback-06",
      question: "Token、图片和视频如何计费？",
      answer:
        "文本模型通常按输入与输出 Token 计费，媒体模型可能按图片数量、分辨率、视频时长、质量或任务次数计费。每个模型详情页会列出当前可公开的计费组件。",
    },
    {
      id: "fallback-07",
      question: "API Key 应该如何保管？",
      answer:
        "只在可信的服务端环境保存 API Key，不要放入浏览器代码、移动端包、公开仓库、截图或工单。建议按应用拆分密钥、限制权限并定期轮换；发现泄露后立即撤销。",
    },
    {
      id: "fallback-08",
      question: "请求失败时应该先检查什么？",
      answer:
        "记录请求时间和时区、模型 ID、端点、HTTP 状态码及 Request ID。先检查服务状态和账户余额，再在控制台请求日志中定位错误；提交支持请求时不要附上完整密钥或敏感提示词。",
    },
    {
      id: "fallback-09",
      question: "为什么会收到 429？",
      answer:
        "429 通常表示请求速率、Token、并发或账户策略限制。遵循 Retry-After，使用带抖动的指数退避，并降低并发；具体限制可能因账户、模型和当前平台策略而不同。",
    },
    {
      id: "fallback-10",
      question: "请求内容会发送给谁？",
      answer:
        "为完成调用，网关会将必要的请求内容发送给你所选择模型对应的上游供应商。切换模型可能同时更换数据处理方，因此不要提交任务并不需要的个人信息、密钥或敏感业务数据。",
    },
    {
      id: "fallback-11",
      question: "平台会保存哪些日志？",
      answer:
        "控制台可能展示请求时间、模型、Token 或媒体用量、状态、延迟、Request ID 和错误诊断信息。正文是否记录取决于服务配置和适用规则；保存期限依据数据类别、法律、财务及安全需要确定。",
    },
    {
      id: "fallback-12",
      question: "出现服务故障或账户问题怎么办？",
      answer:
        "公共故障先查看状态页；账户、登录、计费或具体请求问题请进入支持中心，并提供最小复现步骤和 Request ID。商务、条款、隐私或安全问题可发送至 support@quantumnous.com。",
    },
  ],
  en: [
    {
      id: "fallback-01",
      question: "What is Token Boat?",
      answer:
        "Token Boat is a unified AI API gateway. One account, API key, and compatible endpoint can access multiple models, while the console provides usage, request logs, and account pricing.",
    },
    {
      id: "fallback-02",
      question: "How do I make my first API call?",
      answer:
        "Create an API key in the console, confirm a current model in the catalog, and follow a Curl, Python, or JavaScript example in the developer docs. Start with a small test request to verify the model ID, endpoint, and response format.",
    },
    {
      id: "fallback-03",
      question: "Can I keep using the OpenAI SDK?",
      answer:
        "Compatible endpoints generally work with the OpenAI SDK by changing the base URL, API key, and model ID. Parameters and endpoints vary by model, so verify the model profile and documentation before production use.",
    },
    {
      id: "fallback-04",
      question: "Which model should I choose?",
      answer:
        "Start with the workload—text, reasoning, code, image, or video—then compare context, output limits, latency, and price. Rankings show anonymous aggregate usage; they are not a quality benchmark or endorsement.",
    },
    {
      id: "fallback-05",
      question: "How is public pricing different from account pricing?",
      answer:
        "Public pages compare published billing components. Discounts, group multipliers, channel adjustments, exchange rates, and the price applied to your account are shown after sign-in. Confirm account pricing before large workloads.",
    },
    {
      id: "fallback-06",
      question: "How are tokens, images, and video billed?",
      answer:
        "Text models commonly bill input and output tokens. Media models may bill image count, resolution, video duration, quality, or task count. Each model profile lists the components currently available for public display.",
    },
    {
      id: "fallback-07",
      question: "How should I protect an API key?",
      answer:
        "Keep keys only in trusted server-side environments—never browser code, mobile bundles, public repositories, screenshots, or support tickets. Separate keys by application, limit access, rotate regularly, and revoke an exposed key immediately.",
    },
    {
      id: "fallback-08",
      question: "What should I check when a request fails?",
      answer:
        "Record the request time and timezone, model ID, endpoint, HTTP status, and Request ID. Check service status and account balance, then use console request logs. Never include a complete key or sensitive prompt in a support request.",
    },
    {
      id: "fallback-09",
      question: "Why am I receiving a 429 response?",
      answer:
        "A 429 usually indicates a request-rate, token, concurrency, or account-policy limit. Respect Retry-After, use exponential backoff with jitter, and reduce concurrency. Exact limits may vary by account, model, and current policy.",
    },
    {
      id: "fallback-10",
      question: "Who receives request content?",
      answer:
        "The gateway sends the content required to complete a call to the upstream provider for the selected model. Changing models may change the data processor, so do not submit personal data, credentials, or sensitive business content unless necessary.",
    },
    {
      id: "fallback-11",
      question: "What request logs are retained?",
      answer:
        "The console may show request time, model, token or media usage, status, latency, Request ID, and error diagnostics. Body logging depends on service configuration and applicable rules; retention is based on data category and legal, financial, and security needs.",
    },
    {
      id: "fallback-12",
      question: "Where do I go for an incident or account issue?",
      answer:
        "Check the status page for public incidents. Use the support center for account, sign-in, billing, or request-specific issues and include a Request ID. Email support@quantumnous.com for business, terms, privacy, or security enquiries.",
    },
  ],
  ja: [
    {
      id: "fallback-01",
      question: "Token Boat とは何ですか？",
      answer:
        "Token Boat は統合 AI API ゲートウェイです。ひとつのアカウント、API キー、互換エンドポイントから複数のモデルを利用し、コンソールで使用量、リクエストログ、アカウント料金を確認できます。",
    },
    {
      id: "fallback-02",
      question: "最初の API 呼び出しはどう行いますか？",
      answer:
        "コンソールで API キーを作成し、カタログで利用可能なモデルを確認して、開発者ドキュメントの Curl、Python、JavaScript の例を使います。まず小さなテストでモデル ID、エンドポイント、応答形式を確認してください。",
    },
    {
      id: "fallback-03",
      question: "OpenAI SDK を引き続き使えますか？",
      answer:
        "互換エンドポイントでは通常、Base URL、API キー、モデル ID を変更して OpenAI SDK を利用できます。パラメーターと対応エンドポイントはモデルごとに異なるため、本番利用前にモデル詳細とドキュメントを確認してください。",
    },
    {
      id: "fallback-04",
      question: "どのモデルを選ぶべきですか？",
      answer:
        "テキスト、推論、コード、画像、動画など用途から絞り込み、コンテキスト、出力上限、遅延、料金を比較してください。ランキングは匿名の集計利用量であり、品質評価や推奨ではありません。",
    },
    {
      id: "fallback-05",
      question: "公開料金とアカウント料金の違いは何ですか？",
      answer:
        "公開ページは公開中の課金項目を比較するためのものです。割引、グループ倍率、チャネル調整、為替、実際の適用料金はログイン後に確認してください。大規模な利用前にはアカウント料金をご確認ください。",
    },
    {
      id: "fallback-06",
      question: "トークン、画像、動画はどのように課金されますか？",
      answer:
        "テキストモデルは一般に入力・出力トークン、メディアモデルは画像数、解像度、動画時間、品質、タスク数などで課金されます。モデル詳細に公開可能な課金項目を表示します。",
    },
    {
      id: "fallback-07",
      question: "API キーはどう保護すべきですか？",
      answer:
        "信頼できるサーバー環境だけに保存し、ブラウザーコード、モバイルアプリ、公開リポジトリ、スクリーンショット、問い合わせには含めないでください。アプリごとに分けて権限を絞り、定期的に交換し、漏えい時は直ちに失効させてください。",
    },
    {
      id: "fallback-08",
      question: "リクエスト失敗時に何を確認しますか？",
      answer:
        "時刻とタイムゾーン、モデル ID、エンドポイント、HTTP ステータス、Request ID を記録します。サービス状況と残高を確認し、コンソールのリクエストログで調査してください。完全なキーや機密プロンプトは送らないでください。",
    },
    {
      id: "fallback-09",
      question: "429 応答が返るのはなぜですか？",
      answer:
        "429 は通常、リクエスト速度、トークン、同時実行数、アカウントポリシーの制限を示します。Retry-After に従い、ジッター付き指数バックオフを使い、同時実行数を減らしてください。",
    },
    {
      id: "fallback-10",
      question: "リクエスト内容は誰に送信されますか？",
      answer:
        "呼び出しに必要な内容は、選択したモデルの上流プロバイダーへ送信されます。モデル変更により処理者も変わるため、不要な個人情報、認証情報、機密業務データを送信しないでください。",
    },
    {
      id: "fallback-11",
      question: "どのようなログが保存されますか？",
      answer:
        "コンソールには時刻、モデル、トークンまたはメディア使用量、状態、遅延、Request ID、エラー診断が表示される場合があります。本文の記録は設定と適用規則により、保存期間はデータ種別と法務・財務・安全上の必要性に応じます。",
    },
    {
      id: "fallback-12",
      question: "障害やアカウント問題はどこへ連絡しますか？",
      answer:
        "公開障害は状態ページを確認してください。アカウント、ログイン、課金、個別リクエストはサポートセンターを利用し、Request ID を添えてください。商談、規約、プライバシー、セキュリティは support@quantumnous.com へ連絡できます。",
    },
  ],
  ko: [
    {
      id: "fallback-01",
      question: "Token Boat는 무엇인가요?",
      answer:
        "Token Boat는 통합 AI API 게이트웨이입니다. 하나의 계정, API 키와 호환 엔드포인트로 여러 모델을 호출하고 콘솔에서 사용량, 요청 로그 및 계정 가격을 확인할 수 있습니다.",
    },
    {
      id: "fallback-02",
      question: "첫 API 호출은 어떻게 하나요?",
      answer:
        "콘솔에서 API 키를 만들고 카탈로그에서 사용 가능한 모델을 확인한 뒤 개발자 문서의 Curl, Python 또는 JavaScript 예시를 따르세요. 작은 테스트로 모델 ID, 엔드포인트와 응답 형식을 먼저 확인하세요.",
    },
    {
      id: "fallback-03",
      question: "OpenAI SDK를 계속 사용할 수 있나요?",
      answer:
        "호환 엔드포인트는 일반적으로 Base URL, API 키와 모델 ID를 바꿔 OpenAI SDK에서 사용할 수 있습니다. 모델마다 매개변수와 엔드포인트가 다르므로 운영 전 모델 상세와 문서를 확인하세요.",
    },
    {
      id: "fallback-04",
      question: "어떤 모델을 선택해야 하나요?",
      answer:
        "텍스트, 추론, 코드, 이미지 또는 비디오 등 작업 유형부터 선택한 뒤 컨텍스트, 출력 제한, 지연과 가격을 비교하세요. 순위는 익명 집계 사용량이며 품질 평가나 추천이 아닙니다.",
    },
    {
      id: "fallback-05",
      question: "공개 가격과 계정 가격은 어떻게 다른가요?",
      answer:
        "공개 페이지는 게시된 과금 항목을 비교합니다. 할인, 그룹 배수, 채널 조정, 환율과 실제 적용 가격은 로그인 후 확인하세요. 대규모 작업 전 계정 가격을 확인해야 합니다.",
    },
    {
      id: "fallback-06",
      question: "토큰, 이미지와 비디오는 어떻게 과금되나요?",
      answer:
        "텍스트 모델은 보통 입력·출력 토큰으로, 미디어 모델은 이미지 수, 해상도, 비디오 길이, 품질 또는 작업 수로 과금됩니다. 각 모델 상세에 공개 가능한 과금 항목이 표시됩니다.",
    },
    {
      id: "fallback-07",
      question: "API 키는 어떻게 보호하나요?",
      answer:
        "신뢰할 수 있는 서버 환경에만 보관하고 브라우저 코드, 모바일 앱, 공개 저장소, 화면 캡처 또는 지원 요청에 넣지 마세요. 앱별로 키를 분리하고 권한을 제한하며 정기적으로 교체하고 유출 시 즉시 폐기하세요.",
    },
    {
      id: "fallback-08",
      question: "요청 실패 시 무엇을 확인하나요?",
      answer:
        "요청 시간과 시간대, 모델 ID, 엔드포인트, HTTP 상태와 Request ID를 기록하세요. 서비스 상태와 잔액을 확인한 뒤 콘솔 요청 로그에서 진단하세요. 전체 키나 민감한 프롬프트는 보내지 마세요.",
    },
    {
      id: "fallback-09",
      question: "왜 429 응답이 오나요?",
      answer:
        "429는 보통 요청 속도, 토큰, 동시 실행 또는 계정 정책 제한을 뜻합니다. Retry-After를 따르고 지터를 포함한 지수 백오프를 사용하며 동시 실행을 줄이세요.",
    },
    {
      id: "fallback-10",
      question: "요청 내용은 누구에게 전달되나요?",
      answer:
        "호출에 필요한 내용은 선택한 모델의 상위 공급자에게 전송됩니다. 모델 변경 시 처리자도 달라질 수 있으므로 불필요한 개인정보, 자격 증명 또는 민감한 업무 데이터를 제출하지 마세요.",
    },
    {
      id: "fallback-11",
      question: "어떤 요청 로그가 보관되나요?",
      answer:
        "콘솔에는 시간, 모델, 토큰 또는 미디어 사용량, 상태, 지연, Request ID 및 오류 진단이 표시될 수 있습니다. 본문 기록은 설정과 적용 규칙에 따르며 보관 기간은 데이터 유형과 법률·재무·보안 필요에 따라 결정됩니다.",
    },
    {
      id: "fallback-12",
      question: "장애나 계정 문제는 어디로 문의하나요?",
      answer:
        "공개 장애는 상태 페이지를 확인하세요. 계정, 로그인, 과금 또는 개별 요청 문제는 지원 센터를 이용하고 Request ID를 포함하세요. 비즈니스, 약관, 개인정보 또는 보안 문의는 support@quantumnous.com으로 보낼 수 있습니다.",
    },
  ],
  "zh-TW": [
    {
      id: "fallback-01",
      question: "Token Boat 是什麼？",
      answer:
        "Token Boat 是統一 AI API 閘道。你可以透過一組帳戶、API Key 與相容端點呼叫多種模型，並在控制台查看用量、請求記錄與帳戶價格。",
    },
    {
      id: "fallback-02",
      question: "如何完成第一次 API 呼叫？",
      answer:
        "登入控制台建立 API Key，在目錄確認目前可用模型，再依開發者文件的 Curl、Python 或 JavaScript 範例呼叫。先以小型測試確認模型 ID、端點與回應格式。",
    },
    {
      id: "fallback-03",
      question: "可以繼續使用 OpenAI SDK 嗎？",
      answer:
        "相容端點通常可搭配 OpenAI SDK，只需替換 Base URL、API Key 與模型 ID。不同模型可能支援不同參數和端點，正式使用前請確認模型詳情與文件。",
    },
    {
      id: "fallback-04",
      question: "應該選擇哪個模型？",
      answer:
        "先依文字、推理、程式碼、圖像或影片等工作類型篩選，再比較上下文、輸出限制、延遲與價格。排行榜反映匿名彙總用量，不等於品質評測或官方推薦。",
    },
    {
      id: "fallback-05",
      question: "公開價格與帳戶價格有何不同？",
      answer:
        "公開頁面用於比較已發布的計費項目；折扣、群組倍率、渠道調整、匯率與帳戶實際價格以登入後顯示為準。大量使用前請先確認帳戶價格。",
    },
    {
      id: "fallback-06",
      question: "Token、圖片和影片如何計費？",
      answer:
        "文字模型通常依輸入與輸出 Token 計費；媒體模型可能依圖片數、解析度、影片時長、品質或任務數計費。模型詳情會列出目前可公開的計費項目。",
    },
    {
      id: "fallback-07",
      question: "API Key 應如何保管？",
      answer:
        "只存放於可信任的伺服器環境，切勿放入瀏覽器程式碼、行動應用程式、公開儲存庫、螢幕截圖或支援請求。依應用程式拆分 Key、限制權限、定期輪替，外洩時立即撤銷。",
    },
    {
      id: "fallback-08",
      question: "請求失敗時應先檢查什麼？",
      answer:
        "記錄請求時間與時區、模型 ID、端點、HTTP 狀態及 Request ID。先檢查服務狀態與餘額，再從控制台請求記錄排查；不要提交完整 Key 或敏感提示詞。",
    },
    {
      id: "fallback-09",
      question: "為什麼會收到 429？",
      answer:
        "429 通常表示請求速率、Token、並行或帳戶政策限制。遵循 Retry-After，使用加入抖動的指數退避並降低並行；實際限制會依帳戶、模型和政策而異。",
    },
    {
      id: "fallback-10",
      question: "請求內容會傳送給誰？",
      answer:
        "完成呼叫所需內容會傳送給所選模型的上游供應商。更換模型也可能改變資料處理方，因此不要提交不必要的個人資訊、憑證或敏感商業資料。",
    },
    {
      id: "fallback-11",
      question: "平台會保存哪些記錄？",
      answer:
        "控制台可能顯示時間、模型、Token 或媒體用量、狀態、延遲、Request ID 及錯誤診斷。正文是否記錄取決於設定與規則；保存期限依資料類別及法律、財務、安全需要決定。",
    },
    {
      id: "fallback-12",
      question: "服務故障或帳戶問題如何處理？",
      answer:
        "公開故障先查看狀態頁；帳戶、登入、計費或具體請求問題請使用支援中心並提供 Request ID。商務、條款、隱私或安全問題可寄至 support@quantumnous.com。",
    },
  ],
};

const fallbackChangelog: Record<SiteLocale, PublicAnnouncement[]> = {
  zh: [
    {
      content:
        "公共站已完善简体中文、English、日本語、한국어和繁體中文的文档、常见问题、信任与安全、服务状态、支持及法律信息。各语言法律文本的最后更新日期统一为 2026 年 9 月 12 日。",
      id: "public-site-content-2026-09-12",
      publishDate: "2026-09-12",
      type: "站点更新",
    },
  ],
  en: [
    {
      content:
        "The public site now provides complete documentation, FAQ, trust and safety, service status, support, and legal information in Simplified Chinese, English, Japanese, Korean, and Traditional Chinese. Legal documents in every language were last updated on September 12, 2026.",
      id: "public-site-content-2026-09-12",
      publishDate: "2026-09-12",
      type: "SITE UPDATE",
    },
  ],
  ja: [
    {
      content:
        "公開サイトのドキュメント、FAQ、信頼と安全、サービス状況、サポート、法務情報を、簡体字中国語、英語、日本語、韓国語、繁体字中国語で整備しました。各言語の法的文書は 2026 年 9 月 12 日に更新されています。",
      id: "public-site-content-2026-09-12",
      publishDate: "2026-09-12",
      type: "サイト更新",
    },
  ],
  ko: [
    {
      content:
        "공개 사이트의 문서, 자주 묻는 질문, 신뢰와 안전, 서비스 상태, 지원 및 법률 정보를 중국어 간체, 영어, 일본어, 한국어와 중국어 번체로 완비했습니다. 모든 언어의 법률 문서는 2026년 9월 12일에 업데이트되었습니다.",
      id: "public-site-content-2026-09-12",
      publishDate: "2026-09-12",
      type: "사이트 업데이트",
    },
  ],
  "zh-TW": [
    {
      content:
        "公共網站已完善簡體中文、English、日本語、한국어與繁體中文的文件、常見問題、信任與安全、服務狀態、支援及法律資訊。各語言法律文件的最後更新日期統一為 2026 年 9 月 12 日。",
      id: "public-site-content-2026-09-12",
      publishDate: "2026-09-12",
      type: "網站更新",
    },
  ],
};

export function PublicContentHub({ locale, mode }: Props) {
  const [state, setState] = useState<PublicContent>({ announcements: [], faq: [], notice: null });
  const text = {
    zh: {
      notice: "置顶通知",
      unknownDate: "发布日期未提供",
    },
    en: {
      notice: "Pinned notice",
      unknownDate: "Publication date not provided",
    },
    ja: {
      notice: "固定のお知らせ",
      unknownDate: "公開日未設定",
    },
    ko: {
      notice: "고정 공지",
      unknownDate: "게시일 없음",
    },
    "zh-TW": {
      notice: "置頂通知",
      unknownDate: "未提供發布日期",
    },
  }[locale];

  useEffect(() => {
    // The legacy content feed has no locale parameter. Keep localized FAQ and
    // changelog states intact instead of presenting an unknown-language payload.
    if (locale !== "zh") return;
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/status", { credentials: "same-origin", signal: controller.signal }),
      fetch("/api/notice", { credentials: "same-origin", signal: controller.signal }),
    ])
      .then(async ([statusResponse, noticeResponse]) => {
        if (!statusResponse.ok || !noticeResponse.ok)
          throw new Error("public content request failed");
        const [statusPayload, noticePayload] = await Promise.all([
          statusResponse.json(),
          noticeResponse.json(),
        ]);
        const parsed = parsePublicStatus(statusPayload);
        setState({ ...parsed, notice: parsePublicNotice(noticePayload) });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [locale]);

  if (mode === "faq") {
    const faqItems = state.faq.length > 0 ? state.faq : fallbackFaq[locale];
    return (
      <div className="faq-list motion-surface-enter">
        {faqItems.map((item, index) => (
          <details data-animated-details key={item.id}>
            <summary>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {item.question}
            </summary>
            <div className="details-reveal faq-answer">
              <p>{item.answer}</p>
            </div>
          </details>
        ))}
      </div>
    );
  }

  const announcements =
    state.announcements.length > 0 ? state.announcements : fallbackChangelog[locale];
  return (
    <div className="release-list motion-surface-enter">
      {state.notice ? (
        <article className="release-item release-item--notice">
          <div>
            <span>NOTICE</span>
            <time>{text.notice}</time>
          </div>
          <p>{state.notice}</p>
        </article>
      ) : null}
      {announcements.map((item) => (
        <article className="release-item" key={item.id}>
          <div>
            <span>{item.type ?? "UPDATE"}</span>
            <time dateTime={item.publishDate ?? undefined}>
              {item.publishDate ? formatDate(item.publishDate, locale) : text.unknownDate}
            </time>
          </div>
          <p>{item.content}</p>
        </article>
      ))}
    </div>
  );
}

function formatDate(value: string, locale: SiteLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(siteLocaleMeta[locale].numberLocale, {
    dateStyle: "medium",
  }).format(date);
}
