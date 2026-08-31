import { createFileRoute } from "@tanstack/react-router";

import { GettingStartedPage } from "@/features/onboarding/pages/getting-started-page";

export const Route = createFileRoute("/getting-started")({ component: GettingStartedPage });
