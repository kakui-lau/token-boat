import { CopyIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@token-boat/ui/components/ui/item";
import { Separator } from "@token-boat/ui/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@token-boat/ui/components/ui/sheet";
import { cn } from "@token-boat/ui/lib/utils";
import type { BillingTransaction } from "@/data/contracts";
import { copyText } from "@/lib/clipboard";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  billingTransactionStatusLabel,
  billingTransactionStatusVariant,
  billingTransactionTypeLabel,
} from "../lib/billing-transaction";

type BillingTransactionSheetProps = {
  currency: string | null;
  onOpenChange(open: boolean): void;
  transaction: BillingTransaction | null;
};

export function BillingTransactionSheet(props: BillingTransactionSheetProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "zh";
  const transaction = props.transaction;

  const copyOrderId = async () => {
    if (!transaction) return;
    try {
      await copyText(transaction.id);
      toast.success(t("Order ID copied"));
    } catch {
      toast.error(t("Unable to copy order ID"));
    }
  };

  return (
    <Sheet open={transaction !== null} onOpenChange={props.onOpenChange}>
      <SheetContent
        className="w-full data-[side=right]:sm:max-w-lg"
        showCloseButton={false}
        side="right"
      >
        <SheetClose
          render={
            <Button
              aria-label={t("Close")}
              className="absolute top-3 right-3"
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <XIcon />
        </SheetClose>
        <SheetHeader className="pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle>{t("Payment order details")}</SheetTitle>
            {transaction ? (
              <Badge variant={billingTransactionStatusVariant(transaction.status)}>
                {t(billingTransactionStatusLabel(transaction.status))}
              </Badge>
            ) : null}
          </div>
          <SheetDescription>
            {t("Review the recorded order, payment state, time, and amount.")}
          </SheetDescription>
        </SheetHeader>

        {transaction ? (
          <>
            <Separator />
            <ItemGroup className="grid gap-3 p-4 sm:grid-cols-2">
              <TransactionDetail label={t("Order ID")} mono value={transaction.id} />
              <TransactionDetail
                label={t("Type")}
                value={t(billingTransactionTypeLabel(transaction.type))}
              />
              <TransactionDetail
                label={t("Status")}
                value={t(billingTransactionStatusLabel(transaction.status))}
              />
              <TransactionDetail
                label={t("Date")}
                value={formatDateTime(transaction.createdAt, locale)}
              />
              <TransactionDetail
                label={t("Amount")}
                value={
                  props.currency === null
                    ? "—"
                    : formatCurrency(transaction.amount, locale, props.currency)
                }
              />
              <TransactionDetail label={t("Description")} value={transaction.description ?? "—"} />
            </ItemGroup>
            <SheetFooter>
              <Button onClick={() => void copyOrderId()} variant="outline">
                <CopyIcon data-icon="inline-start" />
                {t("Copy order ID")}
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function TransactionDetail(props: { label: string; mono?: boolean; value: string }) {
  return (
    <Item size="sm" variant="outline">
      <ItemContent>
        <ItemDescription>{props.label}</ItemDescription>
        <ItemTitle
          className={cn(
            "line-clamp-none whitespace-normal",
            props.mono && "break-all font-mono text-xs",
          )}
        >
          {props.value}
        </ItemTitle>
      </ItemContent>
    </Item>
  );
}
