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
import type { BillingLedgerEntry } from "@/data/contracts";
import { copyText } from "@/lib/clipboard";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { billingLedgerTypeLabel, billingLedgerTypeVariant } from "../lib/billing-ledger";

type BillingLedgerSheetProps = {
  entry: BillingLedgerEntry | null;
  onOpenChange(open: boolean): void;
};

export function BillingLedgerSheet(props: BillingLedgerSheetProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "zh";
  const entry = props.entry;

  const copyEventId = async () => {
    if (!entry) return;
    try {
      await copyText(entry.id);
      toast.success(t("Event ID copied"));
    } catch {
      toast.error(t("Unable to copy event ID"));
    }
  };

  return (
    <Sheet open={entry !== null} onOpenChange={props.onOpenChange}>
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
            <SheetTitle>{t("Balance event details")}</SheetTitle>
            {entry ? (
              <Badge variant={billingLedgerTypeVariant(entry.type)}>
                {t(billingLedgerTypeLabel(entry.type))}
              </Badge>
            ) : null}
          </div>
          <SheetDescription>
            {t("Review the recorded balance change and its available context.")}
          </SheetDescription>
        </SheetHeader>

        {entry ? (
          <>
            <Separator />
            <ItemGroup className="grid gap-3 p-4 sm:grid-cols-2">
              <LedgerDetail label={t("Event ID")} mono value={entry.id} />
              <LedgerDetail label={t("Type")} value={t(billingLedgerTypeLabel(entry.type))} />
              <LedgerDetail
                label={t("Recorded at")}
                value={formatDateTime(entry.createdAt, locale)}
              />
              <LedgerDetail
                label={t("Balance change")}
                value={
                  entry.amountUsd === null
                    ? t("Not recorded in structured data")
                    : `+${formatCurrency(entry.amountUsd, locale, "USD")}`
                }
              />
              <LedgerDetail label={t("Source IP")} mono value={entry.sourceIp ?? "—"} />
              <LedgerDetail label={t("Related model")} value={entry.model ?? "—"} />
              <LedgerDetail label={t("API key")} value={entry.apiKeyName ?? "—"} />
              <LedgerDetail label={t("Task ID")} mono value={entry.taskId ?? "—"} />
              <LedgerDetail
                className="sm:col-span-2"
                label={t("Recorded description")}
                value={entry.content ?? "—"}
              />
            </ItemGroup>
            <SheetFooter>
              <Button onClick={() => void copyEventId()} variant="outline">
                <CopyIcon data-icon="inline-start" />
                {t("Copy event ID")}
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function LedgerDetail(props: { className?: string; label: string; mono?: boolean; value: string }) {
  return (
    <Item className={props.className} size="sm" variant="outline">
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
