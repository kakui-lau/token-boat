import { useEffect, useState } from "react";
import { contentLocale, type SiteLocale } from "@/content/site-copy";

import { readLegalContent } from "@/islands/legal/legal-content";

type LegalDocumentProps = {
  document: "privacy" | "terms";
  fallbackHtml: string;
  locale: SiteLocale;
};

type DocumentState =
  | { status: "error" }
  | { status: "fallback" }
  | { status: "loading" }
  | { content: string; status: "ready" };

const copy = {
  en: {
    empty:
      "This document has not been published yet. Please return later and do not treat this page as an effective legal document until the complete text appears here.",
    error: "This document is temporarily unavailable. Please try again later.",
    external: "The current document is published on a separate page.",
    loading: "Loading the current document…",
    open: "Open current document",
  },
  zh: {
    empty: "该文件暂未发布。完整文本在此出现前，请勿将本页面视为已经生效的法律文件。",
    error: "暂时无法获取该文件，请稍后重试。",
    external: "当前文件发布在独立页面。",
    loading: "正在加载当前文件…",
    open: "打开当前文件",
  },
} as const;

export function LegalDocument(props: LegalDocumentProps) {
  const content = copy[contentLocale(props.locale)];
  const endpoint = props.document === "terms" ? "/api/user-agreement" : "/api/privacy-policy";
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);
  const [state, setState] = useState<DocumentState>({ status: "loading" });

  useEffect(() => {
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
  }, [endpoint]);

  useEffect(() => {
    if (state.status !== "ready" || !state.content || isHttpUrl(state.content)) return;
    let active = true;
    void Promise.all([import("dompurify"), import("marked")])
      .then(([domPurifyModule, markedModule]) => {
        const source = isLikelyHtml(state.content)
          ? state.content
          : (markedModule.marked.parse(state.content, { async: false }) as string);
        const sanitized = domPurifyModule.default.sanitize(source, {
          USE_PROFILES: { html: true },
        });
        if (active) setRenderedHtml(sanitized);
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [state]);

  if (state.status === "loading") {
    return (
      <section
        className="legal-document legal-document--loading"
        aria-busy="true"
        aria-live="polite"
      >
        <p>{content.loading}</p>
        <span></span>
        <span></span>
        <span></span>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="public-state" role="alert">
        <span className="public-state__index">DOCUMENT / UNAVAILABLE</span>
        <h2>{content.error}</h2>
      </section>
    );
  }

  if (state.status === "fallback") {
    return (
      <article
        className="legal-document"
        dangerouslySetInnerHTML={{ __html: props.fallbackHtml }}
      />
    );
  }

  if (!state.content) {
    return (
      <section className="public-state">
        <span className="public-state__index">DOCUMENT / NOT PUBLISHED</span>
        <h2>{content.empty}</h2>
      </section>
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
      <section className="legal-document legal-document--loading" aria-busy="true">
        <p>{content.loading}</p>
        <span></span>
        <span></span>
        <span></span>
      </section>
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
