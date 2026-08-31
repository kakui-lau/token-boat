import type { ReactNode } from "react";

import { cn } from "@token-boat/ui/lib/utils";
import { formatCompactDateTime, formatDateTime, formatIdentifier } from "@/lib/format";

type TableTextProps = {
  children?: ReactNode;
  className?: string;
  value: string | null | undefined;
};

export function TableText({ children, className, value }: TableTextProps) {
  return (
    <span className={cn("block max-w-64 truncate", className)} title={value ?? undefined}>
      {children ?? value ?? "—"}
    </span>
  );
}

type TableDateTimeProps = {
  className?: string;
  fallback?: ReactNode;
  locale: string;
  timestamp: number | null | undefined;
};

export function TableDateTime({
  className,
  fallback = "—",
  locale,
  timestamp,
}: TableDateTimeProps) {
  if (!timestamp) return fallback;

  return (
    <time
      className={cn("tabular-nums", className)}
      dateTime={new Date(timestamp * 1000).toISOString()}
      title={formatDateTime(timestamp, locale)}
    >
      {formatCompactDateTime(timestamp, locale)}
    </time>
  );
}

type TableIdentifierProps = {
  className?: string;
  value: string;
};

export function TableIdentifier({ className, value }: TableIdentifierProps) {
  return (
    <span className={cn("font-mono text-xs", className)} title={value}>
      {formatIdentifier(value)}
    </span>
  );
}
