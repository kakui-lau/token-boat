import { useEffect, useMemo, useRef, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

import { createPricingI18n } from "@/i18n/pricing";
import { contentLocale, siteLocaleMeta, type SiteLocale } from "@/content/site-copy";
import { formatCardCurrency } from "@/islands/pricing/price-format";
import {
  parsePublicPricingEnvelope,
  type PublicModelFamily,
  type PublicModelPrice,
  type PublicPriceComponent,
  type PublicPricingModel,
} from "@/islands/pricing/public-pricing";

type PricingExplorerIslandProps = {
  locale: SiteLocale;
};

type LoadingState =
  | { status: "error" }
  | { status: "loading" }
  | { models: PublicPricingModel[]; status: "ready" };

const familyOptions: readonly (PublicModelFamily | "all")[] = [
  "all",
  "chat",
  "reasoning",
  "embedding",
  "image",
  "audio",
  "video",
  "unknown",
];

export function PricingExplorerIsland(props: PricingExplorerIslandProps) {
  const i18n = useMemo(() => createPricingI18n(props.locale), [props.locale]);
  return (
    <I18nextProvider i18n={i18n}>
      <PricingExplorer locale={props.locale} />
    </I18nextProvider>
  );
}

function PricingExplorer(props: PricingExplorerIslandProps) {
  const { t } = useTranslation();
  const [family, setFamily] = useState<PublicModelFamily | "all">("all");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [urlStateReady, setUrlStateReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [state, setState] = useState<LoadingState>({ status: "loading" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedFamily = params.get("family");
    const requestedModel = params.get("model");
    const requestedQuery = params.get("q");

    if (requestedFamily && familyOptions.includes(requestedFamily as PublicModelFamily | "all")) {
      setFamily(requestedFamily as PublicModelFamily | "all");
    }
    if (requestedQuery) setQuery(requestedQuery);
    if (requestedModel) setSelectedModelId(requestedModel);
    setUrlStateReady(true);
  }, []);

  useEffect(() => {
    if (!urlStateReady) return;
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("q", query.trim());
    else url.searchParams.delete("q");
    if (family !== "all") url.searchParams.set("family", family);
    else url.searchParams.delete("family");
    if (selectedModelId) url.searchParams.set("model", selectedModelId);
    else url.searchParams.delete("model");
    window.history.replaceState({}, "", url);
  }, [family, query, selectedModelId, urlStateReady]);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void fetch("/api/pricing", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Pricing request failed with ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        setState({ models: parsePublicPricingEnvelope(payload), status: "ready" });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [reloadKey]);

  const filteredModels = useMemo(() => {
    if (state.status !== "ready") return [];
    const normalizedQuery = query.trim().toLowerCase();
    return state.models.filter((model) => {
      if (family !== "all" && model.family !== family) return false;
      if (!normalizedQuery) return true;
      return `${model.id} ${model.provider ?? ""} ${model.tags.join(" ")}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [family, query, state]);
  const visibleModels = showAll ? filteredModels : filteredModels.slice(0, 12);
  const selectedModel =
    state.status === "ready"
      ? (state.models.find((model) => model.id === selectedModelId) ?? null)
      : null;

  return (
    <section className="price-explorer" aria-busy={state.status === "loading"}>
      <div className="price-explorer__heading">
        <p>{t("catalog.catalogEyebrow")}</p>
        <h2>{t("catalog.catalogTitle")}</h2>
        <span>{t("catalog.liveData")}</span>
      </div>
      <div className="price-explorer__toolbar">
        <label className="catalog-search">
          <span>{t("catalog.searchLabel")}</span>
          <input
            autoComplete="off"
            name="model-search"
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setShowAll(false);
            }}
            placeholder={t("catalog.search")}
            type="search"
            value={query}
          />
        </label>
        <label className="catalog-filter">
          <span className="sr-only">{t("catalog.all")}</span>
          <select
            name="model-family"
            onChange={(event) => {
              setFamily(event.currentTarget.value as PublicModelFamily | "all");
              setShowAll(false);
            }}
            value={family}
          >
            {familyOptions.map((option) => (
              <option key={option} value={option}>
                {t(`catalog.${option}`)}
              </option>
            ))}
          </select>
        </label>
        {state.status === "ready" ? (
          <div className="catalog-count" role="status">
            <strong>{filteredModels.length}</strong> {t("catalog.models")}
          </div>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <div
          className="model-card-grid motion-surface-enter"
          aria-label={t("catalog.loading")}
          aria-live="polite"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="model-card model-card--loading" key={index}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          ))}
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="catalog-state motion-surface-enter" role="alert">
          <p>{t("catalog.error")}</p>
          <button onClick={() => setReloadKey((key) => key + 1)} type="button">
            {t("catalog.retry")}
          </button>
        </div>
      ) : null}

      {state.status === "ready" && filteredModels.length === 0 ? (
        <div className="catalog-state motion-surface-enter">
          <p>{t("catalog.empty")}</p>
        </div>
      ) : null}

      {state.status === "ready" && visibleModels.length > 0 ? (
        <div className="catalog-results motion-surface-enter">
          <div className={`model-card-grid${showAll ? " is-expanded" : ""}`}>
            {visibleModels.map((model) => (
              <article className="model-card" key={model.id}>
                <div className="model-card__topline">
                  <span>{t(`catalog.${model.family}`)}</span>
                  {model.available ? (
                    <span className="availability-dot">{t("catalog.available")}</span>
                  ) : null}
                </div>
                <h2 title={model.id} translate="no">
                  {model.id}
                </h2>
                <p className="model-provider">{model.provider ?? "—"}</p>
                <p className="model-description">
                  {localizedDescription(model, props.locale, t("catalog.descriptionFallback"))}
                </p>
                {model.tags.length > 0 ? (
                  <ul className="model-tags" aria-label={t("catalog.capabilities")}>
                    {model.tags.slice(0, 3).map((tag) => (
                      <li key={tag}>{localizedTag(tag, props.locale)}</li>
                    ))}
                  </ul>
                ) : null}
                <dl className="model-price-grid">
                  <div>
                    <dt>{t("catalog.input")}</dt>
                    <dd>{formatPrice(model.inputPrice, props.locale, t)}</dd>
                  </div>
                  <div>
                    <dt>{t("catalog.output")}</dt>
                    <dd>{formatPrice(model.outputPrice, props.locale, t)}</dd>
                  </div>
                </dl>
                <div className="model-card__footer">
                  <div>
                    <span>{t("catalog.context")}</span>
                    <strong>{formatContext(model.contextLength, props.locale)}</strong>
                  </div>
                  <button onClick={() => setSelectedModelId(model.id)} type="button">
                    {t("catalog.viewDetails")} <span aria-hidden="true">↗</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!showAll && filteredModels.length > visibleModels.length ? (
            <button className="catalog-show-all" onClick={() => setShowAll(true)} type="button">
              {t("catalog.showAll")} <span aria-hidden="true">↓</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="catalog-disclaimer">
        <span aria-hidden="true">ⓘ</span>
        <p>{t("catalog.disclaimer")}</p>
        <a href="/console/sign-in">
          {t("catalog.accountPricing")} <span aria-hidden="true">↗</span>
        </a>
      </div>

      <ModelDetailsDialog
        locale={props.locale}
        model={selectedModel}
        onClose={() => setSelectedModelId(null)}
      />
    </section>
  );
}

function ModelDetailsDialog(props: {
  locale: SiteLocale;
  model: PublicPricingModel | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [displayedModel, setDisplayedModel] = useState<PublicPricingModel | null>(props.model);
  const [isClosing, setIsClosing] = useState(false);
  const model = props.model ?? displayedModel;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (props.model) {
      setDisplayedModel(props.model);
      setIsClosing(false);
      if (!dialog.open) dialog.showModal();
      return;
    }

    if (!dialog.open) {
      setDisplayedModel(null);
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      dialog.close();
      setDisplayedModel(null);
      return;
    }

    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      dialog.close();
      setDisplayedModel(null);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, 140);
  }, [props.model]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    setCopyStatus("");
  }, [model?.id]);

  return (
    <dialog
      aria-labelledby="model-details-title"
      className={`model-dialog${isClosing ? " is-closing" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onClose={() => {
        setDisplayedModel(null);
        setIsClosing(false);
        if (props.model) props.onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        props.onClose();
      }}
      ref={dialogRef}
    >
      {model ? (
        <div className="model-dialog__frame">
          <header className="model-dialog__header">
            <div>
              <p>{t("catalog.modelDetails")}</p>
              <h2 id="model-details-title" translate="no">
                {model.id}
              </h2>
            </div>
            <button aria-label={t("catalog.closeDetails")} onClick={props.onClose} type="button">
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <div className="model-dialog__body">
            <p className="model-dialog__description">
              {localizedDescription(model, props.locale, t("catalog.descriptionFallback"))}
            </p>

            <dl className="model-facts">
              <div>
                <dt>{t("catalog.provider")}</dt>
                <dd>{model.provider ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("catalog.type")}</dt>
                <dd>{t(`catalog.${model.family}`)}</dd>
              </div>
              <div>
                <dt>{t("catalog.context")}</dt>
                <dd>{formatFullNumber(model.contextLength, props.locale)}</dd>
              </div>
              <div>
                <dt>{t("catalog.maxOutput")}</dt>
                <dd>{formatFullNumber(model.maxOutputTokens, props.locale)}</dd>
              </div>
              <div>
                <dt>{t("catalog.availability")}</dt>
                <dd>{model.available ? t("catalog.available") : t("catalog.unavailable")}</dd>
              </div>
              <div>
                <dt>{t("catalog.billingMode")}</dt>
                <dd translate="no">{model.billingMode ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("catalog.priceStructure")}</dt>
                <dd translate="no">{model.priceStructure ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("catalog.pricingSource")}</dt>
                <dd translate="no">{model.pricingSource ?? "—"}</dd>
              </div>
            </dl>

            <div className="model-detail-section">
              <h3>{t("catalog.capabilities")}</h3>
              {model.tags.length > 0 ? (
                <ul className="model-tags model-tags--detail">
                  {model.tags.map((tag) => (
                    <li key={tag}>{localizedTag(tag, props.locale)}</li>
                  ))}
                </ul>
              ) : (
                <p>—</p>
              )}
            </div>

            <div className="model-detail-section">
              <h3>{t("catalog.endpoints")}</h3>
              {model.endpoints.length > 0 ? (
                <ul className="endpoint-list">
                  {model.endpoints.map((endpoint) => (
                    <li key={endpoint} translate="no">
                      {endpoint}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>—</p>
              )}
            </div>

            <div className="model-detail-section">
              <h3>{t("catalog.completePricing")}</h3>
              {model.priceComponents.length > 0 ? (
                <div className="price-component-list">
                  {model.priceComponents.map((item, index) => (
                    <PriceComponentRow
                      item={item}
                      key={`${item.component}-${item.tier ?? "base"}-${index}`}
                      locale={props.locale}
                    />
                  ))}
                </div>
              ) : (
                <p>—</p>
              )}
            </div>
          </div>

          <footer className="model-dialog__footer">
            <p aria-live="polite" role="status">
              {copyStatus}
            </p>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(model.id).then(() => {
                  setCopyStatus(t("catalog.copied"));
                });
              }}
              type="button"
            >
              {t("catalog.copyId")}
            </button>
            <a href="/console/sign-in">
              {t("catalog.signInToConfirm")} <span aria-hidden="true">↗</span>
            </a>
          </footer>
        </div>
      ) : null}
    </dialog>
  );
}

function PriceComponentRow(props: { item: PublicPriceComponent; locale: SiteLocale }) {
  const { t } = useTranslation();
  const conditions = [
    props.item.tier,
    props.item.operation,
    props.item.quality,
    props.item.resolution,
    props.item.withAudio,
    props.item.upperBound ? `≤ ${props.item.upperBound}` : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <dl className="price-component-row">
      <div>
        <dt>{t("catalog.component")}</dt>
        <dd>{t(`price.${props.item.component}`, { defaultValue: props.item.component })}</dd>
      </div>
      <div>
        <dt>{t("catalog.price")}</dt>
        <dd>{formatComponentPrice(props.item, props.locale)}</dd>
      </div>
      <div>
        <dt>{t("catalog.unit")}</dt>
        <dd translate="no">{formatComponentUnit(props.item, props.locale)}</dd>
      </div>
      <div>
        <dt>{t("catalog.conditions")}</dt>
        <dd translate="no">{conditions.join(" · ") || "—"}</dd>
      </div>
    </dl>
  );
}

function formatPrice(
  price: PublicModelPrice | null,
  locale: SiteLocale,
  translate: (key: string) => string,
): string {
  if (!price) return "—";
  const unitKey =
    price.unit === "million_tokens"
      ? "price.perMillion"
      : price.unit === "second"
        ? "price.perSecond"
        : "price.perRequest";
  const prefix = price.qualifier === "from" ? `${translate("price.from")} ` : "";
  return `${prefix}${formatCardCurrency(price.amount, price.currency, locale)} ${translate(unitKey)}`;
}

function formatContext(contextLength: number | null, locale: SiteLocale): string {
  if (!contextLength || contextLength <= 0) return "—";
  return new Intl.NumberFormat(siteLocaleMeta[locale].numberLocale, {
    maximumFractionDigits: 0,
    notation: "compact",
  }).format(contextLength);
}

function formatFullNumber(value: number | null, locale: SiteLocale): string {
  if (!value || value <= 0) return "—";
  return new Intl.NumberFormat(siteLocaleMeta[locale].numberLocale, {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatComponentPrice(item: PublicPriceComponent, locale: SiteLocale): string {
  return new Intl.NumberFormat(siteLocaleMeta[locale].numberLocale, {
    currency: item.currency,
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(item.amount);
}

function formatComponentUnit(item: PublicPriceComponent, locale: SiteLocale): string {
  const size = item.unitSize;
  const formattedSize = size
    ? new Intl.NumberFormat(siteLocaleMeta[locale].numberLocale, {
        notation: size >= 1_000 ? "compact" : "standard",
      }).format(size)
    : null;
  const localizedUnits: Record<string, [string, string]> = {
    character: ["字符", "characters"],
    image: ["张图", "images"],
    item: ["项", "items"],
    request: ["次请求", "requests"],
    second: ["秒", "seconds"],
    token: ["Token", "tokens"],
  };
  const unit = localizedUnits[item.unit]?.[contentLocale(locale) === "zh" ? 0 : 1] ?? item.unit;
  return formattedSize ? `${formattedSize} ${unit}` : unit;
}

function localizedDescription(
  model: PublicPricingModel,
  locale: SiteLocale,
  fallback: string,
): string {
  const baseLocale = contentLocale(locale);
  if (model.description && (baseLocale === "zh" || !/[\u3400-\u9fff]/u.test(model.description))) {
    return model.description;
  }
  if (baseLocale === "zh") return model.description ?? fallback;
  const provider = model.provider ?? "the listed provider";
  const capabilities = model.tags
    .slice(0, 3)
    .map((tag) => localizedTag(tag, locale).toLowerCase())
    .join(", ");
  return capabilities
    ? `A ${model.family} model from ${provider}, listed for ${capabilities}.`
    : `A ${model.family} model from ${provider}.`;
}

function localizedTag(tag: string, locale: SiteLocale): string {
  if (contentLocale(locale) === "zh") return tag;
  const translations: Record<string, string> = {
    人物高一致: "Character consistency",
    代码: "Coding",
    内测预览: "Private preview",
    多模态: "Multimodal",
    对话: "Chat",
    工具: "Tool use",
    固定版本: "Pinned version",
    图片: "Image",
    图像: "Image",
    嵌入: "Embeddings",
    快速: "Fast",
    推理: "Reasoning",
    文本: "Text",
    智能体: "Agents",
    标准版: "Standard",
    生成: "Generation",
    稳定正式版: "Stable",
    经济: "Economical",
    视频: "Video",
    视频生成: "Video generation",
    语音: "Speech",
    超分: "Upscaling",
    轻量化: "Lightweight",
    长上下文: "Long context",
    预览: "Preview",
    高性价比: "Cost-efficient",
    高速: "High speed",
    音频: "Audio",
  };
  return translations[tag] ?? tag;
}
