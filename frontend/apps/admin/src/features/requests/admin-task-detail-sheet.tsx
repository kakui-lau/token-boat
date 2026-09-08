import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import {
  AlertCircleIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAdminPermission } from "@/app/admin-session-context";
import { adminRepository } from "@/repository/admin-repository";
import type { AdminTask } from "@/repository/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@token-boat/ui/components/ui/alert-dialog";
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

import { formatUsd } from "./admin-task-format";

type AdminTaskDetailSheetProps = {
  onOpenChange(open: boolean): void;
  task: AdminTask | null;
  timeZone: string;
};

export function AdminTaskDetailSheet(props: AdminTaskDetailSheetProps) {
  const { i18n, t } = useTranslation();
  const canOperateFinance = useAdminPermission("finance", "operate");
  const queryClient = useQueryClient();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const locale = i18n.resolvedLanguage ?? "en";
  const task = props.task;
  const refundMutation = useMutation({
    mutationFn: (identity: { internalId: number; taskId: string }) =>
      adminRepository.failAndRefundTask(identity.internalId, identity.taskId),
    onSuccess: async () => {
      setConfirmationOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-request-workspace"] }),
      ]);
    },
  });

  const handleSheetOpenChange = (open: boolean) => {
    if (!open && refundMutation.isPending) return;
    if (!open) {
      setConfirmationOpen(false);
      refundMutation.reset();
    }
    props.onOpenChange(open);
  };

  return (
    <Sheet onOpenChange={handleSheetOpenChange} open={task !== null}>
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
              disabled={refundMutation.isPending}
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
            {task ? <AdminTaskStatusBadge status={task.status} /> : null}
            {task ? <Badge variant="outline">{adminTaskTypeLabel(task.type, t)}</Badge> : null}
          </div>
          <SheetDescription>
            {t("Inspect task ownership, execution, billing, and recovery state.")}
          </SheetDescription>
          {task ? (
            <code
              className="truncate pt-1 text-xs text-muted-foreground"
              title={task.taskId ?? String(task.id)}
            >
              {task.taskId ?? `#${task.id}`}
            </code>
          ) : null}
        </SheetHeader>

        {task ? (
          <>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-4 p-4">
                <section aria-labelledby="admin-task-progress-heading">
                  <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <h3 className="font-medium" id="admin-task-progress-heading">
                        {t("Task progress")}
                      </h3>
                      <span className="font-mono tabular-nums">
                        {task.progress === null ? "—" : `${Math.round(task.progress)}%`}
                      </span>
                    </div>
                    {task.progress === null ? null : (
                      <Progress
                        aria-labelledby="admin-task-progress-heading"
                        value={task.progress}
                      />
                    )}
                  </div>
                </section>

                {task.failureReason ? (
                  <Alert variant="destructive">
                    <AlertCircleIcon aria-hidden="true" />
                    <AlertTitle>{t("Failure reason")}</AlertTitle>
                    <AlertDescription className="break-words">
                      {task.failureReason}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {refundMutation.isSuccess ? (
                  <Alert>
                    <RotateCcwIcon aria-hidden="true" />
                    <AlertTitle>{t("Task failed and refund recorded")}</AlertTitle>
                    <AlertDescription>
                      {refundMutation.data.alreadyRefunded
                        ? t("This task had already been refunded.")
                        : t("Refunded {{amount}} to the customer account.", {
                            amount: formatUsd(refundMutation.data.refundedUsd, locale),
                          })}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <section aria-labelledby="admin-task-information-heading">
                  <h3 className="mb-2 font-medium" id="admin-task-information-heading">
                    {t("Task information")}
                  </h3>
                  <ItemGroup className="grid gap-2 sm:grid-cols-2">
                    <TaskDetailItem
                      label={t("Customer")}
                      value={task.username || `#${task.userId}`}
                    />
                    <TaskDetailItem label={t("User ID")} value={String(task.userId)} />
                    <TaskDetailItem label={t("Model")} value={task.model} />
                    <TaskDetailItem label={t("Task action")} value={task.action} />
                    <TaskDetailItem label={t("Platform")} value={task.platform} />
                    <TaskDetailItem label={t("Channel ID")} value={`#${task.channelId}`} />
                    <TaskDetailItem label={t("Account group")} value={task.group} />
                    <TaskDetailItem label={t("Cost")} value={formatUsd(task.costUsd, locale)} />
                    <TaskDetailItem
                      label={t("Submitted")}
                      value={formatDateTime(task.createdAt, locale, props.timeZone)}
                    />
                    <TaskDetailItem
                      label={t("Start time")}
                      value={formatOptionalDateTime(task.startedAt, locale, props.timeZone)}
                    />
                    <TaskDetailItem
                      label={t("Completion time")}
                      value={formatOptionalDateTime(task.completedAt, locale, props.timeZone)}
                    />
                    <TaskDetailItem label={t("Time zone")} value={props.timeZone} />
                  </ItemGroup>
                </section>

                {task.promptPreview ? (
                  <>
                    <Separator />
                    <section aria-labelledby="admin-task-prompt-heading">
                      <h3 className="mb-2 font-medium" id="admin-task-prompt-heading">
                        {t("Prompt preview")}
                      </h3>
                      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm break-words">
                        {task.promptPreview}
                      </p>
                    </section>
                  </>
                ) : null}

                {task.billing ? (
                  <>
                    <Separator />
                    <section aria-labelledby="admin-task-billing-heading">
                      <h3 className="mb-2 font-medium" id="admin-task-billing-heading">
                        {t("Billing and recovery")}
                      </h3>
                      <ItemGroup className="grid gap-2 sm:grid-cols-2">
                        <TaskDetailItem
                          label={t("Refund status")}
                          value={
                            task.billing.refundStatus
                              ? billingStatusLabel(task.billing.refundStatus, t)
                              : t("Not refunded")
                          }
                        />
                        <TaskDetailItem
                          label={t("Refunded amount")}
                          value={formatUsd(task.billing.refundedUsd, locale)}
                        />
                        <TaskDetailItem
                          label={t("Settlement status")}
                          value={billingStatusLabel(task.billing.settlementStatus, t)}
                        />
                        <TaskDetailItem
                          label={t("Settlement target")}
                          value={formatUsd(task.billing.settlementTargetUsd, locale)}
                        />
                        <TaskDetailItem
                          label={t("Billing audit")}
                          value={billingStatusLabel(task.billing.auditStatus, t)}
                        />
                      </ItemGroup>

                      {task.billing.settlementError || task.billing.auditError ? (
                        <Alert className="mt-3" variant="destructive">
                          <AlertCircleIcon aria-hidden="true" />
                          <AlertTitle>{t("Billing requires attention")}</AlertTitle>
                          <AlertDescription className="break-words">
                            {task.billing.settlementError || task.billing.auditError}
                          </AlertDescription>
                        </Alert>
                      ) : null}
                    </section>
                  </>
                ) : null}
              </div>
            </ScrollArea>

            {canOperateFinance && task.canFailAndRefund && !refundMutation.isSuccess ? (
              <SheetFooter className="border-t sm:flex-row sm:justify-end">
                <AlertDialog
                  onOpenChange={(open) => {
                    if (!open && refundMutation.isPending) return;
                    setConfirmationOpen(open);
                    if (!open) refundMutation.reset();
                  }}
                  open={confirmationOpen}
                >
                  <AlertDialogTrigger
                    render={<Button disabled={refundMutation.isPending} variant="destructive" />}
                  >
                    <RotateCcwIcon data-icon="inline-start" />
                    {t("Fail and refund")}
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogMedia>
                        <ShieldAlertIcon />
                      </AlertDialogMedia>
                      <AlertDialogTitle>{t("Fail this task and refund it?")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t(
                          "This permanently marks the task as failed and refunds its billed amount. Continue only after verifying that it cannot recover.",
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    {refundMutation.isError ? (
                      <Alert variant="destructive">
                        <AlertTitle>{t("Unable to fail and refund task")}</AlertTitle>
                        <AlertDescription>{errorMessage(refundMutation.error, t)}</AlertDescription>
                      </Alert>
                    ) : null}

                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={refundMutation.isPending}>
                        {t("Cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        disabled={refundMutation.isPending}
                        onClick={(event) => {
                          event.preventDefault();
                          if (task.taskId) {
                            refundMutation.mutate({ internalId: task.id, taskId: task.taskId });
                          }
                        }}
                        variant="destructive"
                      >
                        {refundMutation.isPending ? (
                          <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                        ) : (
                          <RotateCcwIcon data-icon="inline-start" />
                        )}
                        {t("Confirm fail and refund")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </SheetFooter>
            ) : null}
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

export function AdminTaskStatusBadge(props: { status: AdminTask["status"] }) {
  const { t } = useTranslation();
  if (props.status === "succeeded") return <Badge>{t("Succeeded")}</Badge>;
  if (props.status === "failed") return <Badge variant="destructive">{t("Failed")}</Badge>;
  if (props.status === "processing") return <Badge variant="secondary">{t("Processing")}</Badge>;
  if (props.status === "queued") return <Badge variant="outline">{t("Queued")}</Badge>;
  if (props.status === "cancelled") return <Badge variant="outline">{t("Cancelled")}</Badge>;
  if (props.status === "expired") return <Badge variant="outline">{t("Expired")}</Badge>;
  return <Badge variant="outline">{t("Unknown")}</Badge>;
}

export function adminTaskTypeLabel(type: AdminTask["type"], t: TFunction): string {
  if (type === "audio") return t("Audio");
  if (type === "image") return t("Image");
  if (type === "video") return t("Video");
  return t("Unknown");
}

function billingStatusLabel(value: string | null, t: TFunction): string {
  if (!value) return t("Not recorded");
  if (value === "completed") return t("Completed");
  if (value === "pending") return t("Pending");
  if (value === "manual_review") return t("Manual review");
  return value;
}

function formatDateTime(timestamp: number, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone,
  }).format(new Date(timestamp * 1_000));
}

function formatOptionalDateTime(
  timestamp: number | null,
  locale: string,
  timeZone: string,
): string {
  return timestamp === null ? "—" : formatDateTime(timestamp, locale, timeZone);
}

function errorMessage(error: unknown, t: (key: string) => string): string {
  return error instanceof Error ? error.message : t("Unknown error");
}
