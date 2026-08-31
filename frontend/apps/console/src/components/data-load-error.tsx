import { CircleAlertIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@token-boat/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@token-boat/ui/components/ui/empty";
import { cn } from "@token-boat/ui/lib/utils";

type DataLoadErrorProps = {
  className?: string;
  description: string;
  onRetry(): void;
  retrying?: boolean;
  title: string;
};

export function DataLoadError(props: DataLoadErrorProps) {
  const { t } = useTranslation();

  return (
    <Empty
      className={cn("min-h-56 border border-destructive/25 bg-destructive/5", props.className)}
      data-slot="data-load-error"
      role="alert"
    >
      <EmptyHeader>
        <EmptyMedia className="bg-destructive/10 text-destructive" variant="icon">
          <CircleAlertIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{props.title}</EmptyTitle>
        <EmptyDescription>{props.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button disabled={props.retrying} onClick={props.onRetry} size="sm" variant="outline">
          {props.retrying ? (
            <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
          ) : (
            <RefreshCwIcon data-icon="inline-start" />
          )}
          {t(props.retrying ? "Retrying…" : "Try again")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
