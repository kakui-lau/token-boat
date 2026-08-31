import { useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { KeyRoundIcon, LoaderCircleIcon, LogInIcon, ShieldCheckIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@token-boat/ui/components/ui/button";
import { Alert, AlertDescription } from "@token-boat/ui/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
import { Separator } from "@token-boat/ui/components/ui/separator";
import { useSession } from "@/app/session/session-context";
import type { OAuthProvider, TwoFactorLoginChallenge } from "@/data/contracts";
import { isWebAuthnSupported } from "@/lib/webauthn";
import { AuthShell } from "../components/auth-shell";
import { AuthCapabilitiesError } from "../components/auth-capabilities-error";
import { TwoFactorLoginForm } from "../components/two-factor-login-form";
import { rememberOAuthRedirect } from "../lib/auth-redirect";
import { buildOAuthAuthorizationUrl } from "../lib/oauth";

const signInSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

type SignInValues = z.infer<typeof signInSchema>;

export function SignInPage(props: { redirectTo?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    capabilities,
    capabilitiesLoading,
    createOAuthLoginFlow,
    mode,
    signIn,
    signInWithPasskey,
  } = useSession();
  const [challenge, setChallenge] = useState<TwoFactorLoginChallenge | null>(null);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [oauthLoading, setOAuthLoading] = useState<string | null>(null);
  const authenticationLockRef = useRef(false);
  const passkeySupported = isWebAuthnSupported();
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      username: mode === "demo" ? "demo" : "",
      password: mode === "demo" ? "demo" : "",
    },
  });

  const enterConsole = () => {
    if (props.redirectTo) return navigate({ href: props.redirectTo, replace: true });
    return navigate({ to: "/", replace: true });
  };

  const submit = form.handleSubmit(async (values) => {
    if (authenticationLockRef.current) return;
    authenticationLockRef.current = true;
    try {
      const result = await signIn(values);
      if (result.kind === "two_factor") {
        setChallenge(result);
        form.setValue("password", "");
        return;
      }
      toast.success(t("Signed in successfully"));
      await enterConsole();
    } catch (error) {
      let message = t("Unable to sign in");
      if (error instanceof Error) message = error.message;
      if (error instanceof Error && error.message === "The two-factor login flow is invalid.") {
        message = t("The two-factor login flow is invalid.");
      }
      toast.error(message);
    } finally {
      authenticationLockRef.current = false;
    }
  });

  const signInWithSecurityKey = async () => {
    if (authenticationLockRef.current) return;
    if (!passkeySupported) {
      toast.error(t("Passkey is not supported on this device."));
      return;
    }
    authenticationLockRef.current = true;
    setPasskeyLoading(true);
    try {
      const authenticatedSession = await signInWithPasskey();
      if (!authenticatedSession) {
        toast.info(t("Passkey login was cancelled"));
        return;
      }
      toast.success(t("Signed in with Passkey"));
      await enterConsole();
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        toast.info(t("Passkey login was cancelled or timed out"));
      } else if (
        error instanceof Error &&
        error.message === "Passkey is not available in this browser."
      ) {
        toast.error(t("Passkey is not available in this browser."));
      } else if (error instanceof Error && error.message === "The Passkey login flow is invalid.") {
        toast.error(t("The Passkey login flow is invalid."));
      } else {
        toast.error(error instanceof Error ? error.message : t("Passkey login failed"));
      }
    } finally {
      authenticationLockRef.current = false;
      setPasskeyLoading(false);
    }
  };

  const signInWithOAuth = async (provider: OAuthProvider) => {
    if (authenticationLockRef.current) return;
    authenticationLockRef.current = true;
    setOAuthLoading(provider.id);
    try {
      const flow = await createOAuthLoginFlow(provider.id);
      rememberOAuthRedirect(flow.flowToken, props.redirectTo);
      window.location.assign(buildOAuthAuthorizationUrl(provider, flow));
    } catch (error) {
      authenticationLockRef.current = false;
      setOAuthLoading(null);
      toast.error(error instanceof Error ? t(error.message) : t("Unable to start OAuth sign-in"));
    }
  };

  const hasAlternativeMethod = Boolean(
    capabilities && (capabilities.passkeyEnabled || capabilities.oauthProviders.length > 0),
  );
  const authenticationBusy = form.formState.isSubmitting || passkeyLoading || Boolean(oauthLoading);

  return (
    <AuthShell>
      <Card className="auth-form-card w-full border-0 shadow-none">
        <CardHeader className="gap-3">
          <CardTitle className="text-3xl tracking-tight sm:text-4xl">
            {t(challenge ? "Two-factor authentication" : "Welcome back")}
          </CardTitle>
          <CardDescription>
            {t(
              challenge
                ? "Enter an authenticator code or one of your backup codes."
                : "Sign in to access your Token Boat console.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {challenge ? (
            <TwoFactorLoginForm
              challenge={challenge}
              onAuthenticated={() => void enterConsole()}
              onBack={() => setChallenge(null)}
            />
          ) : capabilitiesLoading ? (
            <div className="flex min-h-48 items-center justify-center text-muted-foreground">
              <LoaderCircleIcon
                aria-label={t("Loading sign-in options")}
                className="animate-spin"
              />
            </div>
          ) : !capabilities ? (
            <AuthCapabilitiesError
              description={t("Unable to load sign-in methods. Try again to continue.")}
            />
          ) : (
            <div className="flex flex-col gap-5">
              {capabilities.passwordEnabled ? (
                <form onSubmit={submit}>
                  <FieldGroup>
                    {mode === "demo" && (
                      <Alert>
                        <ShieldCheckIcon aria-hidden="true" />
                        <AlertDescription>
                          {t(
                            "Demo mode is active. The prefilled credentials work locally and make no network requests.",
                          )}
                        </AlertDescription>
                      </Alert>
                    )}
                    <Field data-invalid={Boolean(form.formState.errors.username)}>
                      <FieldLabel htmlFor="username">{t("Username")}</FieldLabel>
                      <Input id="username" autoComplete="username" {...form.register("username")} />
                      <FieldError errors={[form.formState.errors.username]} />
                    </Field>
                    <Field data-invalid={Boolean(form.formState.errors.password)}>
                      <FieldLabel htmlFor="password">{t("Password")}</FieldLabel>
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        {...form.register("password")}
                      />
                      <FieldError errors={[form.formState.errors.password]} />
                    </Field>
                    <Button disabled={authenticationBusy} type="submit">
                      {form.formState.isSubmitting ? (
                        <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                      ) : (
                        <LogInIcon data-icon="inline-start" />
                      )}
                      {t("Sign in")}
                    </Button>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <Link
                        className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        search={{ redirect: props.redirectTo }}
                        to="/forgot-password"
                      >
                        {t("Forgot password?")}
                      </Link>
                      {capabilities.registrationEnabled ? (
                        <Link
                          className="font-medium underline-offset-4 hover:underline"
                          search={{ aff: undefined, redirect: props.redirectTo }}
                          to="/register"
                        >
                          {t("Create account")}
                        </Link>
                      ) : null}
                    </div>
                  </FieldGroup>
                </form>
              ) : null}

              {capabilities.passwordEnabled && hasAlternativeMethod ? (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Separator className="flex-1" />
                  <span>{t("or")}</span>
                  <Separator className="flex-1" />
                </div>
              ) : null}

              {capabilities.passkeyEnabled ? (
                <>
                  <Button
                    disabled={authenticationBusy || !passkeySupported}
                    onClick={() => void signInWithSecurityKey()}
                    type="button"
                    variant="outline"
                  >
                    {passkeyLoading ? (
                      <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                    ) : (
                      <KeyRoundIcon data-icon="inline-start" />
                    )}
                    {t("Sign in with Passkey")}
                  </Button>
                  {!passkeySupported ? (
                    <p className="text-xs text-muted-foreground">
                      {t("Passkey is not supported on this device.")}
                    </p>
                  ) : null}
                </>
              ) : null}

              {capabilities.oauthProviders.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {capabilities.oauthProviders.map((provider) => (
                    <Button
                      disabled={authenticationBusy}
                      key={provider.id}
                      onClick={() => void signInWithOAuth(provider)}
                      type="button"
                      variant="outline"
                    >
                      {oauthLoading === provider.id ? (
                        <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                      ) : (
                        <LogInIcon data-icon="inline-start" />
                      )}
                      {t("Continue with {{provider}}", { provider: provider.name })}
                    </Button>
                  ))}
                </div>
              ) : null}

              {!capabilities.passwordEnabled &&
              !capabilities.passkeyEnabled &&
              capabilities.oauthProviders.length === 0 ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    {t("No sign-in method is currently available. Contact your administrator.")}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
