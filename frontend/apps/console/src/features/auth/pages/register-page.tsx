import { useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { LoaderCircleIcon, MailIcon, UserPlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription } from "@token-boat/ui/components/ui/alert";
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@token-boat/ui/components/ui/input-group";
import { useSession } from "@/app/session/session-context";
import { useCountdown } from "@/hooks/use-countdown";
import { AuthShell } from "../components/auth-shell";
import { AuthCapabilitiesError } from "../components/auth-capabilities-error";
import { Turnstile } from "../components/turnstile";

type RegisterValues = {
  confirmPassword: string;
  email: string;
  password: string;
  username: string;
  verificationCode: string;
};

export function RegisterPage(props: { affiliateCode?: string; redirectTo?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { capabilities, capabilitiesLoading, register, sendEmailVerification } = useSession();
  const [sendingCode, setSendingCode] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const registrationLockRef = useRef(false);
  const countdown = useCountdown();
  const emailVerificationEnabled = capabilities?.emailVerificationEnabled === true;
  const schema = useMemo(
    () =>
      z
        .object({
          username: z
            .string()
            .trim()
            .min(1, t("Enter a username"))
            .max(20, t("Username must be at most 20 characters")),
          email: emailVerificationEnabled
            ? z.string().trim().email(t("Enter a valid email address"))
            : z.union([z.literal(""), z.string().trim().email(t("Enter a valid email address"))]),
          password: z
            .string()
            .min(8, t("Password must be 8 to 20 characters"))
            .max(20, t("Password must be 8 to 20 characters")),
          confirmPassword: z.string(),
          verificationCode: emailVerificationEnabled
            ? z.string().trim().length(6, t("Enter the six-digit email code"))
            : z.string(),
        })
        .refine((values) => values.password === values.confirmPassword, {
          message: t("Passwords do not match"),
          path: ["confirmPassword"],
        }),
    [emailVerificationEnabled, t],
  );
  const form = useForm<RegisterValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      confirmPassword: "",
      email: "",
      password: "",
      username: "",
      verificationCode: "",
    },
  });
  const turnstileRequired = Boolean(
    capabilities?.turnstileEnabled && capabilities.turnstileSiteKey,
  );
  const registrationBusy = sendingCode || form.formState.isSubmitting;

  const sendVerificationCode = async () => {
    if (registrationLockRef.current) return;
    registrationLockRef.current = true;
    const valid = await form.trigger("email");
    if (!valid) {
      registrationLockRef.current = false;
      return;
    }
    if (turnstileRequired && !turnstileToken) {
      registrationLockRef.current = false;
      toast.info(t("Complete the human verification first"));
      return;
    }
    setSendingCode(true);
    try {
      await sendEmailVerification({
        email: form.getValues("email").trim(),
        turnstileToken: turnstileToken || undefined,
      });
      countdown.start();
      toast.success(t("Verification email sent"));
      if (turnstileRequired) {
        setTurnstileToken("");
        setTurnstileKey((current) => current + 1);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Unable to send verification email"));
    } finally {
      registrationLockRef.current = false;
      setSendingCode(false);
    }
  };

  const submit = form.handleSubmit(async (values) => {
    if (registrationLockRef.current) return;
    if (turnstileRequired && !turnstileToken) {
      toast.info(t("Complete the human verification first"));
      return;
    }
    registrationLockRef.current = true;
    try {
      await register({
        affiliateCode: props.affiliateCode,
        email: values.email.trim() || undefined,
        password: values.password,
        turnstileToken: turnstileToken || undefined,
        username: values.username.trim(),
        verificationCode: values.verificationCode.trim() || undefined,
      });
      toast.success(t("Account created. Sign in to continue."));
      await navigate({
        to: "/sign-in",
        replace: true,
        search: { redirect: props.redirectTo },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Unable to create account"));
    } finally {
      registrationLockRef.current = false;
    }
  });

  return (
    <AuthShell>
      <Card className="auth-form-card w-full border-0 shadow-none">
        <CardHeader className="gap-3">
          <CardTitle className="text-3xl tracking-tight sm:text-4xl">
            {t("Create your Token Boat account")}
          </CardTitle>
          <CardDescription>
            {t("Start with one secure account for every model, key, and request.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {capabilitiesLoading ? (
            <div className="flex min-h-48 items-center justify-center text-muted-foreground">
              <LoaderCircleIcon
                aria-label={t("Loading sign-up options")}
                className="animate-spin"
              />
            </div>
          ) : !capabilities ? (
            <FieldGroup>
              <AuthCapabilitiesError
                description={t("Unable to load registration settings. Try again to continue.")}
              />
              <Button
                nativeButton={false}
                render={<Link search={{ redirect: props.redirectTo }} to="/sign-in" />}
                variant="outline"
              >
                {t("Back to sign in")}
              </Button>
            </FieldGroup>
          ) : !capabilities.registrationEnabled ? (
            <FieldGroup>
              <Alert variant="destructive">
                <AlertDescription>
                  {t("Account registration is currently unavailable. Contact your administrator.")}
                </AlertDescription>
              </Alert>
              <Button
                nativeButton={false}
                render={<Link search={{ redirect: props.redirectTo }} to="/sign-in" />}
                variant="outline"
              >
                {t("Back to sign in")}
              </Button>
            </FieldGroup>
          ) : (
            <form onSubmit={submit}>
              <FieldGroup>
                <Field data-invalid={Boolean(form.formState.errors.username)}>
                  <FieldLabel htmlFor="register-username">{t("Username")}</FieldLabel>
                  <Input
                    autoComplete="username"
                    id="register-username"
                    aria-invalid={Boolean(form.formState.errors.username)}
                    {...form.register("username")}
                  />
                  <FieldError errors={[form.formState.errors.username]} />
                </Field>
                <Field data-invalid={Boolean(form.formState.errors.email)}>
                  <FieldLabel htmlFor="register-email">{t("Email")}</FieldLabel>
                  {emailVerificationEnabled ? (
                    <InputGroup>
                      <InputGroupInput
                        aria-invalid={Boolean(form.formState.errors.email)}
                        autoComplete="email"
                        id="register-email"
                        type="email"
                        {...form.register("email")}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          disabled={registrationBusy || countdown.seconds > 0}
                          onClick={() => void sendVerificationCode()}
                        >
                          {sendingCode ? (
                            <LoaderCircleIcon className="animate-spin" />
                          ) : (
                            <MailIcon />
                          )}
                          {countdown.seconds > 0
                            ? t("Resend in {{seconds}}s", { seconds: countdown.seconds })
                            : t("Send code")}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                  ) : (
                    <Input
                      aria-invalid={Boolean(form.formState.errors.email)}
                      autoComplete="email"
                      id="register-email"
                      type="email"
                      {...form.register("email")}
                    />
                  )}
                  {!emailVerificationEnabled ? (
                    <FieldDescription>{t("Optional")}</FieldDescription>
                  ) : null}
                  <FieldError errors={[form.formState.errors.email]} />
                </Field>
                {emailVerificationEnabled ? (
                  <Field data-invalid={Boolean(form.formState.errors.verificationCode)}>
                    <FieldLabel htmlFor="register-verification-code">
                      {t("Email verification code")}
                    </FieldLabel>
                    <Input
                      aria-invalid={Boolean(form.formState.errors.verificationCode)}
                      autoComplete="one-time-code"
                      id="register-verification-code"
                      inputMode="numeric"
                      maxLength={6}
                      {...form.register("verificationCode")}
                    />
                    <FieldError errors={[form.formState.errors.verificationCode]} />
                  </Field>
                ) : null}
                <Field data-invalid={Boolean(form.formState.errors.password)}>
                  <FieldLabel htmlFor="register-password">{t("Password")}</FieldLabel>
                  <Input
                    aria-invalid={Boolean(form.formState.errors.password)}
                    autoComplete="new-password"
                    id="register-password"
                    type="password"
                    {...form.register("password")}
                  />
                  <FieldDescription>{t("Use 8 to 20 characters.")}</FieldDescription>
                  <FieldError errors={[form.formState.errors.password]} />
                </Field>
                <Field data-invalid={Boolean(form.formState.errors.confirmPassword)}>
                  <FieldLabel htmlFor="register-confirm-password">
                    {t("Confirm password")}
                  </FieldLabel>
                  <Input
                    aria-invalid={Boolean(form.formState.errors.confirmPassword)}
                    autoComplete="new-password"
                    id="register-confirm-password"
                    type="password"
                    {...form.register("confirmPassword")}
                  />
                  <FieldError errors={[form.formState.errors.confirmPassword]} />
                </Field>
                {turnstileRequired ? (
                  <Turnstile
                    key={turnstileKey}
                    onExpire={() => setTurnstileToken("")}
                    onVerify={setTurnstileToken}
                    siteKey={capabilities.turnstileSiteKey}
                  />
                ) : null}
                <Button disabled={registrationBusy} type="submit">
                  {form.formState.isSubmitting ? (
                    <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <UserPlusIcon data-icon="inline-start" />
                  )}
                  {t("Create account")}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  {t("Already have an account?")}{" "}
                  <Link
                    className="font-medium text-foreground underline underline-offset-4"
                    search={{ redirect: props.redirectTo }}
                    to="/sign-in"
                  >
                    {t("Sign in")}
                  </Link>
                </p>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
