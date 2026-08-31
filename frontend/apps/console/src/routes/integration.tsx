import { createFileRoute } from "@tanstack/react-router";

import { IntegrationPage } from "@/features/integration/pages/integration-page";

export const Route = createFileRoute("/integration")({ component: IntegrationPage });
