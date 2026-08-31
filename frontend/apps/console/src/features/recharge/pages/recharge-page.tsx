import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeDollarSignIcon,
  CheckCircle2Icon,
  CircleXIcon,
  Clock3Icon,
  CreditCardIcon,
  ExternalLinkIcon,
  GiftIcon,
  Globe2Icon,
  HistoryIcon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
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
  CardAction,
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
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@token-boat/ui/components/ui/item";
import { Separator } from "@token-boat/ui/components/ui/separator";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@token-boat/ui/components/ui/toggle-group";
import { DataLoadError } from "@/components/data-load-error";
import { PageHeader } from "@/components/page-header";
import type { CreateRechargeCheckoutInput, RechargeConfiguration } from "@/data/contracts";
import { repository } from "@/data/repository";
import { formatCurrency, formatNumber } from "@/lib/format";
import { clearPendingPayment, continueToCheckout } from "@/lib/payment-checkout";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaymentConfirmation } from "../hooks/use-payment-confirmation";
import { invalidateBillingQueries } from "@/features/billing/lib/invalidate-billing-queries";

type RechargePageProps = {
  paymentStatus?: "cancelled" | "pending" | "success";
};

type CheckoutIntent = {
  creditLabel: string;
  input: CreateRechargeCheckoutInput;
  paymentLabel: string;
  payableLabel: string;
};

function formatRechargeAmount(
  amount: number,
  configuration: RechargeConfiguration,
  locale: string,
  tokensLabel: string,
) {
  if (configuration.displayType === "TOKENS") {
    return `${formatNumber(amount, locale, { maximumFractionDigits: 0 })} ${tokensLabel}`;
  }
  return formatCurrency(amount, locale, configuration.displayType);
}

function formatRechargeBalance(
  usdBalance: number,
  configuration: RechargeConfiguration,
  locale: string,
  tokensLabel: string,
) {
  if (configuration.displayType === "TOKENS") {
    return `${formatNumber(usdBalance * configuration.quotaPerUnit, locale, {
      maximumFractionDigits: 0,
    })} ${tokensLabel}`;
  }
  const displayBalance =
    configuration.displayType === "CNY" ? usdBalance * configuration.usdExchangeRate : usdBalance;
  return formatCurrency(displayBalance, locale, configuration.displayType);
}

function paymentMethodIcon(type: string) {
  if (type === "stripe") return CreditCardIcon;
  if (type === "alipay" || type === "wxpay") return SmartphoneIcon;
  if (type === "waffo" || type === "waffo_pancake") return Globe2Icon;
  return WalletCardsIcon;
}

export function RechargePage({ paymentStatus }: RechargePageProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const locale = i18n.resolvedLanguage ?? "zh";
  const [amountValue, setAmountValue] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [redeemCode, setRedeemCode] = useState("");
  const [checkoutIntent, setCheckoutIntent] = useState<CheckoutIntent | null>(null);
  const paymentConfirmation = usePaymentConfirmation(
    paymentStatus === "pending" || paymentStatus === "success",
  );

  const configurationQuery = useQuery({
    queryKey: ["recharge-configuration"],
    queryFn: () => repository.getRechargeConfiguration(),
  });
  const billingQuery = useQuery({ queryKey: ["billing"], queryFn: () => repository.getBilling() });
  const configuration = configurationQuery.data;

  useEffect(() => {
    if (!configuration) return;
    const initialAmount = configuration.amountOptions[0];
    if (!amountValue && initialAmount) {
      setAmountValue(String(initialAmount));
      setSelectedPreset(String(initialAmount));
    }
    if (!configuration.paymentMethods.some((method) => method.id === paymentMethodId)) {
      setPaymentMethodId(configuration.paymentMethods[0]?.id ?? "");
    }
  }, [amountValue, configuration, paymentMethodId]);

  useEffect(() => {
    if (paymentStatus === "cancelled") clearPendingPayment();
  }, [paymentStatus]);

  const amount = Number(amountValue);
  const debouncedAmount = useDebouncedValue(amount, 300);
  const paymentMethod = configuration?.paymentMethods.find(
    (method) => method.id === paymentMethodId,
  );
  const amountIsValid =
    Boolean(paymentMethod) &&
    Number.isSafeInteger(amount) &&
    amount >= (paymentMethod?.minAmount ?? Number.POSITIVE_INFINITY);
  const amountInvalid =
    amountValue.length > 0 &&
    Boolean(paymentMethod) &&
    (!Number.isSafeInteger(amount) ||
      amount < (paymentMethod?.minAmount ?? Number.POSITIVE_INFINITY));
  const debouncedAmountIsValid =
    Boolean(paymentMethod) &&
    Number.isSafeInteger(debouncedAmount) &&
    debouncedAmount >= (paymentMethod?.minAmount ?? Number.POSITIVE_INFINITY);
  const quoteQuery = useQuery({
    queryKey: [
      "recharge-quote",
      debouncedAmount,
      paymentMethod?.id,
      configuration?.paymentCurrency,
    ],
    queryFn: () => {
      if (!configuration || !paymentMethod) {
        throw new Error("Recharge configuration is unavailable");
      }
      return repository.getRechargeQuote({
        amount: debouncedAmount,
        currency: configuration.paymentCurrency,
        paymentMethod,
      });
    },
    enabled: Boolean(configuration && paymentMethod && debouncedAmountIsValid),
    retry: false,
    staleTime: 30_000,
  });
  const quote = debouncedAmount === amount ? quoteQuery.data : undefined;
  const quoteIsLoading = amountIsValid && (debouncedAmount !== amount || quoteQuery.isFetching);
  const quoteUnavailable =
    amountIsValid && debouncedAmount === amount && quoteQuery.isError && !quoteQuery.isFetching;
  const discountMultiplier = configuration?.discounts[String(amount)] ?? 1;
  const discountPercent = Math.max(0, Math.round((1 - discountMultiplier) * 100));

  const checkout = useMutation({
    mutationFn: (input: CreateRechargeCheckoutInput) => repository.createRechargeCheckout(input),
    onSuccess: (result) => {
      if (result.kind === "demo") {
        setCheckoutIntent(null);
        toast.success(t("Demo top-up completed"));
        void invalidateBillingQueries(queryClient);
        return;
      }
      toast.success(t("Redirecting to the secure payment page"));
      continueToCheckout(result, { kind: "topup" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Unable to create payment order")),
  });
  const redeem = useMutation({
    mutationFn: repository.redeemCode,
    onSuccess: (data) => {
      queryClient.setQueryData(["billing"], data);
      setRedeemCode("");
      toast.success(t("Code redeemed"));
      void invalidateBillingQueries(queryClient);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Unable to redeem code")),
  });

  const balanceLabel =
    configuration && billingQuery.data
      ? formatRechargeBalance(billingQuery.data.balance, configuration, locale, t("Tokens"))
      : null;

  const selectPreset = (value: string) => {
    if (!value) return;
    setSelectedPreset(value);
    setAmountValue(value);
  };
  const updateCustomAmount = (value: string) => {
    const normalized = value.replaceAll(/\D/g, "").replace(/^0+(?=\d)/, "");
    setSelectedPreset("");
    setAmountValue(normalized);
  };
  const requestAmountCheckout = () => {
    if (!configuration || !paymentMethod || !quote) return;
    setCheckoutIntent({
      creditLabel: formatRechargeAmount(amount, configuration, locale, t("Tokens")),
      input: { amount, paymentMethod },
      paymentLabel: paymentMethod.name,
      payableLabel: formatCurrency(quote.amount, locale, quote.currency),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("Recharge center")}
        description={t(
          "Add prepaid balance for API usage, choose a payment channel, or redeem a code.",
        )}
        action={
          <Button nativeButton={false} render={<Link to="/billing" />} variant="outline">
            <HistoryIcon data-icon="inline-start" />
            {t("Order history")}
          </Button>
        }
      />

      {paymentStatus && (
        <Alert variant={paymentConfirmation.state === "failed" ? "destructive" : "default"}>
          <PaymentReturnIcon paymentStatus={paymentStatus} state={paymentConfirmation.state} />
          <AlertTitle>{t(paymentReturnTitle(paymentStatus, paymentConfirmation.state))}</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{t(paymentReturnDescription(paymentStatus, paymentConfirmation.state))}</span>
              {paymentConfirmation.state === "timeout" && (
                <Button onClick={paymentConfirmation.retry} size="sm" variant="outline">
                  {t("Check again")}
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.65fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>{t("Add funds")}</CardTitle>
              <CardDescription>
                {t("Select the balance amount and payment method.")}
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">{t("Pay as you go")}</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-7">
              {configurationQuery.isPending ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Skeleton className="h-72" />
                  <Skeleton className="h-72" />
                </div>
              ) : configurationQuery.isError ? (
                <DataLoadError
                  className="min-h-72 border-0"
                  description={t("Refresh the page or contact the platform operator.")}
                  onRetry={() => void configurationQuery.refetch()}
                  retrying={configurationQuery.isFetching}
                  title={t("Unable to load recharge settings")}
                />
              ) : configuration ? (
                <div className="grid gap-8 lg:grid-cols-2">
                  <div className="flex flex-col gap-6 lg:border-r lg:pr-8">
                    <div className="flex items-center gap-3">
                      <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        1
                      </span>
                      <div>
                        <div className="font-medium">{t("Recharge amount")}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("The credited balance can be used by every API key in this account.")}
                        </div>
                      </div>
                    </div>

                    <ToggleGroup
                      aria-label={t("Preset recharge amounts")}
                      className="grid w-full grid-cols-2"
                      onValueChange={(values) => selectPreset(values[0] ?? "")}
                      value={selectedPreset ? [selectedPreset] : []}
                      variant="outline"
                    >
                      {configuration.amountOptions.map((option) => {
                        const optionDiscount = configuration.discounts[String(option)] ?? 1;
                        const optionDiscountPercent = Math.max(
                          0,
                          Math.round((1 - optionDiscount) * 100),
                        );
                        return (
                          <ToggleGroupItem
                            className="relative h-auto min-h-16 w-full flex-col items-start px-3 py-2.5"
                            key={option}
                            value={String(option)}
                          >
                            <span className="font-semibold tabular-nums">
                              {formatRechargeAmount(option, configuration, locale, t("Tokens"))}
                            </span>
                            {optionDiscountPercent > 0 && (
                              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                {t("Save {{percent}}%", { percent: optionDiscountPercent })}
                              </span>
                            )}
                          </ToggleGroupItem>
                        );
                      })}
                    </ToggleGroup>

                    <Field data-invalid={amountInvalid || undefined}>
                      <FieldLabel htmlFor="custom-recharge-amount">{t("Custom amount")}</FieldLabel>
                      <Input
                        aria-invalid={amountInvalid || undefined}
                        id="custom-recharge-amount"
                        inputMode="numeric"
                        min={paymentMethod?.minAmount}
                        onChange={(event) => updateCustomAmount(event.target.value)}
                        placeholder={t("Enter an integer amount")}
                        type="text"
                        value={amountValue}
                      />
                      <FieldDescription>
                        {amountInvalid && paymentMethod
                          ? t("Enter a whole-number amount of at least {{amount}}.", {
                              amount: formatRechargeAmount(
                                paymentMethod.minAmount,
                                configuration,
                                locale,
                                t("Tokens"),
                              ),
                            })
                          : paymentMethod
                            ? t("Minimum for this method: {{amount}}", {
                                amount: formatRechargeAmount(
                                  paymentMethod.minAmount,
                                  configuration,
                                  locale,
                                  t("Tokens"),
                                ),
                              })
                            : t("Choose a payment method to see its minimum amount.")}
                      </FieldDescription>
                    </Field>
                  </div>

                  <div className="flex flex-col gap-6">
                    <div className="flex items-center gap-3">
                      <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        2
                      </span>
                      <div>
                        <div className="font-medium">{t("Payment method")}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("Available methods are controlled by the platform payment settings.")}
                        </div>
                      </div>
                    </div>

                    {configuration.paymentMethods.length > 0 ? (
                      <ToggleGroup
                        aria-label={t("Payment method")}
                        className="grid w-full grid-cols-1"
                        onValueChange={(values) => {
                          const value = values[0];
                          if (value) setPaymentMethodId(value);
                        }}
                        value={paymentMethodId ? [paymentMethodId] : []}
                        variant="outline"
                      >
                        {configuration.paymentMethods.map((method) => {
                          const Icon = paymentMethodIcon(method.type);
                          return (
                            <ToggleGroupItem
                              className="h-auto min-h-14 w-full justify-start gap-3 px-3 py-2.5 text-left"
                              key={method.id}
                              value={method.id}
                            >
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                                <Icon aria-hidden="true" className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{method.name}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {t("Minimum {{amount}}", {
                                    amount: formatRechargeAmount(
                                      method.minAmount,
                                      configuration,
                                      locale,
                                      t("Tokens"),
                                    ),
                                  })}
                                </span>
                              </span>
                            </ToggleGroupItem>
                          );
                        })}
                      </ToggleGroup>
                    ) : (
                      <Empty className="min-h-44 border">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <CreditCardIcon />
                          </EmptyMedia>
                          <EmptyTitle>{t("Online payment is unavailable")}</EmptyTitle>
                          <EmptyDescription>
                            {t("Use a redemption code or contact the platform operator.")}
                          </EmptyDescription>
                        </EmptyHeader>
                        {configuration.externalTopupUrl && (
                          <EmptyContent>
                            <Button
                              nativeButton={false}
                              render={
                                <a
                                  href={configuration.externalTopupUrl}
                                  rel="noreferrer"
                                  target="_blank"
                                />
                              }
                              variant="outline"
                            >
                              <ExternalLinkIcon data-icon="inline-start" />
                              {t("Open recharge store")}
                            </Button>
                          </EmptyContent>
                        )}
                      </Empty>
                    )}

                    <div className="mt-auto rounded-xl border bg-muted/35 p-4">
                      <dl className="flex flex-col gap-3 text-sm">
                        <div className="flex items-center justify-between gap-4">
                          <dt className="text-muted-foreground">{t("Balance credited")}</dt>
                          <dd className="font-medium tabular-nums">
                            {configuration && amount > 0
                              ? formatRechargeAmount(amount, configuration, locale, t("Tokens"))
                              : "—"}
                          </dd>
                        </div>
                        {discountPercent > 0 && (
                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-muted-foreground">{t("Recharge discount")}</dt>
                            <dd className="font-medium text-emerald-600 dark:text-emerald-400">
                              {t("Save {{percent}}%", { percent: discountPercent })}
                            </dd>
                          </div>
                        )}
                        <Separator />
                        <div className="flex items-end justify-between gap-4">
                          <dt className="font-medium">{t("Amount to pay")}</dt>
                          <dd className="text-2xl font-semibold tracking-tight tabular-nums">
                            {quoteIsLoading ? (
                              <Skeleton className="h-8 w-28" />
                            ) : quote ? (
                              formatCurrency(quote.amount, locale, quote.currency)
                            ) : (
                              "—"
                            )}
                          </dd>
                        </div>
                      </dl>
                      {quoteUnavailable ? (
                        <Alert className="mt-4" variant="destructive">
                          <CircleXIcon aria-hidden="true" />
                          <AlertTitle>{t("Unable to calculate payment amount")}</AlertTitle>
                          <AlertDescription>
                            {t("No payment order can be created until the quote is available.")}
                          </AlertDescription>
                          <AlertAction>
                            <Button
                              onClick={() => void quoteQuery.refetch()}
                              size="sm"
                              variant="outline"
                            >
                              {t("Try again")}
                            </Button>
                          </AlertAction>
                        </Alert>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <Empty className="min-h-72 border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <CreditCardIcon />
                    </EmptyMedia>
                    <EmptyTitle>{t("Unable to load recharge settings")}</EmptyTitle>
                    <EmptyDescription>
                      {t("Refresh the page or contact the platform operator.")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
            <CardFooter className="justify-between gap-4">
              <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                <ShieldCheckIcon className="size-4 text-primary" />
                {t("The payment is completed on the provider's secure checkout page.")}
              </div>
              <Button
                className="ml-auto min-w-36"
                disabled={
                  !configuration?.complianceConfirmed || !amountIsValid || !quote || quoteIsLoading
                }
                onClick={requestAmountCheckout}
                size="lg"
              >
                <LockKeyholeIcon data-icon="inline-start" />
                {t("Continue to payment")}
              </Button>
            </CardFooter>
          </Card>

          {configuration && configuration.products.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("Fixed recharge packages")}</CardTitle>
                <CardDescription>
                  {t("Choose a provider package with a fixed price and credited balance.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {configuration.products.map((product) => (
                  <Item key={product.id} variant="outline">
                    <ItemMedia variant="icon">
                      <BadgeDollarSignIcon />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{product.name}</ItemTitle>
                      <ItemDescription>
                        {t("Credits {{amount}}", {
                          amount: formatRechargeBalance(
                            product.quota,
                            configuration,
                            locale,
                            t("Tokens"),
                          ),
                        })}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        onClick={() =>
                          setCheckoutIntent({
                            creditLabel: formatRechargeBalance(
                              product.quota,
                              configuration,
                              locale,
                              t("Tokens"),
                            ),
                            input: { amount: product.quota, product },
                            paymentLabel: "Creem",
                            payableLabel: formatCurrency(product.price, locale, product.currency),
                          })
                        }
                        variant="outline"
                      >
                        {formatCurrency(product.price, locale, product.currency)}
                      </Button>
                    </ItemActions>
                  </Item>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-20">
          <Card>
            <CardHeader>
              <CardDescription>{t("Current balance")}</CardDescription>
              {billingQuery.isPending ? (
                <Skeleton className="h-9 w-36" />
              ) : billingQuery.isError ? (
                <CardTitle className="text-base text-destructive">
                  {t("Unable to load balance")}
                </CardTitle>
              ) : balanceLabel ? (
                <CardTitle className="text-3xl tabular-nums">{balanceLabel}</CardTitle>
              ) : (
                <CardTitle className="text-3xl tabular-nums">—</CardTitle>
              )}
            </CardHeader>
            <CardContent>
              {billingQuery.isError ? (
                <Button
                  disabled={billingQuery.isFetching}
                  onClick={() => void billingQuery.refetch()}
                  size="sm"
                  variant="outline"
                >
                  {billingQuery.isFetching && (
                    <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                  )}
                  {t(billingQuery.isFetching ? "Retrying…" : "Try again")}
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <WalletCardsIcon className="size-4" />
                  {t("Shared by all API keys in this account")}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("Redeem a code")}</CardTitle>
              <CardDescription>{t("Add prepaid credit directly to this account.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Field data-disabled={configuration?.redemptionEnabled === false}>
                <FieldLabel htmlFor="recharge-redemption-code">{t("Redemption code")}</FieldLabel>
                <Input
                  autoComplete="off"
                  disabled={configuration?.redemptionEnabled === false}
                  id="recharge-redemption-code"
                  onChange={(event) => setRedeemCode(event.target.value)}
                  placeholder={t("Enter redemption code")}
                  value={redeemCode}
                />
                {repository.mode === "demo" && (
                  <FieldDescription>{t("Demo code: TOKEN-BOAT-DEMO")}</FieldDescription>
                )}
              </Field>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                disabled={
                  configuration?.redemptionEnabled === false ||
                  !redeemCode.trim() ||
                  redeem.isPending
                }
                onClick={() => redeem.mutate(redeemCode.trim())}
                variant="outline"
              >
                {redeem.isPending ? (
                  <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                ) : (
                  <GiftIcon data-icon="inline-start" />
                )}
                {t("Redeem")}
              </Button>
            </CardFooter>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>{t("Payment notes")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{t("Payment credentials are handled by the selected provider.")}</span>
              </div>
              <div className="flex items-start gap-2">
                <ReceiptTextIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{t("Pending orders appear in billing history until confirmed.")}</span>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open && !checkout.isPending) setCheckoutIntent(null);
        }}
        open={Boolean(checkoutIntent)}
      >
        <DialogContent closeLabel={t("Close")}>
          <DialogHeader>
            <DialogTitle>{t("Confirm recharge")}</DialogTitle>
            <DialogDescription>
              {t("Review the order before continuing to the payment provider.")}
            </DialogDescription>
          </DialogHeader>
          {checkoutIntent && (
            <div className="rounded-xl border bg-muted/35 p-4">
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("Balance credited")}</dt>
                  <dd className="font-medium">{checkoutIntent.creditLabel}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("Payment method")}</dt>
                  <dd className="font-medium">{checkoutIntent.paymentLabel}</dd>
                </div>
                <Separator />
                <div className="flex items-end justify-between gap-4">
                  <dt className="font-medium">{t("Amount to pay")}</dt>
                  <dd className="text-xl font-semibold">{checkoutIntent.payableLabel}</dd>
                </div>
              </dl>
            </div>
          )}
          <DialogFooter>
            <Button
              disabled={checkout.isPending}
              onClick={() => setCheckoutIntent(null)}
              variant="outline"
            >
              {t("Cancel")}
            </Button>
            <Button
              disabled={checkout.isPending}
              onClick={() => checkoutIntent && checkout.mutate(checkoutIntent.input)}
            >
              {checkout.isPending && (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
              )}
              {t("Confirm and pay")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentReturnIcon(props: {
  paymentStatus: NonNullable<RechargePageProps["paymentStatus"]>;
  state: ReturnType<typeof usePaymentConfirmation>["state"];
}) {
  if (props.paymentStatus === "cancelled" || props.state === "failed") {
    return <CircleXIcon aria-hidden="true" />;
  }
  if (props.state === "checking") {
    return <LoaderCircleIcon aria-hidden="true" className="animate-spin" />;
  }
  if (props.state === "timeout") return <Clock3Icon aria-hidden="true" />;
  return <CheckCircle2Icon aria-hidden="true" />;
}

function paymentReturnTitle(
  paymentStatus: NonNullable<RechargePageProps["paymentStatus"]>,
  state: ReturnType<typeof usePaymentConfirmation>["state"],
): string {
  if (paymentStatus === "cancelled") return "Payment cancelled";
  if (state === "checking") return "Confirming payment";
  if (state === "completed") return "Payment confirmed";
  if (state === "failed") return "Payment failed";
  if (state === "timeout") return "Payment confirmation is taking longer";
  return "Payment submitted";
}

function paymentReturnDescription(
  paymentStatus: NonNullable<RechargePageProps["paymentStatus"]>,
  state: ReturnType<typeof usePaymentConfirmation>["state"],
): string {
  if (paymentStatus === "cancelled") {
    return "No charge was made. You can choose another payment method when ready.";
  }
  if (state === "checking") return "Waiting for the payment provider to confirm this order.";
  if (state === "completed") {
    return "Your account balance and billing history have been refreshed.";
  }
  if (state === "failed") return "The order was not completed. No balance was added.";
  if (state === "timeout") {
    return "The provider has not confirmed the order yet. You can check again without paying twice.";
  }
  return "The balance will update after the payment provider confirms the order.";
}
