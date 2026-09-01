import { AlertCircleIcon, CopyIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@token-boat/ui/components/ui/item";
import { Progress } from "@token-boat/ui/components/ui/progress";
import { ScrollArea } from "@token-boat/ui/components/ui/scroll-area";
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
import type { TaskRecord } from "@/data/contracts";
import { copyText } from "@/lib/clipboard";
import { formatDateTime } from "@/lib/format";
import {
  formatTaskDuration,
  taskCostLabel,
  taskDurationSeconds,
  taskMetadataEntries,
  taskTypeLabel,
} from "../lib/task-display";
import { TaskStatusBadge } from "./task-status-badge";

type TaskDetailsSheetProps = {
  locale: string;
  onOpenChange(open: boolean): void;
  task: TaskRecord | null;
};

export function TaskDetailsSheet(props: TaskDetailsSheetProps) {
  const { t } = useTranslation();
  const task = props.task;
  const metadata = task ? taskMetadataEntries(task, props.locale) : [];
  const copyTaskId = () => {
    if (!task) return;
    void copyText(task.id)
      .then(() => toast.success(t("Task ID copied")))
      .catch(() => toast.error(t("Unable to copy task ID")));
  };

  return (
    <Sheet onOpenChange={props.onOpenChange} open={task !== null}>
      <SheetContent
        className="w-full gap-0 p-0 data-[side=right]:sm:max-w-2xl"
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

        <SheetHeader className="border-b pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle>{t("Task details")}</SheetTitle>
            {task ? <TaskStatusBadge status={task.status} /> : null}
            {task ? <Badge variant="outline">{t(taskTypeLabel(task.type))}</Badge> : null}
          </div>
          <SheetDescription>
            {t("Inspect task status, timing, billing, input, output, and type-specific metadata.")}
          </SheetDescription>
          {task ? (
            <div className="flex min-w-0 items-center gap-2 pt-1">
              <code className="min-w-0 flex-1 truncate text-xs" title={task.id}>
                {task.id}
              </code>
              <Button
                aria-label={t("Copy task ID")}
                onClick={copyTaskId}
                size="icon-xs"
                variant="ghost"
              >
                <CopyIcon />
              </Button>
            </div>
          ) : null}
        </SheetHeader>

        {task ? (
          <>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-4 p-4">
                <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">{t("Task progress")}</span>
                    <span className="font-mono tabular-nums">
                      {task.progress === null ? "—" : `${Math.round(task.progress)}%`}
                    </span>
                  </div>
                  {task.progress === null ? null : <Progress value={task.progress} />}
                </div>

                {task.failureReason ? (
                  <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertTitle>{t("Failure reason")}</AlertTitle>
                    <AlertDescription>{task.failureReason}</AlertDescription>
                  </Alert>
                ) : null}

                <section aria-labelledby="task-observation-heading">
                  <h3 className="mb-2 font-medium" id="task-observation-heading">
                    {t("Task information")}
                  </h3>
                  <ItemGroup className="grid gap-2 sm:grid-cols-2">
                    <TaskDetailItem label={t("Model")} value={task.model} />
                    <TaskDetailItem label={t("Task action")} value={task.action} />
                    <TaskDetailItem
                      label={t("Submitted")}
                      value={formatDateTime(task.createdAt, props.locale)}
                    />
                    <TaskDetailItem
                      label={t("Start time")}
                      value={task.startedAt ? formatDateTime(task.startedAt, props.locale) : "—"}
                    />
                    <TaskDetailItem
                      label={t("Completion time")}
                      value={
                        task.completedAt ? formatDateTime(task.completedAt, props.locale) : "—"
                      }
                    />
                    <TaskDetailItem
                      label={t("Elapsed")}
                      value={formatTaskDuration(taskDurationSeconds(task))}
                    />
                    <TaskDetailItem
                      label={t("Last updated")}
                      value={task.updatedAt ? formatDateTime(task.updatedAt, props.locale) : "—"}
                    />
                    <TaskDetailItem label={t("Cost")} value={taskCostLabel(task, props.locale)} />
                    <TaskDetailItem label={t("Billing unit")} value="USD" />
                    <TaskDetailItem label={t("Result URL")} value={task.resultUrl} />
                  </ItemGroup>
                </section>

                {metadata.length > 0 ? (
                  <>
                    <Separator />
                    <section aria-labelledby="task-metadata-heading">
                      <h3 className="mb-2 font-medium" id="task-metadata-heading">
                        {t("Type-specific details")}
                      </h3>
                      <ItemGroup className="grid gap-2 sm:grid-cols-2">
                        {metadata.map((entry) => (
                          <TaskDetailItem
                            key={entry.label}
                            label={t(entry.label)}
                            value={entry.value}
                          />
                        ))}
                      </ItemGroup>
                    </section>
                  </>
                ) : null}

                <Separator />
                <section aria-labelledby="task-input-heading">
                  <h3 className="mb-2 font-medium" id="task-input-heading">
                    {t("Prompt or input")}
                  </h3>
                  {task.prompt ? (
                    <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">
                      {task.prompt}
                    </p>
                  ) : (
                    <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                      {t("Prompt unavailable")}
                    </p>
                  )}
                </section>
              </div>
            </ScrollArea>

            <SheetFooter className="border-t sm:flex-row sm:justify-end">
              <Button onClick={copyTaskId} variant="outline">
                <CopyIcon data-icon="inline-start" />
                {t("Copy task ID")}
              </Button>
              {task.resultUrl ? (
                <Button
                  nativeButton={false}
                  render={<a href={task.resultUrl} rel="noreferrer" target="_blank" />}
                >
                  {t("Open result")}
                  <ExternalLinkIcon data-icon="inline-end" />
                </Button>
              ) : null}
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function TaskDetailItem(props: { label: string; value: string | null }) {
  return (
    <Item size="xs" variant="muted">
      <ItemContent>
        <ItemTitle>{props.label}</ItemTitle>
        <ItemDescription className="break-all font-mono">{props.value || "—"}</ItemDescription>
      </ItemContent>
    </Item>
  );
}
