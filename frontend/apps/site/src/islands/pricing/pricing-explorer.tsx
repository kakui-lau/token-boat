import { useEffect, useMemo, useRef, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

import { createPricingI18n } from "@/i18n/pricing";
import { siteLocaleMeta, type SiteLocale } from "@/content/site-copy";
import { PriceBreakdown, PriceSummary } from "@/islands/pricing/price-breakdown";
import { modelDialogHasMoreContent } from "@/islands/pricing/scroll-state";
import { type PublicModelFamily, type PublicPricingModel } from "@/islands/pricing/public-pricing";
import { fetchViewerPricing, type ViewerPricingAudience } from "@/islands/pricing/viewer-pricing";

type PricingExplorerIslandProps = {
  locale: SiteLocale;
};

type LoadingState =
  | { status: "error" }
  | { status: "loading" }
  | {
      audience: ViewerPricingAudience;
      models: PublicPricingModel[];
      officialModels: PublicPricingModel[];
      status: "ready";
    };

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
    void fetchViewerPricing(controller.signal)
      .then((catalog) => {
        setState({ ...catalog, status: "ready" });
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
  const selectedOfficialModel =
    state.status === "ready"
      ? (state.officialModels.find((model) => model.id === selectedModelId) ?? null)
      : null;
  const showsAccountPricing = state.status === "ready" && state.audience === "account";
  const accountPricingUnverified = state.status === "ready" && state.audience === "degraded";

  return (
    <section className="price-explorer" aria-busy={state.status === "loading"}>
      <div className="price-explorer__heading">
        <p>{t("catalog.catalogEyebrow")}</p>
        <h2>{t("catalog.catalogTitle")}</h2>
        <span>{t(showsAccountPricing ? "catalog.accountData" : "catalog.liveData")}</span>
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
                <PriceSummary
                  locale={props.locale}
                  model={model}
                  showSource={showsAccountPricing}
                />
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
        <p>
          {t(
            showsAccountPricing
              ? "catalog.accountDisclaimer"
              : accountPricingUnverified
                ? "catalog.degradedDisclaimer"
                : "catalog.disclaimer",
          )}
        </p>
        <a
          href={
            showsAccountPricing || accountPricingUnverified ? "/console/models" : "/console/sign-in"
          }
        >
          {t(
            showsAccountPricing || accountPricingUnverified
              ? "catalog.accountPricing"
              : "catalog.signInToConfirm",
          )}{" "}
          <span aria-hidden="true">↗</span>
        </a>
      </div>

      <ModelDetailsDialog
        audience={state.status === "ready" ? state.audience : "official"}
        locale={props.locale}
        model={selectedModel}
        officialModel={selectedOfficialModel}
        onClose={() => setSelectedModelId(null)}
      />
    </section>
  );
}

function ModelDetailsDialog(props: {
  audience: ViewerPricingAudience;
  locale: SiteLocale;
  model: PublicPricingModel | null;
  officialModel: PublicPricingModel | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [displayedModel, setDisplayedModel] = useState<PublicPricingModel | null>(props.model);
  const [displayedOfficialModel, setDisplayedOfficialModel] = useState<PublicPricingModel | null>(
    props.officialModel,
  );
  const [isClosing, setIsClosing] = useState(false);
  const [showScrollCue, setShowScrollCue] = useState(false);
  const model = props.model ?? displayedModel;
  const officialModel = props.officialModel ?? displayedOfficialModel;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (props.model) {
      setDisplayedModel(props.model);
      setDisplayedOfficialModel(props.officialModel);
      setIsClosing(false);
      if (!dialog.open) dialog.showModal();
      return;
    }

    if (!dialog.open) {
      setDisplayedModel(null);
      setDisplayedOfficialModel(null);
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      dialog.close();
      setDisplayedModel(null);
      setDisplayedOfficialModel(null);
      return;
    }

    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      dialog.close();
      setDisplayedModel(null);
      setDisplayedOfficialModel(null);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, 140);
  }, [props.model, props.officialModel]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    setCopyStatus("");
  }, [model?.id]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!model || !body) {
      setShowScrollCue(false);
      return;
    }

    body.scrollTop = 0;
    const updateScrollCue = () => setShowScrollCue(modelDialogHasMoreContent(body));
    const animationFrame = window.requestAnimationFrame(updateScrollCue);
    const resizeObserver = new ResizeObserver(updateScrollCue);
    resizeObserver.observe(body);
    for (const child of body.children) resizeObserver.observe(child);
    window.addEventListener("resize", updateScrollCue);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateScrollCue);
    };
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
        setDisplayedOfficialModel(null);
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

          <div
            className="model-dialog__body"
            onScroll={(event) => {
              setShowScrollCue(modelDialogHasMoreContent(event.currentTarget));
            }}
            ref={bodyRef}
          >
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
                <dd>
                  {model.priceAudience
                    ? t(
                        model.priceAudience === "account"
                          ? "catalog.accountPrice"
                          : "catalog.officialPrice",
                      )
                    : "—"}
                </dd>
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
              <h3>{t("catalog.priceDetails")}</h3>
              <PriceBreakdown
                key={model.id}
                locale={props.locale}
                model={model}
                officialModel={officialModel}
              />
            </div>
          </div>

          <div
            aria-hidden="true"
            className={`model-dialog__scroll-cue${showScrollCue ? " is-visible" : ""}`}
          >
            <span>{t("catalog.scrollForMore")}</span>
            <span className="model-dialog__scroll-cue-arrow">↓</span>
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
            <a href={props.audience !== "official" ? "/console/models" : "/console/sign-in"}>
              {t(
                props.audience !== "official"
                  ? "catalog.accountPricing"
                  : "catalog.signInToConfirm",
              )}{" "}
              <span aria-hidden="true">↗</span>
            </a>
          </footer>
        </div>
      ) : null}
    </dialog>
  );
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

function localizedDescription(
  model: PublicPricingModel,
  locale: SiteLocale,
  fallback: string,
): string {
  if (locale === "zh") return model.description ?? fallback;
  if (model.description && locale === "en" && !/[\u3400-\u9fff]/u.test(model.description)) {
    return model.description;
  }
  const provider = model.provider ?? "the listed provider";
  const capabilities = model.tags
    .slice(0, 3)
    .map((tag) => localizedTag(tag, locale))
    .join(", ");
  if (locale === "ja")
    return capabilities
      ? `${provider} が提供する ${model.family} モデル。主な機能：${capabilities}。`
      : `${provider} が提供する ${model.family} モデルです。`;
  if (locale === "ko")
    return capabilities
      ? `${provider}의 ${model.family} 모델입니다. 주요 기능: ${capabilities}.`
      : `${provider}의 ${model.family} 모델입니다.`;
  if (locale === "zh-TW")
    return capabilities
      ? `${provider} 提供的 ${model.family} 模型，主要能力：${capabilities}。`
      : `${provider} 提供的 ${model.family} 模型。`;
  return capabilities
    ? `A ${model.family} model from ${provider}, listed for ${capabilities.toLowerCase()}.`
    : `A ${model.family} model from ${provider}.`;
}

function localizedTag(tag: string, locale: SiteLocale): string {
  if (locale === "zh") return tag;
  const english: Record<string, string> = {
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
  const japanese: Record<string, string> = {
    人物高一致: "人物の高い一貫性",
    代码: "コード",
    内测预览: "限定プレビュー",
    多模态: "マルチモーダル",
    对话: "チャット",
    工具: "ツール利用",
    固定版本: "固定バージョン",
    图片: "画像",
    图像: "画像",
    嵌入: "埋め込み",
    快速: "高速",
    推理: "推論",
    文本: "テキスト",
    智能体: "エージェント",
    标准版: "標準",
    生成: "生成",
    稳定正式版: "安定版",
    经济: "低コスト",
    视频: "動画",
    视频生成: "動画生成",
    语音: "音声",
    超分: "アップスケール",
    轻量化: "軽量",
    长上下文: "長いコンテキスト",
    预览: "プレビュー",
    高性价比: "高コスト効率",
    高速: "高速",
    音频: "オーディオ",
  };
  const korean: Record<string, string> = {
    人物高一致: "인물 일관성",
    代码: "코드",
    内测预览: "비공개 미리보기",
    多模态: "멀티모달",
    对话: "채팅",
    工具: "도구 사용",
    固定版本: "고정 버전",
    图片: "이미지",
    图像: "이미지",
    嵌入: "임베딩",
    快速: "빠름",
    推理: "추론",
    文本: "텍스트",
    智能体: "에이전트",
    标准版: "표준",
    生成: "생성",
    稳定正式版: "안정 버전",
    经济: "경제적",
    视频: "비디오",
    视频生成: "비디오 생성",
    语音: "음성",
    超分: "업스케일",
    轻量化: "경량",
    长上下文: "긴 컨텍스트",
    预览: "미리보기",
    高性价比: "비용 효율",
    高速: "고속",
    音频: "오디오",
  };
  const traditionalChinese: Record<string, string> = {
    人物高一致: "人物高一致性",
    代码: "程式碼",
    内测预览: "內測預覽",
    多模态: "多模態",
    对话: "對話",
    工具: "工具",
    固定版本: "固定版本",
    图片: "圖片",
    图像: "圖像",
    嵌入: "嵌入",
    快速: "快速",
    推理: "推理",
    文本: "文字",
    智能体: "智慧代理",
    标准版: "標準版",
    生成: "生成",
    稳定正式版: "穩定正式版",
    经济: "經濟",
    视频: "影片",
    视频生成: "影片生成",
    语音: "語音",
    超分: "超解析",
    轻量化: "輕量化",
    长上下文: "長上下文",
    预览: "預覽",
    高性价比: "高性價比",
    高速: "高速",
    音频: "音訊",
  };
  const translations =
    locale === "ja"
      ? japanese
      : locale === "ko"
        ? korean
        : locale === "zh-TW"
          ? traditionalChinese
          : english;
  return translations[tag] ?? tag;
}
