import { useEffect, useState } from "react";
import { contentLocale, localizedPath, siteLocaleMeta, type SiteLocale } from "@/content/site-copy";
import {
  parsePublicNotice,
  parsePublicStatus,
  type PublicContent,
  type PublicFaq,
} from "./public-content";

type Props = { locale: SiteLocale; mode: "faq" | "changelog" };
type State = { status: "loading" } | { status: "error" } | ({ status: "ready" } & PublicContent);

const fallbackFaq: Record<"en" | "zh", PublicFaq[]> = {
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
        "控制台可能展示请求时间、模型、Token 或媒体用量、状态、延迟、Request ID 和错误诊断信息。正文是否记录取决于服务配置和适用规则；正式保留期限以隐私政策及后台配置为准。",
    },
    {
      id: "fallback-12",
      question: "出现服务故障或账户问题怎么办？",
      answer:
        "公共故障先查看状态页；账户、登录、计费或具体请求问题请进入支持中心，并提供最小复现步骤和 Request ID。商务渠道在正式配置前不会使用虚构邮箱占位。",
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
        "The console may show request time, model, token or media usage, status, latency, Request ID, and error diagnostics. Body logging depends on service configuration and applicable rules; formal retention follows the privacy policy and platform configuration.",
    },
    {
      id: "fallback-12",
      question: "Where do I go for an incident or account issue?",
      answer:
        "Check the status page for public incidents. Use the support center for account, sign-in, billing, or request-specific issues, and include minimal reproduction steps and a Request ID. No placeholder business email is published before a real channel is configured.",
    },
  ],
};

export function PublicContentHub({ locale, mode }: Props) {
  const uiLocale = contentLocale(locale);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });
  const text =
    uiLocale === "zh"
      ? {
          loading: "正在读取已发布内容…",
          error: "暂时无法读取公开内容。",
          retry: "重新加载",
          errorTitle: "公开内容暂时不可用",
          emptyChangesTitle: "这里还没有正式更新",
          emptyChanges: "目前还没有发布公告或更新记录。不会用演示内容填充此处。",
          notice: "置顶通知",
          unknownDate: "发布日期未提供",
          support: "前往支持中心",
          status: "查看服务状态",
        }
      : {
          loading: "Loading published content…",
          error: "Published content could not be loaded.",
          retry: "Try again",
          errorTitle: "Published content is temporarily unavailable",
          emptyChangesTitle: "No formal updates are published yet",
          emptyChanges:
            "No announcements or release notes have been published yet. Demo updates are not shown here.",
          notice: "Pinned notice",
          unknownDate: "Publication date not provided",
          support: "Open support center",
          status: "View service status",
        };
  const supportHref = localizedPath(locale, "/support");
  const statusHref = localizedPath(locale, "/status");

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
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
        setState({ ...parsed, notice: parsePublicNotice(noticePayload), status: "ready" });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (mode === "faq") {
          setState({ announcements: [], faq: [], notice: null, status: "ready" });
          return;
        }
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [reloadKey]);

  if (state.status === "loading")
    return (
      <div className="public-content-state motion-surface-enter" aria-live="polite">
        {text.loading}
      </div>
    );
  if (state.status === "error")
    return (
      <div
        className="public-content-state public-content-state--error motion-surface-enter"
        role="alert"
      >
        <span className="public-content-state__index">CONTENT / UNAVAILABLE</span>
        <h2>{text.errorTitle}</h2>
        <p>{text.error}</p>
        <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
          {text.retry}
        </button>
      </div>
    );

  if (mode === "faq") {
    const faqItems = state.faq.length > 0 ? state.faq : fallbackFaq[uiLocale];
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

  const hasContent = Boolean(state.notice) || state.announcements.length > 0;
  if (!hasContent)
    return (
      <div className="public-content-state public-content-state--empty motion-surface-enter">
        <span className="public-content-state__index">RELEASES / NOT PUBLISHED</span>
        <h2>{text.emptyChangesTitle}</h2>
        <p>{text.emptyChanges}</p>
        <div className="public-content-state__actions">
          <a href={statusHref}>
            {text.status} <span aria-hidden="true">→</span>
          </a>
          <a href={supportHref}>
            {text.support} <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    );
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
      {state.announcements.map((item) => (
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
