import type { PropsWithChildren, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { LogInIcon, RefreshCwIcon, ShieldAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { adminRepository, AdminAccessDeniedError } from "@/repository/admin-repository";
import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Button } from "@token-boat/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@token-boat/ui/components/ui/card";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";

import { AdminSessionContext } from "./admin-session-context";

const sessionRefreshLeadTimeMs = 60_000;
const minimumSessionRefreshIntervalMs = 30_000;

export function AdminSessionBoundary({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const sessionQuery = useQuery({
    queryKey: ["admin-session"],
    queryFn: ({ signal }) => adminRepository.getSession(signal),
    refetchInterval: (query) => {
      const expiresAt = query.state.data?.accessExpiresAt;
      if (!expiresAt) return false;
      return Math.max(
        minimumSessionRefreshIntervalMs,
        expiresAt * 1_000 - Date.now() - sessionRefreshLeadTimeMs,
      );
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: "always",
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (sessionQuery.isPending) return <AdminSessionLoading />;

  if (sessionQuery.isError) {
    const denied = sessionQuery.error instanceof AdminAccessDeniedError;
    return (
      <AdminSessionMessage
        action={
          denied ? (
            <Button nativeButton={false} render={<a href="/console/" />}>
              {t("session.returnToConsole")}
            </Button>
          ) : (
            <Button disabled={sessionQuery.isFetching} onClick={() => void sessionQuery.refetch()}>
              <RefreshCwIcon data-icon="inline-start" />
              {t("common.retry")}
            </Button>
          )
        }
        description={t(denied ? "session.deniedDescription" : "session.errorDescription")}
        title={t(denied ? "session.deniedTitle" : "session.errorTitle")}
      />
    );
  }

  if (!sessionQuery.data) {
    return (
      <AdminSessionMessage
        action={
          <Button nativeButton={false} render={<a href="/console/sign-in" />}>
            <LogInIcon data-icon="inline-start" />
            {t("session.signIn")}
          </Button>
        }
        description={t("session.signedOutDescription")}
        title={t("session.signedOutTitle")}
      />
    );
  }

  return <AdminSessionContext value={sessionQuery.data}>{children}</AdminSessionContext>;
}

function AdminSessionLoading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    </main>
  );
}

function AdminSessionMessage(props: { action: ReactNode; description: string; title: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert>
            <ShieldAlertIcon aria-hidden="true" />
            <AlertTitle>{props.title}</AlertTitle>
            <AlertDescription>{props.description}</AlertDescription>
          </Alert>
          <div>{props.action}</div>
        </CardContent>
      </Card>
    </main>
  );
}
