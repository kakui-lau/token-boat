import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/preferences")({
  beforeLoad: () => {
    throw redirect({ replace: true, search: { tab: "theme" }, to: "/account" });
  },
});
