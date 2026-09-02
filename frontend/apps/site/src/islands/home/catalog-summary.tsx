import { useEffect, useState } from "react";
import { type SiteLocale } from "@/content/site-copy";
import { parsePublicPricingEnvelope } from "@/islands/pricing/public-pricing";

type Props = { locale: SiteLocale };
type State =
  | { status: "loading" | "error" }
  | { status: "ready"; models: number; providers: number; endpoints: number };

export function CatalogSummary({ locale }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });
  const c = {
    zh: {
      models: "当前可用模型",
      providers: "公开目录供应商",
      endpoints: "兼容端点类型",
      loading: "正在读取公开目录…",
      error: "目录摘要暂不可用",
    },
    en: {
      models: "Available models",
      providers: "Catalog providers",
      endpoints: "Endpoint types",
      loading: "Reading public catalog…",
      error: "Catalog summary unavailable",
    },
    ja: {
      models: "利用可能なモデル",
      providers: "公開プロバイダー",
      endpoints: "エンドポイント種別",
      loading: "公開カタログを読み込み中…",
      error: "カタログ概要を表示できません",
    },
    ko: {
      models: "사용 가능한 모델",
      providers: "공개 카탈로그 공급자",
      endpoints: "엔드포인트 유형",
      loading: "공개 카탈로그 불러오는 중…",
      error: "카탈로그 요약을 표시할 수 없습니다",
    },
    "zh-TW": {
      models: "目前可用模型",
      providers: "公開目錄供應商",
      endpoints: "相容端點類型",
      loading: "正在讀取公開目錄…",
      error: "目錄摘要暫不可用",
    },
  }[locale];
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/pricing", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("pricing unavailable");
        const models = parsePublicPricingEnvelope((await response.json()) as unknown).filter(
          (model) => model.available,
        );
        const providers = new Set(models.map((model) => model.provider).filter(Boolean));
        const endpoints = new Set(models.flatMap((model) => model.endpoints));
        setState({
          endpoints: endpoints.size,
          models: models.length,
          providers: providers.size,
          status: "ready",
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);
  if (state.status !== "ready")
    return (
      <p className="catalog-summary__state" aria-live="polite">
        {state.status === "loading" ? c.loading : c.error}
      </p>
    );
  return (
    <dl className="catalog-summary" aria-live="polite">
      <div>
        <dt>{c.models}</dt>
        <dd>{state.models}</dd>
      </div>
      <div>
        <dt>{c.providers}</dt>
        <dd>{state.providers}</dd>
      </div>
      <div>
        <dt>{c.endpoints}</dt>
        <dd>{state.endpoints}</dd>
      </div>
    </dl>
  );
}
