import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { InfoIcon } from "lucide-react";

import { Button } from "@token-boat/ui/components/ui/button";
import { CardHeader, CardTitle } from "@token-boat/ui/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@token-boat/ui/components/ui/tooltip";

type SecurityMethodCardHeaderProps = {
  description: string;
  icon: LucideIcon;
  status?: ReactNode;
  title: string;
};

export const securityMethodCardClassName =
  "h-full shadow-xs transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md focus-within:shadow-md";

export function SecurityMethodCardHeader(props: SecurityMethodCardHeaderProps) {
  const Icon = props.icon;

  return (
    <CardHeader className="gap-3 pb-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        {props.status}
      </div>
      <div className="flex items-start gap-1.5">
        <CardTitle className="min-w-0 pt-0.5">{props.title}</CardTitle>
        <Tooltip>
          <TooltipTrigger
            aria-label={props.description}
            render={
              <Button className="shrink-0 text-muted-foreground" size="icon-xs" variant="ghost" />
            }
          >
            <InfoIcon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent
            align="start"
            className="max-w-72 text-pretty leading-relaxed"
            side="bottom"
          >
            {props.description}
          </TooltipContent>
        </Tooltip>
      </div>
    </CardHeader>
  );
}
