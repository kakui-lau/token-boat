import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClockIcon,
  CrownIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  PackageIcon,
  WalletCardsIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
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
import { ToggleGroup, ToggleGroupItem } from "@token-boat/ui/components/ui/toggle-group";
import type { SubscriptionPlan } from "@/data/contracts";
import { repository } from "@/data/repository";
import { formatCurrency } from "@/lib/format";
import { continueToCheckout } from "@/lib/payment-checkout";
import { invalidateBillingQueries } from "../lib/invalidate-billing-queries";

type SubscriptionPurchaseDialogProps = {
  balance: number;
  locale: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  plan: SubscriptionPlan | null;
};

export function SubscriptionPurchaseDialog({
  balance,
  locale,
  onOpenChange,
  open,
  plan,
}: SubscriptionPurchaseDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedMethodId, setSelectedMethodId] = useState("");
  const selectedMethod =
    plan?.paymentMethods.find((method) => method.id === selectedMethodId) ??
    plan?.paymentMethods[0];
  const limitReached =
    Boolean(plan?.purchaseLimit) && (plan?.purchaseCount ?? 0) >= (plan?.purchaseLimit ?? 0);
  const balanceInsufficient =
    selectedMethod?.type === "balance" && Boolean(plan && balance < plan.price);
  const purchase = useMutation({
    mutationFn: repository.purchaseSubscription,
    onSuccess: (result) => {
      if (!plan) return;
      if (result.kind === "completed" || result.kind === "demo") {
        onOpenChange(false);
        toast.success(t("Subscription purchased"));
        void invalidateBillingQueries(queryClient);
        return;
      }
      toast.success(t("Redirecting to the secure payment page"));
      continueToCheckout(result, { kind: "subscription", planId: plan.id });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Unable to purchase subscription")),
  });

  const submit = () => {
    if (!plan || !selectedMethod || limitReached || balanceInsufficient) return;
    purchase.mutate({ method: selectedMethod, planId: plan.id });
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!purchase.isPending) onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent closeLabel={t("Close")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CrownIcon className="size-5" />
            {t("Purchase subscription")}
          </DialogTitle>
          <DialogDescription>
            {t("Review the plan and choose how you want to pay.")}
          </DialogDescription>
        </DialogHeader>

        {plan && (
          <div className="flex flex-col gap-5">
            <div className="rounded-xl border bg-muted/35 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold">{plan.name}</div>
                  {plan.features[0] && (
                    <div className="mt-1 text-sm text-muted-foreground">{plan.features[0]}</div>
                  )}
                </div>
                <div className="text-right text-xl font-semibold tabular-nums">
                  {formatCurrency(plan.price, locale, plan.currency)}
                </div>
              </div>
              <Separator className="my-4" />
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <CalendarClockIcon className="size-4 text-muted-foreground" />
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("Validity")}</dt>
                    <dd>
                      {plan.durationUnit === "custom"
                        ? t("Custom duration")
                        : t("{{count}} {{unit}}", {
                            count: plan.durationValue,
                            unit: t(
                              plan.durationValue === 1
                                ? plan.durationUnit
                                : `${plan.durationUnit}s`,
                            ),
                          })}
                    </dd>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <PackageIcon className="size-4 text-muted-foreground" />
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("Usage quota")}</dt>
                    <dd>
                      {plan.unlimitedQuota
                        ? t("Unlimited")
                        : formatCurrency(plan.quota, locale, "USD")}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>

            {limitReached && (
              <Alert variant="destructive">
                <AlertTitle>{t("Purchase limit reached")}</AlertTitle>
                <AlertDescription>
                  {t("This plan can be purchased up to {{count}} times per account.", {
                    count: plan.purchaseLimit,
                  })}
                </AlertDescription>
              </Alert>
            )}

            {plan.paymentMethods.length > 0 ? (
              <div className="flex flex-col gap-3">
                <div>
                  <div className="font-medium">{t("Payment method")}</div>
                  <div className="text-sm text-muted-foreground">
                    {t("Only methods configured for this plan are shown.")}
                  </div>
                </div>
                <ToggleGroup
                  aria-label={t("Payment method")}
                  className="grid grid-cols-2"
                  onValueChange={(values) => {
                    if (values[0]) setSelectedMethodId(values[0]);
                  }}
                  value={selectedMethod ? [selectedMethod.id] : []}
                  variant="outline"
                >
                  {plan.paymentMethods.map((method) => (
                    <ToggleGroupItem
                      className="h-auto min-h-12 justify-start gap-2 px-3 py-2"
                      key={method.id}
                      value={method.id}
                    >
                      {method.type === "balance" ? (
                        <WalletCardsIcon aria-hidden="true" className="size-4" />
                      ) : (
                        <ExternalLinkIcon aria-hidden="true" className="size-4" />
                      )}
                      <span className="truncate">{t(method.name)}</span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            ) : (
              <Alert>
                <AlertTitle>{t("No payment method available")}</AlertTitle>
                <AlertDescription>
                  {t("Contact the platform operator to purchase this plan.")}
                </AlertDescription>
              </Alert>
            )}

            {selectedMethod?.type === "balance" && (
              <div className="rounded-xl border p-4 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{t("Available balance")}</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(balance, locale, plan.currency)}
                  </span>
                </div>
                {balanceInsufficient && (
                  <div className="mt-2 text-destructive">{t("Insufficient account balance")}</div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            disabled={purchase.isPending}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            {t("Cancel")}
          </Button>
          <Button
            disabled={
              !plan || !selectedMethod || limitReached || balanceInsufficient || purchase.isPending
            }
            onClick={submit}
          >
            {purchase.isPending && (
              <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
            )}
            {selectedMethod?.type === "balance" ? t("Confirm purchase") : t("Continue to payment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
