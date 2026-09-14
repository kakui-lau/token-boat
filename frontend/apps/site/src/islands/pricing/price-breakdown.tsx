import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { siteLocaleMeta, type SiteLocale } from "@/content/site-copy";
import type {
  PricingAudience,
  PublicPriceComponent,
  PublicPricingModel,
} from "@/islands/pricing/public-pricing";

export type PriceComponentGroup = {
  items: PublicPriceComponent[];
  key: string;
  representative: PublicPriceComponent;
};

type PricePreference = {
  audience: PricingAudience;
  modelId: string;
};

type PriceSummaryItem = {
  item: PublicPriceComponent;
  qualifier: "from" | null;
};

type PriceSummarySelection = {
  hiddenCount: number;
  items: PriceSummaryItem[];
};

const componentOrder = [
  "token_input",
  "image_token_input",
  "audio_token_input",
  "cached_image_token_input",
  "token_output",
  "image_token_output",
  "audio_token_output",
  "cache_read",
  "cache_write",
  "cache_write_1h",
  "request",
  "tool_call",
  "generated_item",
  "image_input",
  "image_output",
  "audio_input",
  "audio_output",
  "video_input",
  "video_output",
  "character_input",
  "character_output",
] as const;

const conditionTranslationKeys: Record<string, string> = {
  "4k_default": "price.condition.4k",
  long_context: "price.condition.longContext",
  off_peak: "price.condition.offPeak",
  peak: "price.condition.peak",
  standard: "price.condition.standard",
};

const summaryComponentOrder: Record<string, readonly string[]> = {
  audio_duration: ["audio_input", "audio_output"],
  character: ["character_input", "character_output"],
  image: ["image_input", "image_output"],
  request: ["request", "tool_call", "generated_item"],
  token: ["token_input", "token_output"],
  usage: ["token_input", "token_output"],
  video_duration: ["video_input", "video_output"],
};

export function PriceSummary(props: {
  locale: SiteLocale;
  model: PublicPricingModel;
  showSource?: boolean;
}) {
  const { t } = useTranslation();
  const summary = summarizePriceComponents(props.model.priceComponents, props.model.billingMode);
  const source =
    props.showSource && props.model.priceAudience ? (
      <span className="model-price-summary__source" data-price-source={props.model.priceAudience}>
        {t(
          props.model.priceAudience === "account"
            ? "catalog.accountPrice"
            : "catalog.officialPrice",
        )}
      </span>
    ) : null;
  const more =
    summary.hiddenCount > 0 ? (
      <span className="model-price-summary__more">
        {t("catalog.morePriceItems", { count: summary.hiddenCount })}
      </span>
    ) : null;

  if (summary.items.length === 0) {
    return (
      <div className="model-price-summary">
        {source ? <div className="model-price-summary__meta">{source}</div> : null}
        <dl className="model-price-grid model-price-grid--single">
          <div>
            <dt>{t("catalog.price")}</dt>
            <dd>—</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="model-price-summary">
      {source || more ? (
        <div className="model-price-summary__meta">
          {source}
          {more}
        </div>
      ) : null}
      <dl
        className={`model-price-grid${summary.items.length === 1 ? " model-price-grid--single" : ""}`}
      >
        {summary.items.map(({ item, qualifier }) => (
          <div key={[item.component, item.currency, item.unit, item.unitSize ?? ""].join("|")}>
            <dt>
              {t(`price.${item.component}`, {
                defaultValue: readableIdentifier(item.component),
              })}
            </dt>
            <dd>
              {qualifier ? `${t("price.from")} ` : ""}
              <span translate="no">{formatPriceAmount(item, props.locale)}</span>
              {" / "}
              {formatPriceUnit(item, props.locale, t)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function PriceBreakdown(props: {
  locale: SiteLocale;
  model: PublicPricingModel;
  officialModel: PublicPricingModel | null;
}) {
  const { t } = useTranslation();
  const [preference, setPreference] = useState<PricePreference | null>(null);
  const accountModel = props.model.priceAudience === "account" ? props.model : null;
  const officialModel =
    props.officialModel?.id === props.model.id
      ? props.officialModel
      : props.model.priceAudience === "official"
        ? props.model
        : null;
  const canSwitch = Boolean(
    accountModel?.priceComponents.length && officialModel?.priceComponents.length,
  );
  const defaultAudience: PricingAudience = accountModel ? "account" : "official";
  const preferredAudience =
    preference?.modelId === props.model.id ? preference.audience : defaultAudience;
  const selectedAudience =
    preferredAudience === "account" && accountModel
      ? "account"
      : preferredAudience === "official" && officialModel
        ? "official"
        : defaultAudience;
  const activeModel =
    selectedAudience === "official" && officialModel
      ? officialModel
      : (accountModel ?? props.model);
  const groups = useMemo(
    () => groupPriceComponents(activeModel.priceComponents),
    [activeModel.priceComponents],
  );
  const officialItems =
    selectedAudience === "account" ? (officialModel?.priceComponents ?? []) : [];

  if (groups.length === 0) return <p>—</p>;

  return (
    <div className="price-breakdown">
      <div className="price-breakdown__toolbar">
        {canSwitch ? (
          <div
            aria-label={t("catalog.priceViewLabel")}
            className="price-source-switch"
            role="group"
          >
            <button
              aria-pressed={selectedAudience === "account"}
              onClick={() => setPreference({ audience: "account", modelId: props.model.id })}
              type="button"
            >
              {t("catalog.accountPrice")}
            </button>
            <button
              aria-pressed={selectedAudience === "official"}
              onClick={() => setPreference({ audience: "official", modelId: props.model.id })}
              type="button"
            >
              {t("catalog.officialPrice")}
            </button>
          </div>
        ) : (
          <span className="price-breakdown__source">
            {t(selectedAudience === "account" ? "catalog.accountPrice" : "catalog.officialPrice")}
          </span>
        )}
      </div>
      <div
        className="price-plan-grid"
        data-price-layout={priceLayout(activeModel.billingMode)}
        data-price-view={selectedAudience}
      >
        {groups.map((group) => (
          <PriceGroupCard
            group={group}
            key={group.key}
            locale={props.locale}
            officialItems={officialItems}
          />
        ))}
      </div>
    </div>
  );
}

function PriceGroupCard(props: {
  group: PriceComponentGroup;
  locale: SiteLocale;
  officialItems: PublicPriceComponent[];
}) {
  const { t } = useTranslation();
  const conditions = priceGroupConditions(props.group.representative, props.locale, t);
  const title = conditions.shift() ?? t("price.condition.base");

  return (
    <section className="price-plan-card" data-price-group={props.group.key}>
      <header className="price-plan-card__header">
        <h4>{title}</h4>
        {conditions.length > 0 ? (
          <ul aria-label={t("catalog.conditions")}>
            {conditions.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
        ) : null}
      </header>
      <div className="price-plan-card__metrics">
        {props.group.items.map((item, index) => (
          <PriceMetric
            item={item}
            key={`${priceComponentIdentity(item)}-${index}`}
            locale={props.locale}
            officialItem={findMatchingPriceComponent(item, props.officialItems)}
          />
        ))}
      </div>
    </section>
  );
}

function PriceMetric(props: {
  item: PublicPriceComponent;
  locale: SiteLocale;
  officialItem: PublicPriceComponent | null;
}) {
  const { t } = useTranslation();
  const officialPriceDiffers =
    props.officialItem !== null &&
    Math.abs(props.officialItem.amount - props.item.amount) > 0.000005;
  const savings =
    officialPriceDiffers && props.officialItem && props.officialItem.amount > 0
      ? Math.round((1 - props.item.amount / props.officialItem.amount) * 100)
      : null;

  return (
    <div className="price-metric" data-price-component={props.item.component}>
      <p>
        <strong>
          {t(`price.${props.item.component}`, {
            defaultValue: readableIdentifier(props.item.component),
          })}
        </strong>
        <span> / {formatPriceUnit(props.item, props.locale, t)}</span>
      </p>
      <div>
        <b translate="no">{formatPriceAmount(props.item, props.locale)}</b>
        {officialPriceDiffers && props.officialItem ? (
          <small>
            {t("catalog.officialReference")}:{" "}
            <span translate="no">{formatPriceAmount(props.officialItem, props.locale)}</span>
            {savings !== null && savings > 0 ? (
              <em>{t("catalog.savings", { percent: savings })}</em>
            ) : null}
          </small>
        ) : null}
      </div>
    </div>
  );
}

export function groupPriceComponents(items: PublicPriceComponent[]): PriceComponentGroup[] {
  const groups = new Map<string, PriceComponentGroup>();
  for (const item of items) {
    const key = conditionIdentity(item);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    groups.set(key, { items: [item], key, representative: item });
  }
  for (const group of groups.values()) {
    group.items.sort(
      (left, right) => componentRank(left.component) - componentRank(right.component),
    );
  }
  return [...groups.values()];
}

function summarizePriceComponents(
  items: PublicPriceComponent[],
  billingMode: string | null,
): PriceSummarySelection {
  const groups = new Map<string, PublicPriceComponent[]>();
  for (const item of items) {
    const key = [item.component, item.currency, item.unit, item.unitSize ?? ""].join("|");
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }

  const summaries = [...groups.values()]
    .map((candidates) => ({
      item: candidates.reduce((lowest, candidate) =>
        candidate.amount < lowest.amount ? candidate : lowest,
      ),
      qualifier:
        candidates.length > 1 || candidates.some(hasPriceConditions) ? ("from" as const) : null,
    }))
    .sort((left, right) => summaryRank(left.item, right.item, billingMode));
  const selected = billingMode === "mixed" ? mixedSummaryItems(summaries) : summaries.slice(0, 2);
  return { hiddenCount: summaries.length - selected.length, items: selected };
}

function summaryRank(
  left: PublicPriceComponent,
  right: PublicPriceComponent,
  billingMode: string | null,
): number {
  const preferred = billingMode ? summaryComponentOrder[billingMode] : undefined;
  const leftPreferredRank = preferred?.indexOf(left.component) ?? -1;
  const rightPreferredRank = preferred?.indexOf(right.component) ?? -1;
  if (leftPreferredRank !== rightPreferredRank) {
    if (leftPreferredRank === -1) return 1;
    if (rightPreferredRank === -1) return -1;
    return leftPreferredRank - rightPreferredRank;
  }
  return componentRank(left.component) - componentRank(right.component);
}

function mixedSummaryItems(items: PriceSummaryItem[]): PriceSummaryItem[] {
  const selected: PriceSummaryItem[] = [];
  const selectedDomains = new Set<string>();
  for (const item of items) {
    const domain = priceComponentDomain(item.item);
    if (selectedDomains.has(domain)) continue;
    selected.push(item);
    selectedDomains.add(domain);
    if (selected.length === 2) return selected;
  }
  for (const item of items) {
    if (selected.includes(item)) continue;
    selected.push(item);
    if (selected.length === 2) break;
  }
  return selected;
}

function priceComponentDomain(item: PublicPriceComponent): string {
  if (item.unit === "token") return "token";
  if (item.unit === "character") return "character";
  if (item.unit === "image") return "image";
  if (item.unit === "second" && item.component.startsWith("audio_")) return "audio-duration";
  if (item.unit === "second" && item.component.startsWith("video_")) return "video-duration";
  if (item.unit === "request" || item.unit === "item") return "request-item";
  return item.unit || item.component;
}

function hasPriceConditions(item: PublicPriceComponent): boolean {
  return Boolean(
    item.tier ||
    item.upperBound ||
    item.resolution ||
    item.quality ||
    item.operation ||
    item.withAudio,
  );
}

function conditionIdentity(item: PublicPriceComponent): string {
  const identity = [
    item.tier,
    item.upperBound,
    item.resolution,
    item.quality,
    item.operation,
    item.withAudio,
  ]
    .map((value) => value ?? "")
    .join("|");
  return identity || "base";
}

function priceComponentIdentity(item: PublicPriceComponent): string {
  return [item.component, item.unit, item.unitSize ?? "", conditionIdentity(item)].join("|");
}

function componentRank(component: string): number {
  const rank = componentOrder.indexOf(component as (typeof componentOrder)[number]);
  return rank === -1 ? componentOrder.length : rank;
}

function findMatchingPriceComponent(
  item: PublicPriceComponent,
  candidates: PublicPriceComponent[],
): PublicPriceComponent | null {
  return (
    candidates.find(
      (candidate) =>
        candidate.component === item.component &&
        candidate.currency === item.currency &&
        candidate.unit === item.unit &&
        candidate.unitSize === item.unitSize &&
        conditionIdentity(candidate) === conditionIdentity(item),
    ) ?? null
  );
}

function priceGroupConditions(
  item: PublicPriceComponent,
  locale: SiteLocale,
  translate: (key: string, options?: Record<string, unknown>) => string,
): string[] {
  const conditions = [item.tier, item.operation, item.quality, item.resolution]
    .filter((value): value is string => Boolean(value))
    .map((value) => translateCondition(value, translate));
  if (item.withAudio === "true") conditions.push(translate("price.condition.withAudio"));
  if (item.withAudio === "false") conditions.push(translate("price.condition.withoutAudio"));
  if (item.upperBound) {
    const upperBound = Number(item.upperBound);
    const formattedBound = Number.isFinite(upperBound)
      ? new Intl.NumberFormat(siteLocaleMeta[locale].numberLocale, {
          maximumFractionDigits: 0,
          notation: upperBound >= 1_000 ? "compact" : "standard",
        }).format(upperBound)
      : item.upperBound;
    conditions.push(
      item.unit === "token"
        ? translate("price.condition.contextUpTo", { count: formattedBound })
        : translate("price.condition.upTo", { count: formattedBound }),
    );
  }
  return [...new Set(conditions)];
}

function translateCondition(
  value: string,
  translate: (key: string, options?: Record<string, unknown>) => string,
): string {
  const key = conditionTranslationKeys[value];
  return key ? translate(key) : readableIdentifier(value);
}

function readableIdentifier(value: string): string {
  return value.replaceAll("_", " ");
}

function formatPriceAmount(item: PublicPriceComponent, locale: SiteLocale): string {
  const amount = new Intl.NumberFormat(siteLocaleMeta[locale].numberLocale, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  }).format(item.amount);
  return `${amount} ${item.currency}`;
}

function formatPriceUnit(
  item: PublicPriceComponent,
  locale: SiteLocale,
  translate: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (item.unit === "token" && item.unitSize === 1_000_000) {
    return translate("price.unit.millionTokens");
  }
  if (item.unit === "token" && item.unitSize === 1_000) {
    return translate("price.unit.thousandTokens");
  }
  if (item.unit === "character" && item.unitSize === 1_000_000) {
    return translate("price.unit.millionCharacters");
  }
  if (item.unit === "character" && item.unitSize === 1_000) {
    return translate("price.unit.thousandCharacters");
  }
  if (item.unit === "request" && (!item.unitSize || item.unitSize === 1)) {
    return translate("price.unit.perRequest");
  }
  if (item.unit === "second" && (!item.unitSize || item.unitSize === 1)) {
    return translate("price.unit.perSecond");
  }
  if (item.unit === "image" && (!item.unitSize || item.unitSize === 1)) {
    return translate("price.unit.perImage");
  }
  if (item.unit === "item" && (!item.unitSize || item.unitSize === 1)) {
    return translate("price.unit.perItem");
  }

  const unit = translate(`price.unit.${item.unit}`, {
    defaultValue: readableIdentifier(item.unit),
  });
  if (!item.unitSize || item.unitSize === 1) return unit;
  const count = new Intl.NumberFormat(siteLocaleMeta[locale].numberLocale, {
    maximumFractionDigits: 3,
    notation: item.unitSize >= 1_000 ? "compact" : "standard",
  }).format(item.unitSize);
  return translate("price.unit.counted", { count, unit });
}

function priceLayout(billingMode: string | null): string {
  if (billingMode === "video_duration") return "video-duration";
  if (billingMode === "audio_duration") return "audio-duration";
  return billingMode ?? "conditional";
}
