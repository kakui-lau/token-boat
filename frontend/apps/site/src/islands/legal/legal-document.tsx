import { useEffect, useState } from "react";
import type { SiteLocale } from "@/content/site-copy";

import {
  demoteLegalHtmlHeadings,
  demoteLegalMarkdownHeadings,
  readLegalContent,
} from "@/islands/legal/legal-content";

type LegalDocumentProps = {
  document: "privacy" | "terms";
  fallbackHtml: string;
  locale: SiteLocale;
};

type DocumentState = { status: "fallback" } | { content: string; status: "ready" };

const copy = {
  en: {
    external: "The current document is published on a separate page.",
    open: "Open current document",
  },
  zh: {
    external: "当前文件发布在独立页面。",
    open: "打开当前文件",
  },
  ja: {
    external: "現在の文書は別のページで公開されています。",
    open: "現在の文書を開く",
  },
  ko: {
    external: "현재 문서는 별도 페이지에 게시되어 있습니다.",
    open: "현재 문서 열기",
  },
  "zh-TW": {
    external: "目前文件發布於獨立頁面。",
    open: "開啟目前文件",
  },
} as const;

export function LegalDocument(props: LegalDocumentProps) {
  const content = copy[props.locale];
  const endpoint = props.document === "terms" ? "/api/user-agreement" : "/api/privacy-policy";
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);
  const [state, setState] = useState<DocumentState>({ status: "fallback" });

  useEffect(() => {
    // The legacy publication endpoint has no locale parameter. Keep approved localized
    // snapshots intact instead of replacing them with content in an unknown language.
    if (props.locale !== "zh") return;
    const controller = new AbortController();
    void fetch(endpoint, { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Legal document request failed with ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        const value = readLegalContent(payload);
        setState(value ? { content: value, status: "ready" } : { status: "fallback" });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "fallback" });
      });
    return () => controller.abort();
  }, [endpoint, props.locale]);

  useEffect(() => {
    if (state.status !== "ready" || !state.content || isHttpUrl(state.content)) return;
    let active = true;
    void Promise.all([import("dompurify"), import("marked")])
      .then(([domPurifyModule, markedModule]) => {
        const contentIsHtml = isLikelyHtml(state.content);
        const source = contentIsHtml
          ? state.content
          : (markedModule.marked.parse(demoteLegalMarkdownHeadings(state.content), {
              async: false,
            }) as string);
        const sanitized = domPurifyModule.default.sanitize(source, {
          USE_PROFILES: { html: true },
        });
        if (active) setRenderedHtml(contentIsHtml ? demoteLegalHtmlHeadings(sanitized) : sanitized);
      })
      .catch(() => {
        if (active) setState({ status: "fallback" });
      });
    return () => {
      active = false;
    };
  }, [state]);

  if (state.status === "fallback") {
    return (
      <article
        className="legal-document"
        dangerouslySetInnerHTML={{ __html: props.fallbackHtml }}
      />
    );
  }

  if (isHttpUrl(state.content)) {
    return (
      <section className="public-state">
        <span className="public-state__index">DOCUMENT / EXTERNAL</span>
        <h2>{content.external}</h2>
        <a href={state.content} rel="noreferrer" target="_blank">
          {content.open} <span aria-hidden="true">↗</span>
        </a>
      </section>
    );
  }

  if (renderedHtml === null) {
    return (
      <article
        className="legal-document"
        dangerouslySetInnerHTML={{ __html: props.fallbackHtml }}
      />
    );
  }

  return <article className="legal-document" dangerouslySetInnerHTML={{ __html: renderedHtml }} />;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isLikelyHtml(value: string): boolean {
  return /<([a-z][\w-]*)\b[^>]*>/i.test(value);
}
