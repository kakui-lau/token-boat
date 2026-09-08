import type { PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { AdminSessionBoundary } from "./admin-session";
import { queryClient } from "./query-client";

export function AdminProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminSessionBoundary>{children}</AdminSessionBoundary>
    </QueryClientProvider>
  );
}
