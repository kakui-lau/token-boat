import { Link, useRouterState } from "@tanstack/react-router";
import { CircleAlertIcon, CopyIcon, HomeIcon, LogInIcon, RefreshCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ApiClientError } from "@token-boat/api-client";
import { Button } from "@token-boat/ui/components/ui/button";
import { SystemState } from "@/components/system-state";
import { protectedConsoleRedirect } from "@/features/auth/lib/auth-redirect";
import { copyText } from "@/lib/clipboard";

type RouteErrorBoundaryProps = {
  error: unknown;
  onReload?(): void;
  reset(): void;
};

export function RouteErrorBoundary(props: RouteErrorBoundaryProps) {
  const { t } = useTranslation();
  const locationHref = useRouterState({ select: (routerState) => routerState.location.href });
  const state = routeErrorState(props.error);

  const copySupportReference = async () => {
    if (!state.requestId) return;
    try {
      await copyText(state.requestId);
      toast.success(t("Support reference copied"));
    } catch {
      toast.error(t("Unable to copy support reference"));
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4 sm:p-6">
      <SystemState
        actions={
          <>
            {state.reloadRequired ? (
              <Button onClick={props.onReload ?? (() => window.location.reload())}>
                <RefreshCwIcon data-icon="inline-start" />
                {t("Reload page")}
              </Button>
            ) : state.canRetry ? (
              <Button onClick={props.reset}>
                <RefreshCwIcon data-icon="inline-start" />
                {t("Try again")}
              </Button>
            ) : null}
            {state.requestId ? (
              <Button onClick={() => void copySupportReference()} variant="outline">
                <CopyIcon data-icon="inline-start" />
                {t("Copy support reference")}
              </Button>
            ) : null}
            <Button
              nativeButton={false}
              render={
                state.signIn ? (
                  <Link
                    search={{ redirect: protectedConsoleRedirect(locationHref) }}
                    to="/sign-in"
                  />
                ) : (
                  <Link to="/" />
                )
              }
              variant={state.canRetry || state.reloadRequired ? "outline" : "default"}
            >
              {state.signIn ? (
                <LogInIcon data-icon="inline-start" />
              ) : (
                <HomeIcon data-icon="inline-start" />
              )}
              {t(state.signIn ? "Go to sign in" : "Back to overview")}
            </Button>
          </>
        }
        className="w-full max-w-lg"
        code={state.status === null ? undefined : String(state.status)}
        description={t(state.description)}
        icon={<CircleAlertIcon aria-hidden="true" />}
        requestId={state.requestId}
        requestIdLabel={t("Support reference")}
        title={t(state.title)}
      />
    </main>
  );
}

type RouteErrorState = {
  canRetry: boolean;
  description: string;
  reloadRequired: boolean;
  requestId?: string;
  signIn: boolean;
  status: number | null;
  title: string;
};

function routeErrorState(error: unknown): RouteErrorState {
  const apiError = error instanceof ApiClientError ? error : null;
  const status = apiError?.status ?? null;
  const requestId = apiError?.requestId;

  if (isModuleLoadError(error)) {
    return {
      canRetry: false,
      description:
        "A page module could not be loaded. Reload to fetch the latest console version without changing the current address.",
      reloadRequired: true,
      requestId,
      signIn: false,
      status,
      title: "A page update is required",
    };
  }

  if (status === 401) {
    return {
      canRetry: false,
      description: "Your session is no longer valid. Sign in again to continue.",
      reloadRequired: false,
      requestId,
      signIn: true,
      status,
      title: "Session expired",
    };
  }
  if (status === 403) {
    return {
      canRetry: false,
      description: "Your account does not have permission to access this resource.",
      reloadRequired: false,
      requestId,
      signIn: false,
      status,
      title: "Access denied",
    };
  }
  if (status === 404) {
    return {
      canRetry: false,
      description: "The requested resource no longer exists or is not available to this account.",
      reloadRequired: false,
      requestId,
      signIn: false,
      status,
      title: "Resource not found",
    };
  }
  if (status !== null && status >= 500) {
    return {
      canRetry: true,
      description:
        "The service is temporarily unavailable. Retry without changing your current work.",
      reloadRequired: false,
      requestId,
      signIn: false,
      status,
      title: "Service temporarily unavailable",
    };
  }
  return {
    canRetry: true,
    description:
      "The page encountered an unexpected error. Retry, or refresh the browser if the problem continues.",
    reloadRequired: false,
    requestId,
    signIn: false,
    status,
    title: "This page could not be displayed",
  };
}

function isModuleLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|Unable to preload CSS/i.test(
    `${error.name} ${error.message}`,
  );
}
