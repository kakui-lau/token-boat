import { createFileRoute } from "@tanstack/react-router";
import { TasksPage } from "@/features/tasks/pages/tasks-page";
import { parseTaskSearch } from "@/lib/list-search";

export const Route = createFileRoute("/tasks")({
  validateSearch: parseTaskSearch,
  component: TasksRoute,
});

function TasksRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  return (
    <TasksPage
      search={search}
      onSearchChange={(patch) =>
        void navigate({ search: (previous) => ({ ...previous, ...patch }) })
      }
    />
  );
}
