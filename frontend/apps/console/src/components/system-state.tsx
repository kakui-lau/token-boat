import type { ReactNode } from "react";

import { Badge } from "@token-boat/ui/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@token-boat/ui/components/ui/empty";
import { cn } from "@token-boat/ui/lib/utils";

type SystemStateProps = {
  actions?: ReactNode;
  className?: string;
  code?: string;
  description: string;
  icon: ReactNode;
  requestId?: string;
  requestIdLabel?: string;
  title: string;
};

export function SystemState(props: SystemStateProps) {
  return (
    <Empty
      className={cn("min-h-80 border bg-background", props.className)}
      data-slot="system-state"
      role="alert"
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">{props.icon}</EmptyMedia>
        {props.code ? <Badge variant="outline">{props.code}</Badge> : null}
        <EmptyTitle>{props.title}</EmptyTitle>
        <EmptyDescription>{props.description}</EmptyDescription>
      </EmptyHeader>
      {props.requestId ? (
        <p className="max-w-full truncate text-xs text-muted-foreground" title={props.requestId}>
          {props.requestIdLabel ? `${props.requestIdLabel}: ` : null}
          <span className="font-mono">{props.requestId}</span>
        </p>
      ) : null}
      {props.actions ? (
        <EmptyContent className="flex flex-wrap justify-center gap-2">{props.actions}</EmptyContent>
      ) : null}
    </Empty>
  );
}
