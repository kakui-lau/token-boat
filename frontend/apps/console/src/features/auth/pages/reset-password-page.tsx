import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@token-boat/ui/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@token-boat/ui/components/ui/input-group";
import { useSession } from "@/app/session/session-context";
import { copyText } from "@/lib/clipboard";
import { AuthShell } from "../components/auth-shell";

type ResetPasswordPageProps = {
  email?: string;
  token?: string;
};

export function ResetPasswordPage({ email, token }: ResetPasswordPageProps) {
  const { t } = useTranslation();
  const { confirmPasswordReset } = useSession();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const resetLockRef = useRef(false);
  const validLink = Boolean(email && token);

  const reset = async () => {
    if (!email || !token || resetLockRef.current) return;
    resetLockRef.current = true;
    setLoading(true);
    try {
      setNewPassword(await confirmPasswordReset({ email, token }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Unable to reset password"));
    } finally {
      resetLockRef.current = false;
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await copyText(newPassword);
      setCopied(true);
      toast.success(t("Password copied"));
      if (copyFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
      copyFeedbackTimeoutRef.current = window.setTimeout(() => {
        copyFeedbackTimeoutRef.current = null;
        setCopied(false);
      }, 2000);
    } catch {
      toast.error(t("Unable to copy password"));
    }
  };

  useEffect(
    () => () => {
      if (copyFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
    },
    [],
  );

  return (
    <AuthShell>
      <Card className="auth-form-card w-full border-0 shadow-none">
        <CardHeader>
          <CardTitle className="text-2xl">{t("Reset your password")}</CardTitle>
          <CardDescription>
            {newPassword
              ? t("Your new password is shown once. Save it before leaving this page.")
              : t("Confirm the reset request to generate a new secure password.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {!validLink ? (
              <Alert variant="destructive">
                <TriangleAlertIcon aria-hidden="true" />
                <AlertTitle>{t("Invalid reset link")}</AlertTitle>
                <AlertDescription>
                  {t("This reset link is incomplete or invalid. Request a new email to continue.")}
                </AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <FieldLabel htmlFor="reset-account-email">{t("Email")}</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="reset-account-email"
                  readOnly
                  type="email"
                  value={email ?? ""}
                />
              </InputGroup>
            </Field>
            {newPassword ? (
              <>
                <Alert>
                  <KeyRoundIcon aria-hidden="true" />
                  <AlertTitle>{t("Password reset complete")}</AlertTitle>
                  <AlertDescription>
                    {t(
                      "All existing sessions have been revoked. Sign in again with this password.",
                    )}
                  </AlertDescription>
                </Alert>
                <Field>
                  <FieldLabel htmlFor="generated-password">{t("New password")}</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      className="font-mono"
                      id="generated-password"
                      readOnly
                      value={newPassword}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        aria-label={t("Copy password")}
                        onClick={() => void copy()}
                        size="icon-xs"
                      >
                        {copied ? <CheckIcon /> : <CopyIcon />}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>
                    {t("Store this password in a password manager. It cannot be shown again.")}
                  </FieldDescription>
                </Field>
                <Button
                  nativeButton={false}
                  render={<Link search={{ redirect: undefined }} to="/sign-in" />}
                >
                  {t("Sign in with new password")}
                </Button>
              </>
            ) : (
              <Button disabled={!validLink || loading} onClick={() => void reset()} type="button">
                {loading ? (
                  <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                ) : (
                  <KeyRoundIcon data-icon="inline-start" />
                )}
                {t("Confirm password reset")}
              </Button>
            )}
            {!newPassword ? (
              <Button
                nativeButton={false}
                render={<Link search={{ redirect: undefined }} to="/forgot-password" />}
                variant="outline"
              >
                {t("Request a new reset email")}
              </Button>
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
