import { useEffect, type PropsWithChildren } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LoaderCircleIcon, WifiOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ApiClientError } from "@token-boat/api-client";
import { Button } from "@token-boat/ui/components/ui/button";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { SystemState } from "@/components/system-state";
import { useSession } from "./session-context";

type GuestSessionBoundaryProps = PropsWithChildren<{
  authenticatedRedirect?: string;
}>;

export function GuestSessionBoundary(props: GuestSessionBoundaryProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { error, loading, retry, retrying, session } = useSession();

  useEffect(() => {
    if (!session) return;
    if (props.authenticatedRedirect) {
      void navigate({ href: props.authenticatedRedirect, replace: true });
      return;
    }
    void navigate({ to: "/", replace: true });
  }, [navigate, props.authenticatedRedirect, session]);

  if (loading || session) {
    return (
      <div className="grid min-h-svh place-items-center bg-muted/35 p-6">
        <div aria-live="polite" className="w-full max-w-md space-y-5" role="status">
          <Skeleton className="mx-auto size-14 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="mx-auto h-8 w-48" />
            <Skeleton className="mx-auto h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
          <span className="sr-only">{t("Checking your session")}</span>
        </div>
      </div>
    );
  }

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
            "The console could not check your current session. Check the connection and try again.",
          )}
          icon={<WifiOffIcon aria-hidden="true" />}
          requestId={apiError?.requestId}
          requestIdLabel={t("Support reference")}
          title={t("Unable to check your session")}
        />
      </div>
    );
  }

  return props.children;
}
