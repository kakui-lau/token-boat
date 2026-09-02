import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  BellRingIcon,
  BoxesIcon,
  CircleDollarSignIcon,
  KeyRoundIcon,
  MessageSquareTextIcon,
  PlusIcon,
  ScrollTextIcon,
  WalletCardsIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@token-boat/ui/components/ui/item";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@token-boat/ui/components/ui/table";
import { DataLoadError } from "@/components/data-load-error";
import { DateRangePicker } from "@/components/date-range-picker";
import { PageHeader } from "@/components/page-header";
import { TableEmptyState } from "@/components/table-empty-state";
import { TableLoadingState } from "@/components/table-loading-state";
import { TableDateTime, TableText } from "@/components/table-value";
import type { ActivityRecord, DateRangeValue, OnboardingStep } from "@/data/contracts";
import { repository } from "@/data/repository";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  dateRangeSearchPatch,
  resolveDateRange,
  type OverviewSearch,
  type SearchPatch,
  useControllableSearch,
} from "@/lib/list-search";

type OverviewPageProps = {
  onSearchChange?: (patch: SearchPatch<OverviewSearch>) => void;
  search?: OverviewSearch;
};

type OverviewDestination = "/api-keys" | "/billing" | "/logs" | "/usage";

export function OverviewPage(props: OverviewPageProps) {
  const { t, i18n } = useTranslation();
  const [search, updateSearch] = useControllableSearch(props.search, props.onSearchChange);
  const range = useMemo(
    () => resolveDateRange(search, "7d"),
    [search.from, search.range, search.to],
  );
  const setRange = (value: DateRangeValue) => updateSearch(dateRangeSearchPatch(value, "7d"));
  const overview = useQuery({
    queryKey: ["overview", range],
    queryFn: () => repository.getOverview(range),
  });
  const onboarding = useQuery({
    queryKey: ["onboarding"],
    queryFn: () => repository.getOnboarding(),
  });
  const locale = i18n.resolvedLanguage ?? "en";
  const metrics = overview.data
    ? [
        {
          label: t("Available balance"),
          note: t("Ready for API usage"),
          to: "/billing" as const,
          value: formatCurrency(overview.data.availableBalance, locale),
        },
        {
          label: t("Requests"),
          note: t("Selected date range"),
          to: "/usage" as const,
          value: formatNumber(overview.data.requestCount, locale),
        },
        {
          label: t("Active API keys"),
          note: t("Credentials ready to use"),
          to: "/api-keys" as const,
          value: formatNumber(overview.data.activeApiKeys, locale),
        },
        {
          label: t("Success rate"),
          note: t("Selected usage period"),
          to: "/logs" as const,
          value:
            overview.data.successRate === null
              ? "—"
              : `${formatNumber(overview.data.successRate, locale, { maximumFractionDigits: 2 })}%`,
        },
      ]
    : [];
  const completedSteps = onboarding.data?.steps.filter((step) => step.complete).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker onChange={setRange} value={range} />
            <Button nativeButton={false} render={<Link to="/api-keys" />}>
              <PlusIcon data-icon="inline-start" />
              {t("Create API key")}
            </Button>
          </div>
        }
        description={t("Here is your API workspace at a glance.")}
        title={t("Good morning")}
      />

      {overview.isError ? (
        <DataLoadError
          description={t(
            "Workspace statistics could not be loaded. Quick actions and setup progress remain available.",
          )}
          onRetry={() => void overview.refetch()}
          retrying={overview.isFetching}
          title={t("Unable to load workspace overview")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {overview.isPending
            ? Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-28" key={index} />)
            : metrics.map((metric) => <OverviewMetricCard key={metric.label} metric={metric} />)}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("Continue setup")}</CardTitle>
            <CardDescription>
              {t("Complete these steps before sending production traffic.")}
            </CardDescription>
            <CardAction>
              {onboarding.isPending ? <Skeleton className="h-5 w-12" /> : null}
              {onboarding.data ? (
                <Badge variant="secondary">
                  {completedSteps} / {onboarding.data.steps.length}
                </Badge>
              ) : null}
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {onboarding.isPending ? <Skeleton className="h-36" /> : null}
            {onboarding.isError ? (
              <DataLoadError
                className="min-h-40 border-0 bg-transparent"
                description={t("Retry to restore the onboarding checklist.")}
                onRetry={() => void onboarding.refetch()}
                retrying={onboarding.isFetching}
                title={t("Unable to load setup progress")}
              />
            ) : null}
            {onboarding.data?.steps.map((step) => (
              <OnboardingStepItem key={step.id} step={step} />
            ))}
          </CardContent>
          <CardFooter className="mt-auto">
            <Button nativeButton={false} render={<Link to="/getting-started" />} variant="ghost">
              {t("View onboarding guide")}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Quick actions")}</CardTitle>
            <CardDescription>{t("Common tasks for this workspace.")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <QuickAction
              icon={MessageSquareTextIcon}
              label={t("Open Playground")}
              to="/playground"
            />
            <QuickAction icon={WalletCardsIcon} label={t("Recharge balance")} to="/recharge" />
            <QuickAction icon={CircleDollarSignIcon} label={t("View usage")} to="/usage" />
            <QuickAction icon={KeyRoundIcon} label={t("Manage keys")} to="/api-keys" />
            <QuickAction icon={BoxesIcon} label={t("Compare models")} to="/models" />
            <QuickAction icon={ScrollTextIcon} label={t("Inspect request logs")} to="/logs" />
            <QuickAction icon={BellRingIcon} label={t("Configure alerts")} to="/alerts" />
          </CardContent>
        </Card>
      </div>

      {!overview.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("Recent activity")}</CardTitle>
            <CardDescription>{t("Latest API activity for this account.")}</CardDescription>
            <CardAction>
              <Button nativeButton={false} render={<Link to="/logs" />} size="sm" variant="ghost">
                {t("View all")}
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Event")}</TableHead>
                  <TableHead>{t("Model")}</TableHead>
                  <TableHead>{t("Time")}</TableHead>
                  <TableHead className="text-right">{t("Status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody aria-busy={overview.isPending}>
                {overview.isPending ? <TableLoadingState colSpan={4} /> : null}
                {!overview.isPending && (overview.data?.recentActivity.length ?? 0) === 0 ? (
                  <TableEmptyState
                    action={
                      <Button nativeButton={false} render={<Link to="/playground" />} size="sm">
                        {t("Open Playground")}
                      </Button>
                    }
                    colSpan={4}
                    description={t("Send an API request to see activity here.")}
                    title={t("No recent activity")}
                  />
                ) : null}
                {overview.data?.recentActivity.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link
                        className="font-medium underline-offset-4 hover:underline"
                        search={{
                          ...dateRangeSearchPatch(range, "today"),
                          detail: item.id,
                          field: "request",
                          q: item.id,
                        }}
                        to="/logs"
                      >
                        {t(activityEventKey(item.event))}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <TableText className="max-w-56 font-mono text-xs" value={item.model} />
                    </TableCell>
                    <TableCell>
                      <TableDateTime locale={locale} timestamp={item.createdAt} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={item.status === "failed" ? "destructive" : "secondary"}>
                        {t(activityStatusKey(item.status))}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function OverviewMetricCard(props: {
  metric: { label: string; note: string; to: OverviewDestination; value: string };
}) {
  return (
    <Link
      aria-label={`${props.metric.label}: ${props.metric.value}`}
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      to={props.metric.to}
    >
      <Card className="h-full transition-colors hover:ring-primary/40">
        <CardHeader>
          <CardDescription>{props.metric.label}</CardDescription>
          <CardTitle className="text-2xl tabular-nums">{props.metric.value}</CardTitle>
          <CardAction>
            <ArrowRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          </CardAction>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">{props.metric.note}</CardContent>
      </Card>
    </Link>
  );
}

function OnboardingStepItem(props: { step: OnboardingStep }) {
  const { t } = useTranslation();
  const content = onboardingStepContent(props.step.id);

  return (
    <Item render={<Link to={content.to} />} variant="outline">
      <ItemMedia>
        <span
          className={
            props.step.complete
              ? "flex size-2 rounded-full bg-primary"
              : "flex size-2 rounded-full bg-muted-foreground"
          }
        />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{t(content.label)}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <Badge variant={props.step.complete ? "outline" : "secondary"}>
          {props.step.complete ? t("Completed") : t("Next")}
        </Badge>
        <ArrowRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}

function QuickAction(props: {
  icon: typeof MessageSquareTextIcon;
  label: string;
  to: "/playground" | "/recharge" | "/usage" | "/api-keys" | "/models" | "/logs" | "/alerts";
}) {
  const Icon = props.icon;

  return (
    <Item render={<Link to={props.to} />} variant="outline">
      <ItemMedia className="size-9 rounded-lg bg-primary/10 text-primary" variant="icon">
        <Icon aria-hidden="true" className="size-4" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{props.label}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <ArrowRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}

function onboardingStepContent(id: OnboardingStep["id"]): {
  label: string;
  to: "/api-keys" | "/recharge" | "/playground";
} {
  if (id === "create-key") return { label: "Create your first API key", to: "/api-keys" };
  if (id === "fund-account") return { label: "Add balance or redeem a code", to: "/recharge" };
  return { label: "Send a request in Playground", to: "/playground" };
}

function activityEventKey(event: ActivityRecord["event"]) {
  if (event === "chat") return "Chat completion";
  if (event === "image") return "Image generation";
  if (event === "embedding") return "Embedding request";
  if (event === "task") return "Async task";
  return "Unknown request type";
}

function activityStatusKey(status: ActivityRecord["status"]) {
  if (status === "failed") return "Failed";
  if (status === "processing") return "Processing";
  return "Succeeded";
}
