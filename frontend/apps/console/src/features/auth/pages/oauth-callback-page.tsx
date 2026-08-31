import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import { useSession } from "@/app/session/session-context";
import type { OAuthCallbackInput } from "@/data/contracts";
import { AuthShell } from "../components/auth-shell";
import { takeOAuthRedirect } from "../lib/auth-redirect";

type OAuthCallbackPageProps = OAuthCallbackInput;

export function OAuthCallbackPage(props: OAuthCallbackPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { completeOAuthLogin } = useSession();
  const startedRef = useRef(false);
  const mountedRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const { code, error: providerError, errorDescription, provider, state } = props;
  const [redirectTo] = useState(() => takeOAuthRedirect(state));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!state || (!code && !providerError)) {
      setError(t("The OAuth callback is incomplete or invalid."));
      return;
    }

    void completeOAuthLogin({
      code,
      error: providerError,
      errorDescription,
      provider,
      state,
    })
      .then(() => {
        if (!mountedRef.current) return;
        if (redirectTo) return navigate({ href: redirectTo, replace: true });
        return navigate({ to: "/", replace: true });
      })
      .catch((reason: unknown) => {
        if (!mountedRef.current) return;
        setError(reason instanceof Error ? reason.message : t("Unable to complete OAuth sign-in"));
      });
  }, [
    code,
    completeOAuthLogin,
    errorDescription,
    navigate,
    provider,
    providerError,
    redirectTo,
    state,
    t,
  ]);

  return (
    <AuthShell>
      <Card className="auth-form-card w-full border-0 shadow-none">
        <CardHeader>
          <CardTitle className="text-2xl">{t("Completing sign-in")}</CardTitle>
          <CardDescription>{t("Verifying the authorization response securely.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <Alert variant="destructive">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertTitle>{t("OAuth sign-in failed")}</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-4">
                <span>{error}</span>
                <Button
                  nativeButton={false}
                  render={<Link search={{ redirect: redirectTo }} to="/sign-in" />}
                  variant="outline"
                >
                  {t("Back to sign in")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
              <LoaderCircleIcon aria-hidden="true" className="size-5 animate-spin" />
              {t("Please wait while we finish signing you in.")}
            </div>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
