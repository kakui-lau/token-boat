import { ListChecksIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card, CardContent } from "@token-boat/ui/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@token-boat/ui/components/ui/empty";
import { DataPagination } from "@/components/data-pagination";
import type { TaskRecord } from "@/data/contracts";
import { TaskCard } from "./task-card";

type TaskListProps = {
  disabled?: boolean;
  locale: string;
  onOpenTask(taskId: string): void;
  onPageChange(page: number): void;
  onPageSizeChange(pageSize: number): void;
  page: number;
  pageSize: number;
  tasks: TaskRecord[];
  total: number;
};

export function TaskList(props: TaskListProps) {
  const { t } = useTranslation();

  if (props.tasks.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListChecksIcon />
                </EmptyMedia>
                <EmptyTitle>{t("No matching tasks")}</EmptyTitle>
                <EmptyDescription>{t("Try another type, status, or date range.")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
        {props.total > 0 && (
          <DataPagination
            disabled={props.disabled}
            onPageChange={props.onPageChange}
            onPageSizeChange={props.onPageSizeChange}
            page={props.page}
            pageSize={props.pageSize}
            pageSizeOptions={[12, 24, 48]}
            total={props.total}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-4">
        {props.tasks.map((task) => (
          <TaskCard
            key={task.id}
            locale={props.locale}
            onOpenDetails={() => props.onOpenTask(task.id)}
            task={task}
          />
        ))}
      </div>

      <DataPagination
        disabled={props.disabled}
        onPageChange={props.onPageChange}
        onPageSizeChange={props.onPageSizeChange}
        page={props.page}
        pageSize={props.pageSize}
        pageSizeOptions={[12, 24, 48]}
        total={props.total}
      />
    </div>
  );
}
