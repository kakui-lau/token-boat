import { useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { LoaderCircleIcon, MailCheckIcon, SendIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
import { useSession } from "@/app/session/session-context";
import { useCountdown } from "@/hooks/use-countdown";
import { AuthShell } from "../components/auth-shell";
import { AuthCapabilitiesError } from "../components/auth-capabilities-error";
import { Turnstile } from "../components/turnstile";

type ForgotPasswordValues = { email: string };

export function ForgotPasswordPage(props: { redirectTo?: string }) {
  const { t } = useTranslation();
  const { capabilities, capabilitiesLoading, requestPasswordReset } = useSession();
  const [sent, setSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const resetRequestLockRef = useRef(false);
  const countdown = useCountdown();
  const schema = useMemo(
    () => z.object({ email: z.string().trim().email(t("Enter a valid email address")) }),
    [t],
  );
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });
  const turnstileRequired = Boolean(
    capabilities?.turnstileEnabled && capabilities.turnstileSiteKey,
  );

  const submit = form.handleSubmit(async (values) => {
    if (resetRequestLockRef.current) return;
    if (turnstileRequired && !turnstileToken) {
      toast.info(t("Complete the human verification first"));
      return;
    }
    resetRequestLockRef.current = true;
    try {
      await requestPasswordReset({
        email: values.email.trim(),
        turnstileToken: turnstileToken || undefined,
      });
      setSent(true);
      countdown.start();
      if (turnstileRequired) {
        setTurnstileToken("");
        setTurnstileKey((current) => current + 1);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Unable to send reset email"));
    } finally {
      resetRequestLockRef.current = false;
    }
  });

  return (
    <AuthShell>
      <Card className="auth-form-card w-full border-0 shadow-none">
        <CardHeader>
          <CardTitle className="text-2xl">{t("Reset your password")}</CardTitle>
          <CardDescription>
            {t("Enter the email bound to your account. We will send a time-limited reset link.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {capabilitiesLoading ? (
            <div className="flex min-h-48 items-center justify-center text-muted-foreground">
              <LoaderCircleIcon aria-label={t("Loading reset options")} className="animate-spin" />
            </div>
          ) : !capabilities ? (
            <AuthCapabilitiesError
              description={t("Unable to load password reset settings. Try again to continue.")}
            />
          ) : (
            <form onSubmit={submit}>
              <FieldGroup>
                {sent ? (
                  <Alert>
                    <MailCheckIcon aria-hidden="true" />
                    <AlertTitle>{t("Check your inbox")}</AlertTitle>
                    <AlertDescription>
                      {t(
                        "If an account matches this email, a reset link has been sent. The same message is shown for unknown emails.",
                      )}
                    </AlertDescription>
                  </Alert>
                ) : null}
                <Field data-invalid={Boolean(form.formState.errors.email)}>
                  <FieldLabel htmlFor="reset-email">{t("Email")}</FieldLabel>
                  <Input
                    aria-invalid={Boolean(form.formState.errors.email)}
                    autoComplete="email"
                    id="reset-email"
                    type="email"
                    {...form.register("email")}
                  />
                  <FieldError errors={[form.formState.errors.email]} />
                </Field>
                {turnstileRequired ? (
                  <Turnstile
                    key={turnstileKey}
                    onExpire={() => setTurnstileToken("")}
                    onVerify={setTurnstileToken}
                    siteKey={capabilities.turnstileSiteKey}
                  />
                ) : null}
                <Button
                  disabled={form.formState.isSubmitting || countdown.seconds > 0}
                  type="submit"
                >
                  {form.formState.isSubmitting ? (
                    <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <SendIcon data-icon="inline-start" />
                  )}
                  {countdown.seconds > 0
                    ? t("Resend in {{seconds}}s", { seconds: countdown.seconds })
                    : t("Send reset email")}
                </Button>
                <Button
                  nativeButton={false}
                  render={<Link search={{ redirect: props.redirectTo }} to="/sign-in" />}
                  variant="outline"
                >
                  {t("Back to sign in")}
                </Button>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
