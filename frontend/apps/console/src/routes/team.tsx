import { createFileRoute } from "@tanstack/react-router";

import { TeamPage } from "@/features/team/pages/team-page";

export const Route = createFileRoute("/team")({ component: TeamPage });
