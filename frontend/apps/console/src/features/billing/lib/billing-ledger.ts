import type { BillingLedgerEntryType } from "@/data/contracts";

export function billingLedgerTypeLabel(type: BillingLedgerEntryType): string {
  if (type === "topup") return "Balance record";
  return "Refund";
}

export function billingLedgerTypeVariant(type: BillingLedgerEntryType): "default" | "secondary" {
  return type === "topup" ? "default" : "secondary";
}
