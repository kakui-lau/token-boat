import {
  AlertCircleIcon,
  AudioLinesIcon,
  CircleHelpIcon,
  ExternalLinkIcon,
  ImageIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import { Progress } from "@token-boat/ui/components/ui/progress";
import type { TaskRecord, TaskType } from "@/data/contracts";
import { formatDateTime } from "@/lib/format";
import {
  formatTaskDuration,
  taskCostLabel,
  taskDurationSeconds,
  taskMetadataEntries,
  taskTypeLabel,
} from "../lib/task-display";
import { TaskStatusBadge } from "./task-status-badge";

type TaskCardProps = {
  locale: string;
  onOpenDetails(): void;
  task: TaskRecord;
};

export function TaskCard(props: TaskCardProps) {
  const { t } = useTranslation();
  const Icon = taskTypeIcon(props.task.type);
  const metadata = taskMetadataEntries(props.task, props.locale);
  const duration = formatTaskDuration(taskDurationSeconds(props.task));
  const cost = taskCostLabel(props.task, props.locale);
  const costTitle = t("Cost");
  const prompt = props.task.prompt || t("Prompt unavailable");

  return (
    <Card className="h-full" size="sm">
      <CardHeader>
        <div className="mb-2 flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon aria-hidden="true" />
          </span>
          <Badge variant="outline">{t(taskTypeLabel(props.task.type))}</Badge>
        </div>
        <CardTitle className="line-clamp-2 min-h-10">{prompt}</CardTitle>
        <CardDescription className="truncate font-mono">{props.task.model ?? "—"}</CardDescription>
        <CardAction>
          <TaskStatusBadge status={props.task.status} />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {metadata.slice(0, 2).map((entry) => (
            <Badge key={entry.label} variant="outline">
              {t(entry.label)} {entry.value}
            </Badge>
          ))}
        </div>

        {props.task.progress !== null ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("Task progress")}</span>
              <span>{Math.round(props.task.progress)}%</span>
            </div>
            <Progress value={props.task.progress} />
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("Task progress")}</span>
            <span>—</span>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t("Submitted")}</dt>
            <dd className="mt-0.5 truncate">
              {formatDateTime(props.task.createdAt, props.locale)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t("Elapsed")}</dt>
            <dd className="mt-0.5 truncate">{duration}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">{costTitle}</dt>
            <dd className="mt-0.5 truncate">{cost}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t("Task action")}</dt>
            <dd className="mt-0.5 truncate font-mono">{props.task.action ?? "—"}</dd>
          </div>
        </dl>

        {props.task.failureReason && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>{t("Task failed")}</AlertTitle>
            <AlertDescription className="line-clamp-2">{props.task.failureReason}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="justify-between gap-2">
        <Button onClick={props.onOpenDetails} size="sm" variant="ghost">
          {t("View details")}
        </Button>
        {props.task.resultUrl && (
          <Button
            nativeButton={false}
            render={<a href={props.task.resultUrl} rel="noreferrer" target="_blank" />}
            size="sm"
            variant="outline"
          >
            {t("View result")}
            <ExternalLinkIcon data-icon="inline-end" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function taskTypeIcon(type: TaskType): LucideIcon {
  if (type === "video") return VideoIcon;
  if (type === "audio") return AudioLinesIcon;
  if (type === "image") return ImageIcon;
  return CircleHelpIcon;
}
