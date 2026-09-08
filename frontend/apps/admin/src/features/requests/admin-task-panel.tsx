import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  ListFilterIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SearchIcon,
  WorkflowIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { adminRepository } from "@/repository/admin-repository";
import type {
  AdminTask,
  AdminTaskListInput,
  AdminTaskStatusFilter,
  AdminTaskTypeFilter,
  AdminTimeRange,
} from "@/repository/contracts";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@token-boat/ui/components/ui/alert";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@token-boat/ui/components/ui/empty";
import { Input } from "@token-boat/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@token-boat/ui/components/ui/select";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@token-boat/ui/components/ui/table";

import {
  adminTaskTypeLabel,
  AdminTaskDetailSheet,
  AdminTaskStatusBadge,
} from "./admin-task-detail-sheet";
import { formatUsd } from "./admin-task-format";
import { refreshAdminTimeRange } from "./admin-time-range";

const pageSize = 20;
const statusOptions: AdminTaskStatusFilter[] = [
  "all",
  "queued",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
];
const typeOptions: AdminTaskTypeFilter[] = ["all", "image", "video", "audio"];

type AdminTaskPanelProps = {
  onRangeChange(value: AdminTimeRange): void;
  range: AdminTimeRange;
};

export function AdminTaskPanel(props: AdminTaskPanelProps) {
  const { i18n, t } = useTranslation();
  const [channelId, setChannelId] = useState("");
  const [channelInput, setChannelInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTask, setSelectedTask] = useState<AdminTask | null>(null);
  const [status, setStatus] = useState<AdminTaskStatusFilter>("all");
  const [type, setType] = useState<AdminTaskTypeFilter>("all");
  const locale = i18n.resolvedLanguage ?? "en";
  const statusSelectItems = useMemo<Record<AdminTaskStatusFilter, string>>(
    () => ({
      all: t("All statuses"),
      cancelled: t("Cancelled"),
      expired: t("Expired"),
      failed: t("Failed"),
      processing: t("Processing"),
      queued: t("Queued"),
      succeeded: t("Succeeded"),
    }),
    [t],
  );
  const typeSelectItems = useMemo<Record<AdminTaskTypeFilter, string>>(
    () => ({
      all: t("All task types"),
      audio: t("Audio"),
      image: t("Image"),
      video: t("Video"),
    }),
    [t],
  );

  useEffect(() => {
    setPage(1);
    setSelectedTask(null);
  }, [props.range.endTimestamp, props.range.startTimestamp]);

  const queryInput = useMemo<AdminTaskListInput>(
    () => ({
      channelId,
      keyword,
      order: "desc",
      page,
      pageSize,
      range: props.range,
      status,
      type,
    }),
    [channelId, keyword, page, props.range, status, type],
  );
  const tasksQuery = useQuery({
    queryKey: [
      "admin-tasks",
      {
        channelId,
        keyword,
        order: "desc",
        page,
        pageSize,
        status,
        timeRange: [props.range.startTimestamp, props.range.endTimestamp],
        type,
      },
    ],
    queryFn: ({ signal }) => adminRepository.listTasks(queryInput, signal),
  });

  const data = tasksQuery.data;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  const selectedTaskFromPage = selectedTask
    ? data?.items.find((task) => task.id === selectedTask.id)
    : null;
  const activeTask = selectedTaskFromPage ?? selectedTask;
  const hasFilters = Boolean(
    keywordInput || channelInput || keyword || channelId || status !== "all" || type !== "all",
  );
  const refreshTasks = () => {
    const nextRange = refreshAdminTimeRange(props.range);
    if (
      nextRange.startTimestamp === props.range.startTimestamp &&
      nextRange.endTimestamp === props.range.endTimestamp
    ) {
      void tasksQuery.refetch();
      return;
    }
    props.onRangeChange(nextRange);
  };

  const applySearch = () => {
    setPage(1);
    setKeyword(keywordInput.trim());
    setChannelId(channelInput.trim());
  };

  const resetFilters = () => {
    setChannelId("");
    setChannelInput("");
    setKeyword("");
    setKeywordInput("");
    setPage(1);
    setStatus("all");
    setType("all");
  };

  return (
    <>
      <Card aria-busy={tasksQuery.isFetching}>
        <CardHeader className="border-b">
          <CardTitle>{t("Asynchronous tasks")}</CardTitle>
          <CardDescription>
            {t("Inspect task execution and perform controlled failure refunds.")}
          </CardDescription>
          <CardAction>
            <div className="flex items-center gap-1">
              <Badge variant="secondary">
                {tasksQuery.isFetching ? (
                  <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                ) : (
                  <WorkflowIcon data-icon="inline-start" />
                )}
                {t("{{count}} tasks", { count: data?.total ?? 0 })}
              </Badge>
              <Button
                aria-label={t("common.refresh")}
                disabled={tasksQuery.isFetching}
                onClick={refreshTasks}
                size="icon-sm"
                variant="ghost"
              >
                <RefreshCwIcon className={tasksQuery.isFetching ? "animate-spin" : undefined} />
              </Button>
            </div>
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <form
            className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_9rem_9rem_10rem_auto_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              applySearch();
            }}
          >
            <div className="relative">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={t("Search tasks")}
                className="pl-8"
                onChange={(event) => setKeywordInput(event.target.value)}
                placeholder={t("requests.taskId")}
                type="search"
                value={keywordInput}
              />
            </div>

            <Select
              items={statusSelectItems}
              onValueChange={(value) => {
                if (!value) return;
                setChannelId(channelInput.trim());
                setKeyword(keywordInput.trim());
                setPage(1);
                setStatus(value as AdminTaskStatusFilter);
              }}
              value={status}
            >
              <SelectTrigger aria-label={t("Filter by task status")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {statusOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {statusSelectItems[option]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              items={typeSelectItems}
              onValueChange={(value) => {
                if (!value) return;
                setChannelId(channelInput.trim());
                setKeyword(keywordInput.trim());
                setPage(1);
                setType(value as AdminTaskTypeFilter);
              }}
              value={type}
            >
              <SelectTrigger aria-label={t("Filter by task type")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {typeOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {typeSelectItems[option]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Input
              aria-label={t("Filter by channel ID")}
              inputMode="numeric"
              onChange={(event) => setChannelInput(event.target.value.replaceAll(/[^0-9]/g, ""))}
              placeholder={t("Channel ID")}
              value={channelInput}
            />

            <Button type="submit">
              <SearchIcon data-icon="inline-start" />
              {t("Search")}
            </Button>
            <Button disabled={!hasFilters} onClick={resetFilters} type="button" variant="ghost">
              <ListFilterIcon data-icon="inline-start" />
              {t("Reset")}
            </Button>
          </form>

          {tasksQuery.isError ? (
            <Alert variant="destructive">
              <AlertCircleIcon aria-hidden="true" />
              <AlertTitle>{t("Unable to load tasks")}</AlertTitle>
              <AlertDescription>{errorMessage(tasksQuery.error, t)}</AlertDescription>
              <AlertAction>
                <Button onClick={refreshTasks} size="sm" variant="outline">
                  {t("Retry")}
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          {tasksQuery.isPending ? (
            <div aria-label={t("Loading tasks")} className="flex flex-col gap-2" role="status">
              {Array.from({ length: 7 }).map((_, index) => (
                <Skeleton className="h-11 w-full" key={index} />
              ))}
            </div>
          ) : data && data.items.length > 0 ? (
            <>
              <Table className="min-w-[62rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Task")}</TableHead>
                    <TableHead>{t("Customer")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead>{t("Type and model")}</TableHead>
                    <TableHead>{t("Channel")}</TableHead>
                    <TableHead>{t("Submitted")}</TableHead>
                    <TableHead className="text-right">{t("Cost")}</TableHead>
                    <TableHead className="text-right">{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="max-w-52">
                        <div className="flex flex-col gap-0.5">
                          <code className="truncate text-xs" title={task.taskId ?? String(task.id)}>
                            {task.taskId ?? `#${task.id}`}
                          </code>
                          <span className="truncate text-xs text-muted-foreground">
                            {task.action || "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="max-w-40 truncate font-medium">
                            {task.username || t("Unknown customer")}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            #{task.userId}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <AdminTaskStatusBadge status={task.status} />
                          {task.progress === null ? null : (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {t("{{count}}% complete", { count: Math.round(task.progress) })}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-60">
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant="outline">{adminTaskTypeLabel(task.type, t)}</Badge>
                          <code
                            className="max-w-52 truncate text-xs"
                            title={task.model ?? undefined}
                          >
                            {task.model || "—"}
                          </code>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-xs">#{task.channelId}</span>
                          <span className="max-w-32 truncate text-xs text-muted-foreground">
                            {task.platform || "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {formatDateTime(task.createdAt, locale, props.range.timeZone)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatUsd(task.costUsd, locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          aria-label={t("View task {{id}} details", {
                            id: task.taskId ?? `#${task.id}`,
                          })}
                          onClick={() => setSelectedTask(task)}
                          size="sm"
                          variant="outline"
                        >
                          {t("Details")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {t("Showing {{start}}–{{end}} of {{total}} tasks", {
                    end: Math.min(page * pageSize, data.total),
                    start: (page - 1) * pageSize + 1,
                    total: data.total,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t("Page {{page}} of {{pages}}", { page, pages: totalPages })}
                  </span>
                  <Button
                    disabled={page <= 1 || tasksQuery.isFetching}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    size="sm"
                    variant="outline"
                  >
                    {t("Previous")}
                  </Button>
                  <Button
                    disabled={page >= totalPages || tasksQuery.isFetching}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    size="sm"
                    variant="outline"
                  >
                    {t("Next")}
                  </Button>
                </div>
              </div>
            </>
          ) : data ? (
            <Empty className="min-h-56 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WorkflowIcon />
                </EmptyMedia>
                <EmptyTitle>{t("No matching tasks")}</EmptyTitle>
                <EmptyDescription>
                  {t("Try another search, filter, or time range.")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </CardContent>
      </Card>

      <AdminTaskDetailSheet
        key={activeTask?.id ?? "closed-task-detail"}
        onOpenChange={(open) => {
          if (!open) setSelectedTask(null);
        }}
        task={activeTask}
        timeZone={props.range.timeZone}
      />
    </>
  );
}

function formatDateTime(timestamp: number, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(timestamp * 1_000));
}

function errorMessage(error: unknown, t: (key: string) => string): string {
  return error instanceof Error ? error.message : t("Unknown error");
}
