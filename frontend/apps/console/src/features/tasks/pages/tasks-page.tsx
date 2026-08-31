import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownUpIcon, CircleAlertIcon, ClockAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@token-boat/ui/components/ui/alert";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@token-boat/ui/components/ui/select";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@token-boat/ui/components/ui/tabs";
import { DateRangePicker } from "@/components/date-range-picker";
import { DataLoadError } from "@/components/data-load-error";
import { PageHeader } from "@/components/page-header";
import type { TaskListInput } from "@/data/contracts";
import { repository } from "@/data/repository";
import {
  dateRangeSearchPatch,
  resolveDateRange,
  type SearchPatch,
  type TaskSearch,
  useControllableSearch,
} from "@/lib/list-search";
import { TaskDetailsSheet } from "../components/task-details-sheet";
import { TaskList } from "../components/task-list";
import { taskStatusLabel, taskTypeLabel } from "../lib/task-display";

type TaskStatusFilter = TaskListInput["status"];

const taskTypes: TaskListInput["type"][] = ["all", "image", "video", "audio"];
const taskStatuses: TaskStatusFilter[] = [
  "all",
  "queued",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
];

type TasksPageProps = {
  onSearchChange?: (patch: SearchPatch<TaskSearch>) => void;
  search?: TaskSearch;
};

export function TasksPage(props: TasksPageProps) {
  const { t, i18n } = useTranslation();
  const [search, updateSearch] = useControllableSearch(props.search, props.onSearchChange);
  const range = useMemo(
    () => resolveDateRange(search, "30d"),
    [search.from, search.range, search.to],
  );
  const statusFilter: TaskStatusFilter = search.status ?? "all";
  const typeFilter: TaskListInput["type"] = search.type ?? "all";
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 12;
  const order = search.order ?? "desc";
  const taskStatusItems = taskStatuses.map((value) => ({
    label: t(taskStatusLabel(value)),
    value,
  }));
  const query = useQuery({
    queryKey: ["tasks", { order, page, pageSize, range, statusFilter, typeFilter }],
    queryFn: () =>
      repository.getTasksPage({
        order,
        page,
        pageSize,
        range,
        status: statusFilter,
        type: typeFilter,
      }),
    refetchInterval: 15_000,
  });
  const countsQuery = useQuery({
    queryKey: ["task-type-counts", { range, statusFilter }],
    queryFn: () => repository.getTaskTypeCounts({ order: "desc", range, status: statusFilter }),
    refetchInterval: 15_000,
  });
  const locale = i18n.resolvedLanguage ?? "en";
  const selectedTask = search.detail
    ? (query.data?.items.find((task) => task.id === search.detail) ?? null)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("Tasks")}
        description={t("Track image, video, and audio jobs with type-specific details.")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker
              onChange={(value) => {
                updateSearch({
                  ...dateRangeSearchPatch(value, "30d"),
                  detail: undefined,
                  page: undefined,
                });
              }}
              value={range}
            />
            <Select
              items={taskStatusItems}
              onValueChange={(value) => {
                if (!value) return;
                const nextStatus = value as TaskStatusFilter;
                updateSearch({
                  detail: undefined,
                  page: undefined,
                  status: nextStatus === "all" ? undefined : nextStatus,
                });
              }}
              value={statusFilter}
            >
              <SelectTrigger aria-label={t("Filter by status")}>
                <SelectValue>{t(taskStatusLabel(statusFilter))}</SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {taskStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(taskStatusLabel(status))}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => {
                if (!value) return;
                const nextOrder = value as TaskListInput["order"];
                updateSearch({
                  detail: undefined,
                  order: nextOrder === "desc" ? undefined : nextOrder,
                  page: undefined,
                });
              }}
              value={order}
            >
              <SelectTrigger aria-label={t("Sort order")}>
                <ArrowDownUpIcon aria-hidden="true" />
                <SelectValue>{t(order === "desc" ? "Newest first" : "Oldest first")}</SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value="desc">{t("Newest first")}</SelectItem>
                  <SelectItem value="asc">{t("Oldest first")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <Alert className="border-amber-500/30 bg-amber-500/5 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
        <ClockAlertIcon aria-hidden="true" />
        <AlertTitle>{t("Download generated results promptly")}</AlertTitle>
        <AlertDescription>
          {t(
            "Generated image, video, and audio files may expire or become unavailable. Download and store them immediately after the task succeeds.",
          )}
        </AlertDescription>
      </Alert>

      {query.isError ? (
        <DataLoadError
          description={t("Try refreshing the page or check the API connection.")}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          title={t("Unable to load tasks")}
        />
      ) : (
        <>
          {countsQuery.isError ? (
            <Alert>
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>{t("Task type counts unavailable")}</AlertTitle>
              <AlertDescription>
                {t("Tasks are still available, but type totals could not be loaded.")}
              </AlertDescription>
              <AlertAction>
                <Button
                  disabled={countsQuery.isFetching}
                  onClick={() => void countsQuery.refetch()}
                  size="sm"
                  variant="outline"
                >
                  {t("Retry")}
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          {query.data && search.detail && !selectedTask ? (
            <Alert>
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>{t("Task details unavailable")}</AlertTitle>
              <AlertDescription>
                {t(
                  "The selected task was not found in the current account, filters, or page. No substitute task was opened.",
                )}
              </AlertDescription>
              <AlertAction>
                <Button
                  onClick={() => updateSearch({ detail: undefined })}
                  size="sm"
                  variant="outline"
                >
                  {t("Clear selection")}
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          <Tabs
            onValueChange={(value) => {
              const nextType = value as TaskListInput["type"];
              updateSearch({
                detail: undefined,
                page: undefined,
                type: nextType === "all" ? undefined : nextType,
              });
            }}
            value={typeFilter}
          >
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:h-8 sm:w-fit sm:grid-cols-4 sm:gap-0 sm:p-[3px]">
              {taskTypes.map((type) => (
                <TabsTrigger className="h-8 sm:h-[calc(100%-1px)]" key={type} value={type}>
                  {t(taskTypeLabel(type))}
                  <TaskTypeCount count={countsQuery.data?.[type]} loading={countsQuery.isPending} />
                </TabsTrigger>
              ))}
            </TabsList>

            {taskTypes.map((type) => (
              <TabsContent key={type} value={type}>
                {type === typeFilter &&
                  (query.isPending ? (
                    <div aria-busy="true" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {Array.from({ length: 8 }, (_, index) => (
                        <Skeleton className="h-80" key={index} />
                      ))}
                    </div>
                  ) : (
                    <TaskList
                      disabled={query.isFetching}
                      locale={locale}
                      onOpenTask={(taskId) => updateSearch({ detail: taskId })}
                      onPageChange={(value) =>
                        updateSearch({
                          detail: undefined,
                          page: value === 1 ? undefined : value,
                        })
                      }
                      onPageSizeChange={(value) => {
                        updateSearch({
                          detail: undefined,
                          page: undefined,
                          pageSize: value === 12 ? undefined : value,
                        });
                      }}
                      page={query.data?.page ?? page}
                      pageSize={pageSize}
                      tasks={query.data?.items ?? []}
                      total={query.data?.total ?? 0}
                    />
                  ))}
              </TabsContent>
            ))}
          </Tabs>

          <TaskDetailsSheet
            locale={locale}
            onOpenChange={(open) => {
              if (!open) updateSearch({ detail: undefined });
            }}
            task={selectedTask}
          />
        </>
      )}
    </div>
  );
}

function TaskTypeCount(props: { count?: number; loading: boolean }) {
  const { t } = useTranslation();
  if (props.loading) {
    return <Skeleton aria-label={t("Loading")} className="h-4 w-6 rounded-full" />;
  }
  return (
    <Badge variant={props.count === undefined ? "outline" : "secondary"}>
      {props.count ?? "—"}
    </Badge>
  );
}
