import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2Icon,
  CircleSlash2Icon,
  CopyIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@token-boat/ui/components/ui/alert";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@token-boat/ui/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@token-boat/ui/components/ui/select";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@token-boat/ui/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@token-boat/ui/components/ui/tooltip";
import { useSession } from "@/app/session/session-context";
import { DataLoadError } from "@/components/data-load-error";
import { PageHeader } from "@/components/page-header";
import { TableEmptyState } from "@/components/table-empty-state";
import { TableLoadingState } from "@/components/table-loading-state";
import type { ModelCatalogItem } from "@/data/contracts";
import { repository } from "@/data/repository";
import { copyText } from "@/lib/clipboard";
import { formatCurrency, formatNumber, formatPreciseCurrency } from "@/lib/format";
import { type ModelSearch, type SearchPatch, useControllableSearch } from "@/lib/list-search";
import { ModelCapabilitiesSummary, ModelDetailsDialog } from "../components/model-details-dialog";

type FamilyFilter = "all" | ModelCatalogItem["family"];

type ModelsPageProps = {
  onSearchChange?: (patch: SearchPatch<ModelSearch>) => void;
  search?: ModelSearch;
};

export function ModelsPage(props: ModelsPageProps) {
  const { t, i18n } = useTranslation();
  const { session } = useSession();
  const [search, updateSearch] = useControllableSearch(props.search, props.onSearchChange);
  const queryText = search.q ?? "";
  const family: FamilyFilter = search.family ?? "all";
  const availability = search.availability ?? "available";
  const accountGroup = session?.user.group ?? null;
  const query = useQuery({
    queryKey: ["model-catalog", accountGroup],
    queryFn: () => repository.listModelCatalog(accountGroup ?? ""),
    enabled: accountGroup !== null,
  });
  const locale = i18n.resolvedLanguage ?? "zh";
  const hasActiveFilters = Boolean(queryText || family !== "all" || availability !== "available");
  const catalogMetrics = useMemo(() => {
    if (!query.data) return null;
    const modelTypes = new Set<ModelCatalogItem["family"]>();
    let availableModels = 0;
    let pricedModels = 0;
    for (const model of query.data) {
      modelTypes.add(model.family);
      if (model.available) availableModels += 1;
      if (hasAccountPrice(model)) pricedModels += 1;
    }
    return { availableModels, modelTypes: modelTypes.size, pricedModels };
  }, [query.data]);
  const models = useMemo(() => {
    const normalizedQuery = queryText.trim().toLowerCase();
    return (query.data ?? []).filter((model) => {
      if (family !== "all" && model.family !== family) return false;
      if (availability === "available" && !model.available) return false;
      if (!normalizedQuery) return true;
      return `${model.id} ${model.provider ?? ""} ${model.features.join(" ")}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [availability, family, query.data, queryText]);
  const selectedModel = search.detail
    ? (query.data?.find((model) => model.id === search.detail) ?? null)
    : null;

  const copyModel = async (model: string) => {
    try {
      await copyText(model);
      toast.success(t("Model ID copied"));
    } catch {
      toast.error(t("Unable to copy model ID"));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        action={
          <Button nativeButton={false} render={<Link to="/playground" />}>
            {t("Test in Playground")}
          </Button>
        }
        description={t("Compare available models, capabilities, context limits, and prices.")}
        title={t("Models and pricing")}
      />

      <div className="grid gap-4 md:grid-cols-3">
        {query.isPending
          ? Array.from({ length: 3 }).map((_, index) => <Skeleton className="h-28" key={index} />)
          : [
              { label: t("Available models"), value: catalogMetrics?.availableModels },
              { label: t("Priced models"), value: catalogMetrics?.pricedModels },
              { label: t("Model types"), value: catalogMetrics?.modelTypes },
            ].map((metric) => (
              <Card key={metric.label}>
                <CardHeader>
                  <CardDescription>{metric.label}</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">
                    {metric.value === undefined ? "—" : formatNumber(metric.value, locale)}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
      </div>

      {query.data && search.detail && !selectedModel ? (
        <Alert>
          <CircleSlash2Icon aria-hidden="true" />
          <AlertTitle>{t("Selected model unavailable")}</AlertTitle>
          <AlertDescription>
            {t(
              "This model is not in the current account catalog. It may have been removed or your account access changed.",
            )}
          </AlertDescription>
          <AlertAction>
            <Button onClick={() => updateSearch({ detail: undefined })} size="sm" variant="outline">
              {t("Clear selection")}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("Model catalog")}</CardTitle>
          <CardDescription>
            {t("Prices shown here reflect the current account group and active price book.")}
          </CardDescription>
          <CardAction>
            <Badge variant="outline">
              {t("Group")}: {accountGroup ?? "—"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const nextQuery = String(formData.get("q") ?? "").trim();
              updateSearch({ detail: undefined, q: nextQuery || undefined });
            }}
          >
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                aria-label={t("Search models")}
                defaultValue={queryText}
                key={queryText}
                name="q"
                placeholder={t("Search model, provider, or capability")}
              />
            </InputGroup>
            <Select
              value={family}
              onValueChange={(value) => {
                if (!value) return;
                const nextFamily = value as FamilyFilter;
                updateSearch({
                  detail: undefined,
                  family: nextFamily === "all" ? undefined : nextFamily,
                });
              }}
            >
              <SelectTrigger aria-label={t("Model type")} className="w-full">
                <SelectValue>{t(modelFamilyFilterLabel(family))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("All model types")}</SelectItem>
                  <SelectItem value="chat">{t("Chat")}</SelectItem>
                  <SelectItem value="reasoning">{t("Reasoning")}</SelectItem>
                  <SelectItem value="embedding">{t("Embedding")}</SelectItem>
                  <SelectItem value="image">{t("Image")}</SelectItem>
                  <SelectItem value="audio">{t("Audio")}</SelectItem>
                  <SelectItem value="video">{t("Video")}</SelectItem>
                  <SelectItem value="unknown">{t("Unknown")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={availability}
              onValueChange={(value) => {
                if (!value) return;
                updateSearch({
                  availability: value === "available" ? undefined : "all",
                  detail: undefined,
                });
              }}
            >
              <SelectTrigger aria-label={t("Availability")} className="w-full">
                <SelectValue>
                  {t(availability === "available" ? "Available only" : "All availability")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="available">{t("Available only")}</SelectItem>
                  <SelectItem value="all">{t("All availability")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button type="submit" variant="outline">
              {t("Search")}
            </Button>
          </form>

          {query.isError ? (
            <DataLoadError
              className="min-h-72"
              description={t("The available models and current prices could not be loaded.")}
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
              title={t("Unable to load model catalog")}
            />
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Model")}</TableHead>
                    <TableHead>{t("Type")}</TableHead>
                    <TableHead className="text-right">{t("Context")}</TableHead>
                    <TableHead className="text-right">{t("Input price")}</TableHead>
                    <TableHead className="text-right">{t("Output price")}</TableHead>
                    <TableHead>{t("Capabilities")}</TableHead>
                    <TableHead className="text-right">{t("Status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody aria-busy={query.isPending}>
                  {query.isPending ? <TableLoadingState colSpan={7} /> : null}
                  {!query.isPending && models.length === 0 ? (
                    <TableEmptyState
                      action={
                        hasActiveFilters ? (
                          <Button
                            onClick={() =>
                              updateSearch({
                                availability: undefined,
                                detail: undefined,
                                family: undefined,
                                q: undefined,
                              })
                            }
                            size="sm"
                            variant="outline"
                          >
                            {t("Clear filters")}
                          </Button>
                        ) : undefined
                      }
                      colSpan={7}
                      description={t(
                        (query.data?.length ?? 0) > 0
                          ? "Try another model name, provider, capability, or availability filter."
                          : "No models are currently available for this account group.",
                      )}
                      title={t(
                        (query.data?.length ?? 0) > 0
                          ? "No matching models"
                          : "No models available",
                      )}
                    />
                  ) : null}
                  {models.map((model) => (
                    <TableRow key={model.id}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-1">
                          <div className="min-w-0">
                            <Button
                              className="h-auto max-w-56 justify-start p-0 font-mono text-xs font-medium"
                              onClick={() => updateSearch({ detail: model.id })}
                              variant="link"
                            >
                              <span className="truncate" title={model.id}>
                                {model.id}
                              </span>
                            </Button>
                            <div className="truncate text-xs text-muted-foreground">
                              {model.provider || "—"}
                            </div>
                          </div>
                          <Button
                            aria-label={t("Copy model ID")}
                            onClick={() => void copyModel(model.id)}
                            size="icon-sm"
                            variant="ghost"
                          >
                            <CopyIcon className="size-3.5" data-icon="inline-start" />
                          </Button>
                          {model.available ? (
                            <Button
                              aria-label={t("Test in Playground")}
                              nativeButton={false}
                              render={<Link search={{ model: model.id }} to="/playground" />}
                              size="icon-sm"
                              variant="ghost"
                            >
                              <SparklesIcon className="size-3.5" data-icon="inline-start" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{t(modelFamilyLabel(model.family))}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {model.contextWindow
                          ? formatNumber(model.contextWindow, locale, { notation: "compact" })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <ModelPrice
                          currency={model.currency}
                          locale={locale}
                          price={model.inputPrice}
                          pricingAvailable={model.pricingAvailable}
                          qualifier={model.inputPriceQualifier}
                          translate={t}
                          unit={model.inputPriceUnit}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <ModelPrice
                          currency={model.currency}
                          locale={locale}
                          price={model.outputPrice}
                          pricingAvailable={model.pricingAvailable}
                          qualifier={model.outputPriceQualifier}
                          translate={t}
                          unit={model.outputPriceUnit}
                        />
                      </TableCell>
                      <TableCell>
                        <ModelCapabilitiesSummary features={model.features} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={model.available ? "secondary" : "outline"}>
                          {model.available ? (
                            <CheckCircle2Icon data-icon="inline-start" />
                          ) : (
                            <CircleSlash2Icon data-icon="inline-start" />
                          )}
                          {model.available ? t("Available") : t("Unavailable")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            {t(
              "Token prices are shown per one million tokens. Request-priced media models show a per-request estimate when available.",
            )}
          </p>
        </CardContent>
      </Card>

      {selectedModel ? (
        <ModelDetailsDialog
          accountGroup={accountGroup ?? ""}
          model={selectedModel}
          onCopy={() => void copyModel(selectedModel.id)}
          onOpenChange={(open) => {
            if (!open) updateSearch({ detail: undefined });
          }}
          open
        />
      ) : null}
    </div>
  );
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

function modelFamilyFilterLabel(family: FamilyFilter): string {
  if (family === "all") return "All model types";
  return modelFamilyLabel(family);
}

type ModelPriceProps = {
  currency: string | null;
  locale: string;
  price: number | null;
  pricingAvailable: boolean;
  qualifier: ModelCatalogItem["inputPriceQualifier"];
  translate: (key: string) => string;
  unit: ModelCatalogItem["inputPriceUnit"];
};

function ModelPrice(props: ModelPriceProps) {
  if (props.price === null || props.currency === null || props.unit === null) return "—";

  const shortUnit = modelPriceShortUnit(props.unit, props.locale);
  const amount = formatCurrency(props.price, props.locale, props.currency);
  const prefix = props.qualifier === "from" ? "≥" : "";
  const fullPrice = formatFullModelPrice(
    props.price,
    props.qualifier,
    props.currency,
    props.unit,
    props.pricingAvailable,
    props.locale,
    props.translate,
  );

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={fullPrice}
        render={<span className="inline-flex cursor-help tabular-nums" />}
      >
        {prefix}
        {amount}/{shortUnit}
      </TooltipTrigger>
      <TooltipContent>{fullPrice}</TooltipContent>
    </Tooltip>
  );
}

function hasAccountPrice(model: ModelCatalogItem): boolean {
  if (!model.pricingAvailable) return false;
  if (model.accountPrice?.items.some((item) => item.amount !== null)) return true;
  const hasInputPrice = model.inputPrice !== null && model.inputPriceUnit !== null;
  const hasOutputPrice = model.outputPrice !== null && model.outputPriceUnit !== null;
  return model.currency !== null && (hasInputPrice || hasOutputPrice);
}

function modelPriceShortUnit(
  unit: NonNullable<ModelCatalogItem["inputPriceUnit"]>,
  locale: string,
): string {
  if (unit === "million_tokens") return "1M";
  if (unit === "second") return locale.startsWith("zh") ? "秒" : "s";
  return locale.startsWith("zh") ? "次" : "req";
}

function formatFullModelPrice(
  price: number | null,
  qualifier: ModelCatalogItem["inputPriceQualifier"],
  currency: string,
  unit: ModelCatalogItem["inputPriceUnit"],
  pricingAvailable: boolean,
  locale: string,
  translate: (key: string) => string,
) {
  if (price === null) return pricingAvailable ? "—" : translate("Contact us");

  const fullUnit =
    unit === "request"
      ? translate("per request")
      : unit === "second"
        ? translate("per second")
        : translate("per 1M tokens");
  const prefix = qualifier === "from" ? `${translate("From")} ` : "";
  return `${prefix}${formatPreciseCurrency(price, locale, currency)} ${fullUnit}`;
}
