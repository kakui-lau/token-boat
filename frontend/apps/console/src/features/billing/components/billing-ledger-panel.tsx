import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDownUpIcon, CircleAlertIcon, WalletCardsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

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
import { cn } from "@token-boat/ui/lib/utils";
import { DataLoadError } from "@/components/data-load-error";
import { DataPagination } from "@/components/data-pagination";
import { TableEmptyState } from "@/components/table-empty-state";
import { TableLoadingState } from "@/components/table-loading-state";
import { TableDateTime, TableIdentifier, TableText } from "@/components/table-value";
import type { BillingLedgerListInput, DateRangeValue } from "@/data/contracts";
import { repository } from "@/data/repository";
import { formatCurrency } from "@/lib/format";
import type { BillingSearch, SearchPatch } from "@/lib/list-search";
import { BillingLedgerSheet } from "./billing-ledger-sheet";
import { billingLedgerTypeLabel, billingLedgerTypeVariant } from "../lib/billing-ledger";

type BillingLedgerPanelProps = {
  active: boolean;
  onSearchChange(patch: SearchPatch<BillingSearch>): void;
  range: DateRangeValue;
  search: BillingSearch;
};

export function BillingLedgerPanel(props: BillingLedgerPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "zh";
  const type = props.search.ledgerType ?? "all";
  const order = props.search.ledgerOrder ?? "desc";
  const page = props.search.ledgerPage ?? 1;
  const pageSize = props.search.ledgerPageSize ?? 20;
  const query = useQuery({
    enabled: props.active,
    queryKey: ["billing-ledger", { order, page, pageSize, range: props.range, type }],
    queryFn: () =>
      repository.getBillingLedgerPage({ order, page, pageSize, range: props.range, type }),
  });
  const entries = query.data?.items ?? [];
  const selectedEntry =
    props.active && props.search.ledgerDetail
      ? (entries.find((entry) => entry.id === props.search.ledgerDetail) ?? null)
      : null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("Balance activity")}</CardTitle>
          <CardDescription>
            {t("Recorded balance changes and refunds, kept separate from payment orders.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:ml-auto lg:w-fit lg:grid-cols-[180px_180px]">
            <Select
              onValueChange={(value) => {
                if (!value) return;
                const nextType = value as BillingLedgerListInput["type"];
                props.onSearchChange({
                  ledgerDetail: undefined,
                  ledgerPage: undefined,
                  ledgerType: nextType === "all" ? undefined : nextType,
                });
              }}
              value={type}
            >
              <SelectTrigger aria-label={t("Balance event type")} className="w-full">
                <SelectValue>{t(billingLedgerFilterLabel(type))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("All balance events")}</SelectItem>
                  <SelectItem value="topup">{t("Balance records")}</SelectItem>
                  <SelectItem value="refund">{t("Refunds")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => {
                if (!value) return;
                const nextOrder = value as BillingLedgerListInput["order"];
                props.onSearchChange({
                  ledgerDetail: undefined,
                  ledgerOrder: nextOrder === "desc" ? undefined : nextOrder,
                  ledgerPage: undefined,
                });
              }}
              value={order}
            >
              <SelectTrigger aria-label={t("Sort order")} className="w-full">
                <ArrowDownUpIcon aria-hidden="true" />
                <SelectValue>{t(order === "desc" ? "Newest first" : "Oldest first")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="desc">{t("Newest first")}</SelectItem>
                  <SelectItem value="asc">{t("Oldest first")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {query.isError ? (
            <DataLoadError
              className="min-h-64"
              description={t("Try refreshing the page or check the API connection.")}
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
              title={t("Unable to load balance activity")}
            />
          ) : null}
          {query.isSuccess && props.search.ledgerDetail && !selectedEntry ? (
            <Alert>
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>{t("Balance event details unavailable")}</AlertTitle>
              <AlertDescription>
                {t(
                  "The selected balance event was not found in the current account, filters, or page. No substitute event was opened.",
                )}
              </AlertDescription>
              <AlertAction>
                <Button
                  onClick={() => props.onSearchChange({ ledgerDetail: undefined })}
                  size="sm"
                  variant="outline"
                >
                  {t("Clear selection")}
                </Button>
              </AlertAction>
            </Alert>
          ) : null}
          {!query.isError ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Event ID")}</TableHead>
                      <TableHead>{t("Type")}</TableHead>
                      <TableHead>{t("Description")}</TableHead>
                      <TableHead>{t("Date")}</TableHead>
                      <TableHead>{t("Source IP")}</TableHead>
                      <TableHead className="text-right">{t("Balance change")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody aria-busy={query.isPending}>
                    {query.isPending ? <TableLoadingState colSpan={6} /> : null}
                    {query.isSuccess && entries.length === 0 ? (
                      <TableEmptyState
                        action={
                          <Button nativeButton={false} render={<Link to="/recharge" />} size="sm">
                            <WalletCardsIcon data-icon="inline-start" />
                            {t("Account recharge")}
                          </Button>
                        }
                        colSpan={6}
                        description={t(
                          type === "all"
                            ? "Recharge, redeem, or purchase a subscription to create balance activity."
                            : "Try another event category or date range.",
                        )}
                        title={t(
                          type === "all"
                            ? "No balance activity yet"
                            : "No matching balance activity",
                        )}
                      />
                    ) : null}
                    {entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Button
                            aria-label={t("View balance event {{id}}", { id: entry.id })}
                            className="h-auto p-0"
                            onClick={() => props.onSearchChange({ ledgerDetail: entry.id })}
                            variant="link"
                          >
                            <TableIdentifier value={entry.id} />
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge variant={billingLedgerTypeVariant(entry.type)}>
                            {t(billingLedgerTypeLabel(entry.type))}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <TableText
                            className="max-w-72 font-medium"
                            value={entry.content ?? t(billingLedgerTypeLabel(entry.type))}
                          />
                        </TableCell>
                        <TableCell>
                          <TableDateTime locale={locale} timestamp={entry.createdAt} />
                        </TableCell>
                        <TableCell>
                          <TableText
                            className="max-w-36 font-mono text-xs"
                            value={entry.sourceIp}
                          />
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-medium tabular-nums",
                            entry.amountUsd !== null && "text-primary",
                          )}
                          title={
                            entry.amountUsd === null
                              ? t("This event does not include a structured amount.")
                              : undefined
                          }
                        >
                          {entry.amountUsd === null
                            ? "—"
                            : `+${formatCurrency(entry.amountUsd, locale, "USD")}`}
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
                    props.onSearchChange({
                      ledgerDetail: undefined,
                      ledgerPage: value === 1 ? undefined : value,
                    })
                  }
                  onPageSizeChange={(value) =>
                    props.onSearchChange({
                      ledgerDetail: undefined,
                      ledgerPage: undefined,
                      ledgerPageSize: value === 20 ? undefined : value,
                    })
                  }
                  page={query.data?.page ?? page}
                  pageSize={query.data?.pageSize ?? pageSize}
                  total={query.data?.total ?? 0}
                />
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
      <BillingLedgerSheet
        entry={selectedEntry}
        onOpenChange={(open) => {
          if (!open) props.onSearchChange({ ledgerDetail: undefined });
        }}
      />
    </>
  );
}

function billingLedgerFilterLabel(type: BillingLedgerListInput["type"]): string {
  if (type === "topup") return "Balance records";
  if (type === "refund") return "Refunds";
  return "All balance events";
}
