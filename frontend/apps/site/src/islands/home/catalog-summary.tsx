import { useEffect, useState } from "react";
import { parsePublicPricingEnvelope } from "@/islands/pricing/public-pricing";

type Props = { locale: "en" | "zh" };
type State =
  | { status: "loading" | "error" }
  | { status: "ready"; models: number; providers: number; endpoints: number };

export function CatalogSummary({ locale }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });
  const c =
    locale === "zh"
      ? {
          models: "当前可用模型",
          providers: "公开目录供应商",
          endpoints: "兼容端点类型",
          loading: "正在读取公开目录…",
          error: "目录摘要暂不可用",
        }
      : {
          models: "Available models",
          providers: "Catalog providers",
          endpoints: "Endpoint types",
          loading: "Reading public catalog…",
          error: "Catalog summary unavailable",
        };
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
