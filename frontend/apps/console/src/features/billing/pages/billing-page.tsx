import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownUpIcon,
  CheckIcon,
  CircleAlertIcon,
  GiftIcon,
  LoaderCircleIcon,
  PackageOpenIcon,
  SearchIcon,
  WalletCardsIcon,
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
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@token-boat/ui/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@token-boat/ui/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@token-boat/ui/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { DataLoadError } from "@/components/data-load-error";
import { DateRangePicker } from "@/components/date-range-picker";
import { DataPagination } from "@/components/data-pagination";
import { TableEmptyState } from "@/components/table-empty-state";
import { TableLoadingState } from "@/components/table-loading-state";
import { TableDateTime, TableIdentifier, TableText } from "@/components/table-value";
import { repository } from "@/data/repository";
import type { BillingTransactionListInput, SubscriptionPlan } from "@/data/contracts";
import { formatCurrency } from "@/lib/format";
import { cn } from "@token-boat/ui/lib/utils";
import {
  type BillingSearch,
  dateRangeSearchPatch,
  resolveDateRange,
  type SearchPatch,
  useControllableSearch,
} from "@/lib/list-search";
import { SubscriptionPurchaseDialog } from "../components/subscription-purchase-dialog";
import { BillingLedgerPanel } from "../components/billing-ledger-panel";
import { BillingTransactionSheet } from "../components/billing-transaction-sheet";
import {
  billingTransactionStatusLabel,
  billingTransactionStatusVariant,
  billingTransactionTypeLabel,
} from "../lib/billing-transaction";
import { invalidateBillingQueries } from "../lib/invalidate-billing-queries";

type BillingPageProps = {
  onSearchChange?: (patch: SearchPatch<BillingSearch>) => void;
  search?: BillingSearch;
};

export function BillingPage(props: BillingPageProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [code, setCode] = useState("");
  const [search, updateSearch] = useControllableSearch(props.search, props.onSearchChange);
  const range = useMemo(
    () => resolveDateRange(search, "30d"),
    [search.from, search.range, search.to],
  );
  const keyword = search.q ?? "";
  const transactionStatus = search.status ?? "all";
  const transactionType = search.type ?? "all";
  const order = search.order ?? "desc";
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 20;
  const tab = search.tab ?? "history";
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const query = useQuery({ queryKey: ["billing"], queryFn: () => repository.getBilling() });
  const transactionsQuery = useQuery({
    queryKey: [
      "billing-transactions",
      { keyword, order, page, pageSize, range, transactionStatus, transactionType },
    ],
    queryFn: () =>
      repository.getBillingTransactionsPage({
        keyword,
        order,
        page,
        pageSize,
        range,
        status: transactionStatus,
        type: transactionType,
      }),
  });
  const redeem = useMutation({
    mutationFn: repository.redeemCode,
    onSuccess: (data) => {
      queryClient.setQueryData(["billing"], data);
      setRedeemOpen(false);
      setCode("");
      toast.success(t("Code redeemed"));
      void invalidateBillingQueries(queryClient);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Unable to redeem code")),
  });
  const locale = i18n.resolvedLanguage ?? "en";
  const currency = query.data?.currency ?? null;
  const plans = query.data?.plans ?? [];
  const visibleTransactions = transactionsQuery.data?.items ?? [];
  const selectedTransaction =
    tab === "history" && search.detail
      ? (visibleTransactions.find((transaction) => transaction.id === search.detail) ?? null)
      : null;
  let selectedSpend = 0;
  for (const transaction of visibleTransactions) {
    if (transaction.amount < 0) selectedSpend += Math.abs(transaction.amount);
  }
  let selectedSpendValue: ReactNode = "—";
  if (transactionsQuery.isPending) {
    selectedSpendValue = <Skeleton className="h-9 w-28" />;
  } else if (!transactionsQuery.isError && currency !== null) {
    selectedSpendValue = formatCurrency(selectedSpend, locale, currency);
  }
  let plansContent: ReactNode;
  if (query.isPending) {
    plansContent = (
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton className="h-64" key={index} />
        ))}
      </div>
    );
  } else if (query.isError) {
    plansContent = (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("Unable to load subscription plans")}</EmptyTitle>
          <EmptyDescription>
            {t("Retry the billing summary to load the available plans.")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else if (plans.length === 0) {
    plansContent = (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageOpenIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("No subscription plans available")}</EmptyTitle>
          <EmptyDescription>
            {t(
              "No plans are currently configured for your account group. You can continue with pay-as-you-go recharge.",
            )}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link to="/recharge" />} size="sm" variant="outline">
            <WalletCardsIcon data-icon="inline-start" />
            {t("Account recharge")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    plansContent = (
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card className={plan.current ? "border-primary" : undefined} key={plan.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{plan.name}</CardTitle>
                {plan.current && <Badge>{t("Current plan")}</Badge>}
              </div>
              <CardDescription>
                <span className="text-2xl font-semibold text-foreground">
                  {formatCurrency(plan.price, locale, plan.currency)}
                </span>{" "}
                {plan.durationUnit === "custom"
                  ? t("Custom duration")
                  : t("per {{count}} {{unit}}", {
                      count: plan.durationValue,
                      unit: t(
                        plan.durationValue === 1 ? plan.durationUnit : `${plan.durationUnit}s`,
                      ),
                    })}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="text-sm text-muted-foreground">
                {plan.unlimitedQuota
                  ? t("Unlimited usage quota")
                  : t("{{amount}} usage quota", {
                      amount: formatCurrency(plan.quota, locale, "USD"),
                    })}
              </div>
              {plan.features.map((feature) => (
                <div className="flex items-center gap-2 text-sm" key={feature}>
                  <CheckIcon className="size-4 text-primary" />
                  {feature}
                </div>
              ))}
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                disabled={
                  plan.paymentMethods.length === 0 ||
                  (plan.purchaseLimit > 0 && plan.purchaseCount >= plan.purchaseLimit)
                }
                onClick={() => setSelectedPlan(plan)}
                variant={plan.current ? "outline" : "default"}
              >
                {plan.current ? t("Purchase again") : t("Choose plan")}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("Billing and subscriptions")}
        description={t("Manage balance, account recharge, payment orders, and subscriptions.")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker
              onChange={(value) => {
                updateSearch({
                  ...dateRangeSearchPatch(value, "30d"),
                  detail: undefined,
                  ledgerDetail: undefined,
                  ledgerPage: undefined,
                  page: undefined,
                });
              }}
              value={range}
            />
            <Button nativeButton={false} render={<Link to="/recharge" />}>
              <WalletCardsIcon data-icon="inline-start" />
              {t("Account recharge")}
            </Button>
            <Dialog
              open={redeemOpen}
              onOpenChange={(open) => {
                if (!redeem.isPending) setRedeemOpen(open);
              }}
            >
              <DialogTrigger render={<Button variant="outline" />}>
                <GiftIcon data-icon="inline-start" />
                {t("Redeem code")}
              </DialogTrigger>
              <DialogContent closeLabel={t("Close")}>
                <DialogHeader>
                  <DialogTitle>{t("Redeem a code")}</DialogTitle>
                  <DialogDescription>
                    {t("Apply a prepaid code to your account balance.")}
                  </DialogDescription>
                </DialogHeader>
                <Field>
                  <FieldLabel htmlFor="redeem-code">{t("Redemption code")}</FieldLabel>
                  <Input
                    id="redeem-code"
                    autoComplete="off"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                  <FieldDescription>
                    {repository.mode === "demo" && t("Demo code: TOKEN-BOAT-DEMO")}
                  </FieldDescription>
                </Field>
                <DialogFooter>
                  <Button
                    disabled={!code.trim() || redeem.isPending}
                    onClick={() => redeem.mutate(code.trim())}
                  >
                    {redeem.isPending && (
                      <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                    )}
                    {t("Redeem")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {query.isPending ? (
          Array.from({ length: 3 }).map((_, index) => <Skeleton className="h-32" key={index} />)
        ) : query.isError ? (
          <DataLoadError
            className="min-h-32 sm:col-span-3"
            description={t("Try refreshing the page or check the API connection.")}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title={t("Unable to load billing summary")}
          />
        ) : (
          <>
            <Card className="sm:col-span-1">
              <CardHeader>
                <CardDescription>{t("Available balance")}</CardDescription>
                <CardTitle className="text-3xl">
                  {formatCurrency(query.data.balance, locale, query.data.currency)}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
                <WalletCardsIcon className="size-4" />
                {t("Ready for API usage")}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>{t("Charges on this page")}</CardDescription>
                <CardTitle className="text-3xl">{selectedSpendValue}</CardTitle>
              </CardHeader>
              {transactionsQuery.isError ? (
                <CardContent className="text-xs text-muted-foreground">
                  {t("Payment order data unavailable")}
                </CardContent>
              ) : null}
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>{t("Pending amount")}</CardDescription>
                <CardTitle className="text-3xl">
                  {query.data?.pendingAmount == null
                    ? "—"
                    : formatCurrency(query.data.pendingAmount, locale, query.data.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
          </>
        )}
      </div>
      <Tabs
        onValueChange={(value) =>
          updateSearch({
            detail: undefined,
            ledgerDetail: undefined,
            tab: value === "history" ? undefined : (value as "ledger" | "plans"),
          })
        }
        value={tab}
      >
        <TabsList>
          <TabsTrigger value="history">{t("Payment history")}</TabsTrigger>
          <TabsTrigger value="ledger">{t("Balance activity")}</TabsTrigger>
          <TabsTrigger value="plans">{t("Plans")}</TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>{t("Payment orders")}</CardTitle>
              <CardDescription>
                {t("Top-up and subscription payment orders returned by the billing service.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <form
                className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_160px_160px_180px_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  const nextKeyword = String(formData.get("q") ?? "").trim();
                  updateSearch({
                    detail: undefined,
                    page: undefined,
                    q: nextKeyword || undefined,
                  });
                }}
              >
                <InputGroup>
                  <InputGroupAddon>
                    <SearchIcon aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label={t("Search transactions")}
                    defaultValue={keyword}
                    key={keyword}
                    name="q"
                    placeholder={t("Search order ID")}
                  />
                </InputGroup>
                <Select
                  onValueChange={(value) => {
                    if (!value) return;
                    const nextType = value as BillingTransactionListInput["type"];
                    updateSearch({
                      detail: undefined,
                      page: undefined,
                      type: nextType === "all" ? undefined : nextType,
                    });
                  }}
                  value={transactionType}
                >
                  <SelectTrigger aria-label={t("Transaction type")} className="w-full">
                    <SelectValue>{t(transactionTypeLabel(transactionType))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">{t("All types")}</SelectItem>
                      <SelectItem value="topup">{t("Top-up")}</SelectItem>
                      <SelectItem value="subscription">{t("Subscription")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Select
                  onValueChange={(value) => {
                    if (!value) return;
                    const nextStatus = value as BillingTransactionListInput["status"];
                    updateSearch({
                      detail: undefined,
                      page: undefined,
                      status: nextStatus === "all" ? undefined : nextStatus,
                    });
                  }}
                  value={transactionStatus}
                >
                  <SelectTrigger aria-label={t("Transaction status")} className="w-full">
                    <SelectValue>{t(transactionStatusLabel(transactionStatus))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">{t("All statuses")}</SelectItem>
                      <SelectItem value="completed">{t("Completed")}</SelectItem>
                      <SelectItem value="pending">{t("Pending")}</SelectItem>
                      <SelectItem value="failed">{t("Failed")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Select
                  onValueChange={(value) => {
                    if (!value) return;
                    const nextOrder = value as BillingTransactionListInput["order"];
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
                <Button type="submit" variant="outline">
                  {t("Search")}
                </Button>
              </form>
              {transactionsQuery.isError ? (
                <DataLoadError
                  className="min-h-64"
                  description={t("Try refreshing the page or check the API connection.")}
                  onRetry={() => void transactionsQuery.refetch()}
                  retrying={transactionsQuery.isFetching}
                  title={t("Unable to load payment orders")}
                />
              ) : null}
              {transactionsQuery.isSuccess && search.detail && !selectedTransaction ? (
                <Alert>
                  <CircleAlertIcon aria-hidden="true" />
                  <AlertTitle>{t("Payment order details unavailable")}</AlertTitle>
                  <AlertDescription>
                    {t(
                      "The selected payment order was not found in the current account, filters, or page. No substitute order was opened.",
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
              {!transactionsQuery.isError ? (
                <div className="flex flex-col gap-4">
                  <div className="rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("Order ID")}</TableHead>
                          <TableHead>{t("Description")}</TableHead>
                          <TableHead>{t("Type")}</TableHead>
                          <TableHead>{t("Date")}</TableHead>
                          <TableHead>{t("Status")}</TableHead>
                          <TableHead className="text-right">{t("Amount")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody aria-busy={transactionsQuery.isPending}>
                        {transactionsQuery.isPending ? <TableLoadingState colSpan={6} /> : null}
                        {transactionsQuery.isSuccess && visibleTransactions.length === 0 ? (
                          <TableEmptyState
                            action={
                              <Button
                                nativeButton={false}
                                render={<Link to="/recharge" />}
                                size="sm"
                              >
                                <WalletCardsIcon data-icon="inline-start" />
                                {t("Account recharge")}
                              </Button>
                            }
                            colSpan={6}
                            description={t(
                              keyword || transactionStatus !== "all" || transactionType !== "all"
                                ? "Try another order number, type, status, or date range."
                                : "Recharge or subscribe to create a payment order.",
                            )}
                            title={t(
                              keyword || transactionStatus !== "all" || transactionType !== "all"
                                ? "No matching transactions"
                                : "No transactions yet",
                            )}
                          />
                        ) : null}
                        {visibleTransactions.map((transaction) => (
                          <TableRow key={transaction.id}>
                            <TableCell>
                              <Button
                                aria-label={t("View payment order {{id}}", { id: transaction.id })}
                                className="h-auto p-0"
                                onClick={() => updateSearch({ detail: transaction.id })}
                                variant="link"
                              >
                                <TableIdentifier value={transaction.id} />
                              </Button>
                            </TableCell>
                            <TableCell>
                              <TableText
                                className="max-w-64 font-medium"
                                value={transaction.description}
                              />
                            </TableCell>
                            <TableCell>
                              {t(billingTransactionTypeLabel(transaction.type))}
                            </TableCell>
                            <TableCell>
                              <TableDateTime locale={locale} timestamp={transaction.createdAt} />
                            </TableCell>
                            <TableCell>
                              <Badge variant={billingTransactionStatusVariant(transaction.status)}>
                                {t(billingTransactionStatusLabel(transaction.status))}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right tabular-nums",
                                transaction.amount >= 0 && "text-primary",
                              )}
                            >
                              {currency === null
                                ? "—"
                                : formatCurrency(transaction.amount, locale, currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {transactionsQuery.isPending ? (
                    <Skeleton className="h-8 w-full max-w-lg self-end" />
                  ) : (
                    <DataPagination
                      disabled={transactionsQuery.isFetching}
                      onPageChange={(value) =>
                        updateSearch({
                          detail: undefined,
                          page: value === 1 ? undefined : value,
                        })
                      }
                      onPageSizeChange={(value) => {
                        updateSearch({
                          detail: undefined,
                          page: undefined,
                          pageSize: value === 20 ? undefined : value,
                        });
                      }}
                      page={transactionsQuery.data?.page ?? page}
                      pageSize={transactionsQuery.data?.pageSize ?? pageSize}
                      total={transactionsQuery.data?.total ?? 0}
                    />
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ledger">
          <BillingLedgerPanel
            active={tab === "ledger"}
            onSearchChange={updateSearch}
            range={range}
            search={search}
          />
        </TabsContent>
        <TabsContent value="plans">{plansContent}</TabsContent>
      </Tabs>
      {query.data ? (
        <SubscriptionPurchaseDialog
          balance={query.data.balance}
          locale={locale}
          onOpenChange={(open) => {
            if (!open) setSelectedPlan(null);
          }}
          open={Boolean(selectedPlan)}
          plan={selectedPlan}
        />
      ) : null}
      <BillingTransactionSheet
        currency={currency}
        onOpenChange={(open) => {
          if (!open) updateSearch({ detail: undefined });
        }}
        transaction={selectedTransaction}
      />
    </div>
  );
}

function transactionTypeLabel(type: BillingTransactionListInput["type"]): string {
  if (type === "topup") return "Top-up";
  if (type === "subscription") return "Subscription";
  return "All types";
}

function transactionStatusLabel(status: BillingTransactionListInput["status"]): string {
  if (status === "completed") return "Completed";
  if (status === "pending") return "Pending";
  if (status === "failed") return "Failed";
  return "All statuses";
}
