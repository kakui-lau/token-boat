import { ChartNoAxesCombinedIcon, TriangleAlertIcon } from "lucide-react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@token-boat/ui/components/ui/empty";
import { cn } from "@token-boat/ui/lib/utils";

type ChartEmptyStateProps = {
  action?: React.ReactNode;
  className?: string;
  description: string;
  title: string;
  variant?: "empty" | "error";
};

export function ChartEmptyState({
  action,
  className,
  description,
  title,
  variant = "empty",
}: ChartEmptyStateProps) {
  return (
    <Empty
      className={cn(
        "min-h-64 border bg-muted/15 px-6 py-10",
        variant === "error" ? "border-destructive/25 bg-destructive/5" : null,
        className,
      )}
      data-slot="chart-empty-state"
      role={variant === "error" ? "alert" : "status"}
    >
      <EmptyHeader>
        <EmptyMedia
          className={variant === "error" ? "bg-destructive/10 text-destructive" : undefined}
          variant="icon"
        >
          {variant === "error" ? (
            <TriangleAlertIcon aria-hidden="true" />
          ) : (
            <ChartNoAxesCombinedIcon aria-hidden="true" />
          )}
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? (
        <EmptyContent className="flex-row flex-wrap justify-center">{action}</EmptyContent>
      ) : null}
    </Empty>
  );
}
