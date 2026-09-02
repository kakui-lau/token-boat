import { lazy, Suspense, useEffect, useState, type PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";

import { queryClient } from "./query-client";
import { LayoutPreferencesProvider } from "./layout/layout-preferences-context";
import { SessionProvider } from "./session/session-context";

const Toaster = lazy(() =>
  import("@token-boat/ui/components/ui/sonner").then((module) => ({
    default: module.Toaster,
  })),
);

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <LayoutPreferencesProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>{children}</SessionProvider>
          <DeferredToaster />
        </QueryClientProvider>
      </LayoutPreferencesProvider>
    </ThemeProvider>
  );
}

function DeferredToaster() {
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      <Toaster richColors />
    </Suspense>
  );
}
