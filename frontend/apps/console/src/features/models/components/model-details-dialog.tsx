import { Link } from "@tanstack/react-router";
import { CheckCircle2Icon, CircleSlash2Icon, CopyIcon, SparklesIcon } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@token-boat/ui/components/ui/dialog";
import { Separator } from "@token-boat/ui/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@token-boat/ui/components/ui/tooltip";
import { cn } from "@token-boat/ui/lib/utils";
import type {
  ModelCatalogItem,
  ModelCatalogPriceItem,
  ModelCatalogPriceSummary,
} from "@/data/contracts";
import { formatNumber } from "@/lib/format";

type ModelDetailsDialogProps = {
  accountGroup: string;
  model: ModelCatalogItem;
  onCopy: () => void;
  onOpenChange(open: boolean): void;
  open: boolean;
};

export function ModelDetailsDialog(props: ModelDetailsDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "zh";
  const context = props.model.contextWindow ? formatNumber(props.model.contextWindow, locale) : "—";
  const accountPrice = props.model.accountPrice ?? legacyPriceSummary(props.model);
  const effectiveGroup = commonEffectiveGroup(accountPrice?.items ?? []);

  return (
    <Dialog onOpenChange={props.onOpenChange} open={props.open}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        closeLabel={t("Close")}
      >
        <DialogHeader className="shrink-0 gap-1 px-4 pt-4 pb-2 sm:px-5 sm:pt-5">
          <div className="flex flex-wrap items-center gap-1.5 pr-8">
            <DialogTitle className="break-all font-mono">{props.model.id}</DialogTitle>
            <Badge variant={props.model.available ? "secondary" : "outline"}>
              {props.model.available ? (
                <CheckCircle2Icon data-icon="inline-start" />
              ) : (
                <CircleSlash2Icon data-icon="inline-start" />
              )}
              {props.model.available ? t("Available") : t("Unavailable")}
            </Badge>
          </div>
          <DialogDescription className="text-xs leading-4">
            {props.model.description
              ? t(props.model.description)
              : t("Complete model information and pricing for the current account group.")}
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div
          aria-label={t("Model details")}
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5"
          data-model-details-scroll-region
          role="region"
          tabIndex={0}
        >
          <dl className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
            <ModelDetail label={t("Provider")} value={props.model.provider} />
            <ModelDetail label={t("Type")} value={t(modelFamilyLabel(props.model.family))} />
            <ModelDetail label={t("Context")} value={context} />
            <ModelDetail label={t("Account group")} value={props.accountGroup} />
            <ModelDetail
              label={t("Billing mode")}
              value={t(billingModeLabel(accountPrice?.billingMode))}
            />
            <ModelDetail
              label={t("Price structure")}
              value={t(priceStructureLabel(accountPrice?.priceStructure))}
            />
            <ModelDetail
              label={t("Quote source")}
              value={t(accountPriceSourceLabel(props.model.accountPriceSource))}
            />
            <ModelDetail
              label={t("Pricing source")}
              value={t(pricingSourceLabel(props.model.pricingSource))}
            />
            <ModelDetail
              label={t("Availability")}
              value={t(availabilityStatusLabel(props.model.availabilityStatus))}
            />
          </dl>

          <Separator />

          <div className="grid gap-3 sm:grid-cols-2">
            <ModelBadgeList
              emptyLabel="—"
              label={t("Capabilities")}
              values={props.model.features.map((feature) => t(feature))}
            />
            <ModelBadgeList
              emptyLabel={t("Not provided")}
              label={t("Compatible endpoints")}
              values={props.model.supportedEndpointTypes
                .map(endpointTypeLabel)
                .map((label) => t(label))}
            />
          </div>

          <Separator />

          <section
            className="flex min-w-0 flex-col gap-2"
            aria-labelledby="complete-account-quote-title"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium" id="complete-account-quote-title">
                  {t("Complete account quote")}
                </h3>
                <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                  {t("All billable components returned for this model are shown below.")}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">
                  {t("Group")}: {effectiveGroup || props.accountGroup}
                </Badge>
                {accountPrice ? <Badge variant="secondary">{accountPrice.currency}</Badge> : null}
              </div>
            </div>

            <ModelPriceDetails
              accountPrice={accountPrice}
              locale={locale}
              officialPrice={props.model.officialPrice}
            />
          </section>
        </div>

        <DialogFooter className="m-0 shrink-0 rounded-b-xl px-4 py-2 sm:px-5">
          <Button onClick={props.onCopy} variant="outline">
            <CopyIcon data-icon="inline-start" />
            {t("Copy model ID")}
          </Button>
          {props.model.available ? (
            <Button
              nativeButton={false}
              render={<Link search={{ model: props.model.id }} to="/playground" />}
            >
              <SparklesIcon data-icon="inline-start" />
              {t("Test in Playground")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ModelCapabilitiesSummary(props: { features: string[] }) {
  const { t } = useTranslation();
  const translatedFeatures = props.features.map((feature) => t(feature));
  const hiddenFeatures = translatedFeatures.slice(2);
  const hiddenLabel = hiddenFeatures.join(", ");

  if (translatedFeatures.length === 0) return "—";

  return (
    <div className="flex max-w-52 items-center gap-1" title={translatedFeatures.join(", ")}>
      {translatedFeatures.slice(0, 2).map((feature) => (
        <Badge key={feature} variant="outline">
          {feature}
        </Badge>
      ))}
      {hiddenFeatures.length > 0 ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Badge
                render={
                  <button
                    aria-label={`${t("More capabilities")}: ${hiddenLabel}`}
                    title={hiddenLabel}
                    type="button"
                  />
                }
                variant="secondary"
              />
            }
          >
            +{hiddenFeatures.length}
          </TooltipTrigger>
          <TooltipContent className="max-w-64" side="top">
            <span>{hiddenLabel}</span>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

function ModelPriceDetails(props: {
  accountPrice: ModelCatalogPriceSummary | null;
  locale: string;
  officialPrice: ModelCatalogPriceSummary | null;
}) {
  const { t } = useTranslation();
  const accountPrice = props.accountPrice;
  if (!accountPrice || accountPrice.items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        {t("Contact us for complete pricing")}
      </div>
    );
  }
  const effectiveGroups = new Set(
    accountPrice.items.map((item) => item.appliedGroupLabel || item.appliedGroup).filter(Boolean),
  );
  const showItemGroup = effectiveGroups.size > 1;
  const groups = groupPriceItems(accountPrice.items);
  const isTokenPricing = accountPrice.billingMode === "token";

  return (
    <div
      className={cn("grid gap-2", !isTokenPricing && groups.length > 1 && "sm:grid-cols-2")}
      data-price-layout={isTokenPricing ? "token" : modelPriceLayout(accountPrice.billingMode)}
    >
      {groups.map((group, index) => (
        <PriceGroupCard
          accountCurrency={accountPrice.currency}
          group={group}
          isTokenPricing={isTokenPricing}
          key={group.key}
          locale={props.locale}
          officialCurrency={props.officialPrice?.currency ?? accountPrice.currency}
          officialItems={props.officialPrice?.items ?? []}
          previousGroup={groups[index - 1] ?? null}
          showItemGroup={showItemGroup}
        />
      ))}
    </div>
  );
}

type PriceItemGroup = {
  key: string;
  items: ModelCatalogPriceItem[];
  representative: ModelCatalogPriceItem;
};

function PriceGroupCard(props: {
  accountCurrency: string;
  group: PriceItemGroup;
  isTokenPricing: boolean;
  locale: string;
  officialCurrency: string;
  officialItems: ModelCatalogPriceItem[];
  previousGroup: PriceItemGroup | null;
  showItemGroup: boolean;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const conditionBadges = priceGroupBadges(props.group.representative, t);
  const groupTitle = conditionBadges.shift() ?? t("Standard");
  const contextRange = props.isTokenPricing
    ? tokenContextRange(props.previousGroup, props.group, props.locale, t)
    : null;
  const itemRows = priceItemRows(props.group.items, props.isTokenPricing);

  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 overflow-hidden rounded-lg border bg-popover"
    >
      <header className="flex min-h-10 flex-wrap items-center gap-1.5 border-b bg-muted/30 px-3 py-2">
        <h4 id={titleId}>
          <Badge variant="outline">{groupTitle}</Badge>
        </h4>
        {contextRange ? <span className="text-xs sm:text-sm">{contextRange}</span> : null}
        {conditionBadges.map((condition) => (
          <Badge key={condition} variant="secondary">
            {condition}
          </Badge>
        ))}
      </header>
      <div className="flex flex-1 flex-col bg-border">
        {itemRows.map((row, rowIndex) => (
          <div
            className={cn(
              "grid gap-px",
              rowIndex > 0 && "mt-px",
              priceRowGridClass(row.length, props.isTokenPricing),
            )}
            key={`${props.group.key}-${rowIndex}`}
          >
            {row.map((item) => (
              <PriceMetric
                accountCurrency={props.accountCurrency}
                item={item}
                key={item.key}
                locale={props.locale}
                officialCurrency={props.officialCurrency}
                officialItem={findMatchingPriceItem(item, props.officialItems)}
                showItemGroup={props.showItemGroup}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function PriceMetric(props: {
  accountCurrency: string;
  item: ModelCatalogPriceItem;
  locale: string;
  officialCurrency: string;
  officialItem: ModelCatalogPriceItem | null;
  showItemGroup: boolean;
}) {
  const { t } = useTranslation();
  const effectiveGroup = props.item.appliedGroupLabel || props.item.appliedGroup;
  const baseAmountDiffers =
    props.item.baseAmount !== null &&
    props.item.amount !== null &&
    Math.abs(props.item.baseAmount - props.item.amount) > 0.000005;

  return (
    <div
      className="flex min-h-20 min-w-0 flex-col justify-between gap-2 bg-popover px-3 py-2.5"
      data-price-component={props.item.component}
    >
      <div className="text-xs leading-4">
        {t(priceComponentLabel(props.item.component))}
        <span className="text-muted-foreground">
          {" "}
          / {priceUnitLabel(props.item, t, props.locale)}
        </span>
      </div>
      <div className="min-w-0">
        <div className="font-mono text-base leading-5 font-medium tabular-nums">
          <span className="sr-only">{t("Account price")}: </span>
          {props.item.amount === null
            ? "—"
            : formatPriceAmount(props.item.amount, props.locale, props.accountCurrency)}
        </div>
        {props.officialItem?.amount !== null && props.officialItem?.amount !== undefined ? (
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1 text-[11px] leading-4 text-muted-foreground">
            {t("Official reference")}:{" "}
            <span className="font-mono tabular-nums">
              {formatPriceAmount(props.officialItem.amount, props.locale, props.officialCurrency)}
            </span>
          </div>
        ) : null}
        {baseAmountDiffers && props.item.baseAmount !== null ? (
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1 text-[11px] leading-4 text-muted-foreground">
            {t("Before group adjustment")}:{" "}
            <span className="font-mono tabular-nums">
              {formatPriceAmount(props.item.baseAmount, props.locale, props.accountCurrency)}
            </span>
          </div>
        ) : null}
        {props.showItemGroup && effectiveGroup ? (
          <div className="mt-0.5 break-words text-[11px] leading-4 text-muted-foreground">
            {t("Effective group")}: {effectiveGroup}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function groupPriceItems(items: ModelCatalogPriceItem[]): PriceItemGroup[] {
  const groups = new Map<string, PriceItemGroup>();
  for (const item of items) {
    const key = [
      item.tier,
      item.upperBound,
      item.resolution,
      item.quality,
      item.operation,
      item.withAudio,
    ]
      .map((value) => value ?? "")
      .join("|");
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    groups.set(key, { key: key || "standard", items: [item], representative: item });
  }
  return [...groups.values()];
}

function priceItemRows(
  items: ModelCatalogPriceItem[],
  isTokenPricing: boolean,
): ModelCatalogPriceItem[][] {
  if (!isTokenPricing || items.length <= 4) return [items];
  const columnCount = items.length <= 6 ? 3 : 4;
  const rows: ModelCatalogPriceItem[][] = [];
  for (let index = 0; index < items.length; index += columnCount) {
    rows.push(items.slice(index, index + columnCount));
  }
  return rows;
}

function priceRowGridClass(itemCount: number, isTokenPricing: boolean): string {
  if (!isTokenPricing) return "grid-cols-1";
  if (itemCount === 2) return "sm:grid-cols-2";
  if (itemCount === 3) return "sm:grid-cols-3";
  if (itemCount >= 4) return "sm:grid-cols-2 lg:grid-cols-4";
  return "grid-cols-1";
}

function priceGroupBadges(
  item: ModelCatalogPriceItem,
  translate: (key: string) => string,
): string[] {
  const badges = [
    ...new Set(
      [item.resolution, item.quality, item.operation, item.tier]
        .filter((value): value is string => Boolean(value))
        .map((value) => priceConditionLabel(value, translate)),
    ),
  ];
  if (item.withAudio === "true") badges.push(translate("With audio"));
  if (item.withAudio === "false") badges.push(translate("Without audio"));
  if (item.unit !== "token" && item.upperBound) badges.push(`≤ ${item.upperBound}`);
  return badges;
}

function tokenContextRange(
  previousGroup: PriceItemGroup | null,
  group: PriceItemGroup,
  locale: string,
  translate: (key: string, options?: Record<string, string>) => string,
): string | null {
  const previousUpperBound = numericUpperBound(previousGroup?.representative.upperBound);
  const upperBound = numericUpperBound(group.representative.upperBound);
  const formatBound = (value: number) => formatNumber(value, locale);

  if (previousUpperBound !== null && upperBound !== null) {
    return translate("{{lower}} < Context ≤ {{upper}} tokens", {
      lower: formatBound(previousUpperBound),
      upper: formatBound(upperBound),
    });
  }
  if (upperBound !== null) {
    return translate("Context ≤ {{count}} tokens", { count: formatBound(upperBound) });
  }
  if (previousUpperBound !== null) {
    return translate("Context > {{count}} tokens", { count: formatBound(previousUpperBound) });
  }
  return null;
}

function numericUpperBound(value: string | null | undefined): number | null {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function modelPriceLayout(billingMode: string): string {
  if (billingMode === "video_duration") return "video-duration";
  if (billingMode === "audio_duration") return "audio-duration";
  if (billingMode === "request") return "request";
  if (billingMode === "image") return "image";
  if (billingMode === "character") return "character";
  if (billingMode === "mixed") return "mixed";
  return "conditional";
}

function formatPriceAmount(amount: number, locale: string, currency: string): string {
  const value = formatNumber(amount, locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 5,
  });
  return `${value} ${currency}`;
}

function ModelDetail(props: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] leading-4 text-muted-foreground">{props.label}</dt>
      <dd
        className="mt-0.5 truncate text-sm leading-5 font-medium"
        title={props.value ?? undefined}
      >
        {props.value || "—"}
      </dd>
    </div>
  );
}

function ModelBadgeList(props: { emptyLabel: string; label: string; values: string[] }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-medium">{props.label}</h3>
      <div className="flex min-h-5 flex-wrap gap-1 text-xs">
        {props.values.length > 0
          ? props.values.map((value) => (
              <Badge key={value} variant="outline">
                {value}
              </Badge>
            ))
          : props.emptyLabel}
      </div>
    </section>
  );
}

function legacyPriceSummary(model: ModelCatalogItem): ModelCatalogPriceSummary | null {
  if (model.currency === null) return null;
  const items: ModelCatalogPriceItem[] = [];
  if (model.inputPrice !== null && model.inputPriceUnit !== null) {
    items.push(legacyPriceItem("token_input", model.inputPrice, model.inputPriceUnit));
  }
  if (model.outputPrice !== null && model.outputPriceUnit !== null) {
    items.push(legacyPriceItem("token_output", model.outputPrice, model.outputPriceUnit));
  }
  if (items.length === 0) return null;
  const units = new Set(items.map((item) => item.unit));
  return {
    currency: model.currency,
    billingMode: units.size === 1 ? (items[0]?.unit ?? "unknown") : "mixed",
    priceStructure: "flat",
    comparisonScope: null,
    candidateCount: null,
    items,
  };
}

function legacyPriceItem(
  component: string,
  amount: number,
  priceUnit: NonNullable<ModelCatalogItem["inputPriceUnit"]>,
): ModelCatalogPriceItem {
  const unit = priceUnit === "million_tokens" ? "token" : priceUnit;
  return {
    key: component,
    component,
    amount,
    baseAmount: null,
    unit,
    unitSize: priceUnit === "million_tokens" ? 1_000_000 : 1,
    tier: null,
    upperBound: null,
    operation: null,
    quality: null,
    resolution: null,
    withAudio: null,
    appliedGroup: null,
    appliedGroupLabel: null,
  };
}

function findMatchingPriceItem(
  item: ModelCatalogPriceItem,
  candidates: ModelCatalogPriceItem[],
): ModelCatalogPriceItem | null {
  return (
    candidates.find((candidate) => candidate.key === item.key) ??
    candidates.find(
      (candidate) =>
        candidate.component === item.component &&
        candidate.tier === item.tier &&
        candidate.resolution === item.resolution &&
        candidate.quality === item.quality &&
        candidate.operation === item.operation &&
        candidate.withAudio === item.withAudio &&
        candidate.upperBound === item.upperBound,
    ) ??
    null
  );
}

function commonEffectiveGroup(items: ModelCatalogPriceItem[]): string {
  const groups = new Set(
    items.map((item) => item.appliedGroupLabel || item.appliedGroup).filter(Boolean),
  );
  return groups.size === 1 ? String([...groups][0]) : "";
}

function modelFamilyLabel(family: ModelCatalogItem["family"]): string {
  const labels: Record<ModelCatalogItem["family"], string> = {
    chat: "Chat",
    reasoning: "Reasoning",
    embedding: "Embedding",
    image: "Image",
    audio: "Audio",
    video: "Video",
    unknown: "Unknown",
  };
  return labels[family];
}

function billingModeLabel(value?: string): string {
  const labels: Record<string, string> = {
    token: "Token based",
    request: "Per request",
    image: "Image based",
    audio_duration: "Audio duration",
    video_duration: "Video duration",
    character: "Character based",
    mixed: "Mixed billing",
  };
  return (value && labels[value]) || "Not provided";
}

function priceStructureLabel(value?: string): string {
  const labels: Record<string, string> = {
    flat: "Flat pricing",
    tiered: "Tiered pricing",
    expression: "Conditional pricing",
  };
  return (value && labels[value]) || "Not provided";
}

function accountPriceSourceLabel(value: ModelCatalogItem["accountPriceSource"]): string {
  if (value === "group") return "Current group price";
  return "Not provided";
}

function pricingSourceLabel(value: string | null): string {
  if (value === "sales_price_book") return "Active price book";
  if (value === "demo_price_book") return "Demo price book";
  return value || "Not provided";
}

function availabilityStatusLabel(value: string | null): string {
  if (value === "available") return "Available";
  if (value === "price_unavailable") return "Price unavailable";
  if (value === "route_unavailable") return "Route unavailable";
  return value || "Not provided";
}

function endpointTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    openai: "OpenAI compatible",
    anthropic: "Anthropic compatible",
    gemini: "Gemini compatible",
    deepseek: "DeepSeek compatible",
    "image-generation": "Image generation",
    "openai-video": "OpenAI video",
  };
  return labels[value] || value;
}

function priceConditionLabel(value: string, translate: (key: string) => string): string {
  const labels: Record<string, string> = {
    standard: "Standard",
    long_context: "Long context",
    off_peak: "Off-peak",
    peak: "Peak",
    "4k_default": "4K",
  };
  if (labels[value]) return translate(labels[value]);
  if (value.endsWith("_default")) return value.slice(0, -"_default".length);
  return value.replaceAll("_", " ");
}

function priceComponentLabel(value: string): string {
  const labels: Record<string, string> = {
    token_input: "Input tokens",
    token_output: "Output tokens",
    cache_read: "Cache read",
    cache_write: "Cache write",
    cache_write_1h: "1h cache write",
    image_token_input: "Image input tokens",
    image_token_output: "Image output tokens",
    cached_image_token_input: "Cached image input tokens",
    audio_token_input: "Audio input tokens",
    audio_token_output: "Audio output tokens",
    request: "Request",
    tool_call: "Tool call",
    generated_item: "Generated item",
    image_input: "Image input",
    image_output: "Image output",
    audio_input: "Audio input",
    audio_output: "Audio output",
    video_input: "Video input",
    video_output: "Video output",
    character_input: "Input characters",
    character_output: "Output characters",
  };
  return labels[value] || value;
}

function priceUnitLabel(
  item: ModelCatalogPriceItem,
  translate: (key: string) => string,
  locale: string,
): string {
  if (item.unit === "token") {
    if (item.unitSize === 1_000_000) return translate("million tokens");
    if (item.unitSize === 1_000) return translate("thousand tokens");
  }
  if (item.unit === "request") return translate("request");
  if (item.unit === "second") return translate("second");
  if (item.unit === "item") return translate("item");

  const unitSize =
    item.unitSize && item.unitSize !== 1 ? `${formatNumber(item.unitSize, locale)} ` : "";
  return `${unitSize}${translate(item.unit)}`;
}
