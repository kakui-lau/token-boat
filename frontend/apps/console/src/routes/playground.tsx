import { createFileRoute } from "@tanstack/react-router";

import { PlaygroundPage } from "@/features/playground/pages/playground-page";
import { parsePlaygroundSearch } from "@/lib/list-search";

export const Route = createFileRoute("/playground")({
  validateSearch: parsePlaygroundSearch,
  component: PlaygroundRoute,
});

function PlaygroundRoute() {
  const search = Route.useSearch();
  return <PlaygroundPage initialModel={search.model} key={search.model ?? "default"} />;
}
