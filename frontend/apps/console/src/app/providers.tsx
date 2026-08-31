import type { PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@token-boat/ui/components/ui/sonner";
import { TooltipProvider } from "@token-boat/ui/components/ui/tooltip";
import { queryClient } from "./query-client";
import { LayoutPreferencesProvider } from "./layout/layout-preferences-context";
import { SessionProvider } from "./session/session-context";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <LayoutPreferencesProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <SessionProvider>{children}</SessionProvider>
          </TooltipProvider>
          <Toaster richColors />
        </QueryClientProvider>
      </LayoutPreferencesProvider>
    </ThemeProvider>
  );
}
