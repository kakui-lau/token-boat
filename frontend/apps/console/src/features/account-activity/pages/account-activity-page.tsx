import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownUpIcon, CircleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@token-boat/ui/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
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
import { Button } from "@token-boat/ui/components/ui/button";
import { DataLoadError } from "@/components/data-load-error";
import { DataPagination } from "@/components/data-pagination";
import { DateRangePicker } from "@/components/date-range-picker";
import { PageHeader } from "@/components/page-header";
import { TableEmptyState } from "@/components/table-empty-state";
import { TableLoadingState } from "@/components/table-loading-state";
import { TableDateTime, TableIdentifier, TableText } from "@/components/table-value";
import type { AccountActivityListInput, AccountActivityType } from "@/data/contracts";
import { repository } from "@/data/repository";
import {
  type AccountActivitySearch,
  dateRangeSearchPatch,
  resolveDateRange,
  type SearchPatch,
  useControllableSearch,
} from "@/lib/list-search";
import {
  activitySummary,
  ActivityDetailsSheet,
  ActivityTypeBadge,
  loginMethodLabel,
} from "../components/activity-details-sheet";

type AccountActivityPageProps = {
  onSearchChange?: (patch: SearchPatch<AccountActivitySearch>) => void;
  search?: AccountActivitySearch;
};

export function AccountActivityPage(props: AccountActivityPageProps) {
  const { t, i18n } = useTranslation();
  const [search, updateSearch] = useControllableSearch(props.search, props.onSearchChange);
  const range = useMemo(
    () => resolveDateRange(search, "30d"),
    [search.from, search.range, search.to],
  );
  const type = search.type ?? "all";
  const order = search.order ?? "desc";
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 20;
  const query = useQuery({
    queryKey: ["account-activity", { order, page, pageSize, range, type }],
    queryFn: () => repository.getAccountActivityPage({ order, page, pageSize, range, type }),
  });
  const locale = i18n.resolvedLanguage ?? "zh";
  const activities = query.data?.items ?? [];
  const selectedActivity = search.detail
    ? (activities.find((activity) => activity.id === search.detail) ?? null)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        action={
          <DateRangePicker
            onChange={(value) =>
              updateSearch({
                ...dateRangeSearchPatch(value, "30d"),
                detail: undefined,
                page: undefined,
              })
            }
            value={range}
          />
        }
        description={t("Review sign-ins, security changes, and account operations.")}
        title={t("Account activity")}
      />

      {query.isError ? (
        <DataLoadError
          description={t("Try refreshing the page or check the API connection.")}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          title={t("Unable to load account activity")}
        />
      ) : (
        <>
          {query.data && search.detail && !selectedActivity ? (
            <Alert>
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>{t("Activity details unavailable")}</AlertTitle>
              <AlertDescription>
                {t(
                  "The selected account event was not found in the current account, filters, or page. No substitute event was opened.",
                )}
              </AlertDescription>
              <AlertAction>
                <Button
                  onClick={() => updateSearch({ detail: undefined })}
                  size="sm"
                  variant="outline"
                >
                  {t("Clear selection")}
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t("Activity history")}</CardTitle>
              <CardDescription>
                {t("Account events are separated from API request and billing logs.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:ml-auto lg:w-fit lg:grid-cols-[180px_180px]">
                <Select
                  onValueChange={(value) => {
                    if (!value) return;
                    const nextType = value as AccountActivityListInput["type"];
                    updateSearch({
                      detail: undefined,
                      page: undefined,
                      type: nextType === "all" ? undefined : nextType,
                    });
                  }}
                  value={type}
                >
                  <SelectTrigger aria-label={t("Activity category")} className="w-full">
                    <SelectValue>{t(activityFilterLabel(type))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">{t("All activity")}</SelectItem>
                      <SelectItem value="login">{t("Sign-ins")}</SelectItem>
                      <SelectItem value="management">{t("Account operations")}</SelectItem>
                      <SelectItem value="system">{t("System events")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Select
                  onValueChange={(value) => {
                    if (!value) return;
                    const nextOrder = value as AccountActivityListInput["order"];
                    updateSearch({
                      detail: undefined,
                      order: nextOrder === "desc" ? undefined : nextOrder,
                      page: undefined,
                    });
                  }}
                  value={order}
                >
                  <SelectTrigger aria-label={t("Sort order")} className="w-full">
                    <ArrowDownUpIcon aria-hidden="true" />
                    <SelectValue>
                      {t(order === "desc" ? "Newest first" : "Oldest first")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="desc">{t("Newest first")}</SelectItem>
                      <SelectItem value="asc">{t("Oldest first")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-4">
                <div className="rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("Time")}</TableHead>
                        <TableHead>{t("Category")}</TableHead>
                        <TableHead>{t("Activity")}</TableHead>
                        <TableHead>{t("Source IP")}</TableHead>
                        <TableHead>{t("Login method")}</TableHead>
                        <TableHead>{t("Event ID")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody aria-busy={query.isPending}>
                      {query.isPending ? <TableLoadingState colSpan={6} /> : null}
                      {!query.isPending && activities.length === 0 ? (
                        <TableEmptyState
                          colSpan={6}
                          description={t("Try another activity category or date range.")}
                          title={t("No matching account activity")}
                        />
                      ) : null}
                      {activities.map((activity) => (
                        <TableRow key={activity.id}>
                          <TableCell>
                            <TableDateTime locale={locale} timestamp={activity.createdAt} />
                          </TableCell>
                          <TableCell>
                            <ActivityTypeBadge type={activity.type} />
                          </TableCell>
                          <TableCell>
                            <Button
                              className="h-auto max-w-72 justify-start p-0 text-left"
                              onClick={() => updateSearch({ detail: activity.id })}
                              variant="link"
                            >
                              <TableText value={activitySummary(activity, t)} />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <TableText
                              className="max-w-36 font-mono text-xs"
                              value={activity.sourceIp}
                            />
                          </TableCell>
                          <TableCell>
                            <TableText value={loginMethodLabel(activity.loginMethod, t)} />
                          </TableCell>
                          <TableCell>
                            {activity.eventId ? <TableIdentifier value={activity.eventId} /> : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {query.isPending ? (
                  <Skeleton className="h-8 w-full max-w-lg self-end" />
                ) : (
                  <DataPagination
                    disabled={query.isFetching}
                    onPageChange={(value) =>
                      updateSearch({
                        detail: undefined,
                        page: value === 1 ? undefined : value,
                      })
                    }
                    onPageSizeChange={(value) =>
                      updateSearch({
                        detail: undefined,
                        page: undefined,
                        pageSize: value === 20 ? undefined : value,
                      })
                    }
                    page={query.data?.page ?? page}
                    pageSize={query.data?.pageSize ?? pageSize}
                    total={query.data?.total ?? 0}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <ActivityDetailsSheet
            activity={selectedActivity}
            onOpenChange={(open) => !open && updateSearch({ detail: undefined })}
          />
        </>
      )}
    </div>
  );
}

function activityFilterLabel(type: "all" | AccountActivityType): string {
  if (type === "login") return "Sign-ins";
  if (type === "management") return "Account operations";
  if (type === "system") return "System events";
  return "All activity";
}
