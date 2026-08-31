import { useEffect, type PropsWithChildren } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { LoaderCircleIcon, WifiOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ApiClientError } from "@token-boat/api-client";
import { Button } from "@token-boat/ui/components/ui/button";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { SystemState } from "@/components/system-state";
import { protectedConsoleRedirect } from "@/features/auth/lib/auth-redirect";
import { useSession } from "./session-context";

export function SessionBoundary({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const locationHref = useRouterState({ select: (state) => state.location.href });
  const { error, loading, retry, retrying, session } = useSession();

  useEffect(() => {
    if (loading || error || session) return;
    void navigate({
      to: "/sign-in",
      replace: true,
      search: { redirect: protectedConsoleRedirect(locationHref) },
    });
  }, [error, loading, locationHref, navigate, session]);

  if (error) {
    const apiError = error instanceof ApiClientError ? error : null;
    return (
      <div className="grid min-h-svh place-items-center bg-muted/35 p-6">
        <SystemState
          actions={
            <Button disabled={retrying} onClick={() => void retry()} size="sm" variant="outline">
              {retrying ? (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
              ) : null}
              {t(retrying ? "Retrying…" : "Try again")}
            </Button>
          }
          className="w-full max-w-lg"
          code={apiError ? String(apiError.status) : undefined}
          description={t(
            "The console could not reach the API. Your session was not cleared; check the connection and try again.",
          )}
          icon={<WifiOffIcon aria-hidden="true" />}
          requestId={apiError?.requestId}
          requestIdLabel={t("Support reference")}
          title={t("Unable to restore your session")}
        />
      </div>
    );
  }

  if (loading || !session) {
    return (
      <div className="grid min-h-svh grid-cols-[15rem_1fr] bg-muted/35">
        <div className="hidden border-r bg-sidebar p-4 md:block">
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="p-6">
          <Skeleton className="h-8 w-52" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton className="h-28" key={index} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return children;
}
