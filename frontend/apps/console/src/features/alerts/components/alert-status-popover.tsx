import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  BellRingIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@token-boat/ui/components/ui/item";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@token-boat/ui/components/ui/popover";
import { Separator } from "@token-boat/ui/components/ui/separator";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { repository } from "@/data/repository";
import { activeAlertRuleCount, platformStatusDetails } from "../lib/alert-status";

type AlertStatusPopoverProps = {
  className?: string;
  onOpenAlertCenter(): void;
};

export function AlertStatusPopover(props: AlertStatusPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    enabled: open,
    queryFn: () => repository.getAlertCenter(),
    queryKey: ["alert-center"],
    staleTime: 30_000,
  });
  let statusContent: ReactNode = null;
  if (!open || query.isPending) {
    statusContent = (
      <div className="flex flex-col gap-2" aria-label={t("Loading alerts and status")}>
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  } else if (query.isError) {
    statusContent = (
      <div className="flex flex-col gap-2">
        <Alert variant="destructive">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle>{t("Unable to load alerts and status")}</AlertTitle>
          <AlertDescription>{t("Try again without leaving this page.")}</AlertDescription>
        </Alert>
        <Button
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          size="sm"
          variant="outline"
        >
          {query.isFetching ? (
            <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
          ) : (
            <RefreshCwIcon data-icon="inline-start" />
          )}
          {t(query.isFetching ? "Retrying…" : "Try again")}
        </Button>
      </div>
    );
  } else if (query.data) {
    statusContent = <AlertStatusSummary data={query.data} />;
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label={t("Alerts and status")}
            className={props.className}
            size="icon"
            variant="ghost"
          />
        }
      >
        <BellRingIcon data-icon="inline-start" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-sm p-0">
        <PopoverHeader className="p-3">
          <PopoverTitle>{t("Alerts and status")}</PopoverTitle>
          <PopoverDescription>{t("Live account alerts and platform health.")}</PopoverDescription>
        </PopoverHeader>
        <Separator />

        <div className="p-3">{statusContent}</div>

        <Separator />
        <div className="p-2">
          <Button
            className="w-full justify-between"
            onClick={() => {
              setOpen(false);
              props.onOpenAlertCenter();
            }}
            variant="ghost"
          >
            {t("Open alert center")}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AlertStatusSummary(props: {
  data: Awaited<ReturnType<typeof repository.getAlertCenter>>;
}) {
  const { t } = useTranslation();
  const status = platformStatusDetails(props.data.platform.status);
  const StatusIcon = status.icon;
  const activeRuleCount = activeAlertRuleCount(props.data.rules);
  let ruleSummary = t("No alert rules configured");
  if (props.data.rules.length > 0) {
    ruleSummary =
      activeRuleCount === null
        ? t("Alert rule status unavailable")
        : t("{{count}} active alert rules", { count: activeRuleCount });
  }

  return (
    <ItemGroup>
      <Item size="sm" variant="muted">
        <ItemMedia variant="icon">
          <StatusIcon aria-hidden="true" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{t(status.label)}</ItemTitle>
          <ItemDescription>
            {props.data.platform.uptimePercent === null
              ? t("Uptime unavailable")
              : t("{{uptime}}% minimum 24-hour uptime", {
                  uptime: props.data.platform.uptimePercent.toFixed(2),
                })}
          </ItemDescription>
        </ItemContent>
        <Badge variant={status.badgeVariant}>{t("Platform")}</Badge>
      </Item>

      <Item size="sm" variant="outline">
        <ItemMedia variant="icon">
          <BellRingIcon aria-hidden="true" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{t("Alert rules")}</ItemTitle>
          <ItemDescription>{ruleSummary}</ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  );
}
