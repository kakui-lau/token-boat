import { useTranslation } from "react-i18next";

import { Badge } from "@token-boat/ui/components/ui/badge";
import type { TaskStatus } from "@/data/contracts";
import { taskStatusLabel } from "../lib/task-display";

type TaskStatusBadgeProps = {
  status: TaskStatus;
};

export function TaskStatusBadge(props: TaskStatusBadgeProps) {
  const { t } = useTranslation();
  let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
  if (props.status === "processing") variant = "default";
  if (props.status === "succeeded") variant = "secondary";
  if (["failed", "cancelled", "expired"].includes(props.status)) variant = "destructive";
  return <Badge variant={variant}>{t(taskStatusLabel(props.status))}</Badge>;
}
