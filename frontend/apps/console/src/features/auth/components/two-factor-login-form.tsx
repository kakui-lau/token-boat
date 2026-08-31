import { useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircleIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@token-boat/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@token-boat/ui/components/ui/input-otp";
import { Separator } from "@token-boat/ui/components/ui/separator";
import { useSession } from "@/app/session/session-context";
import type { TwoFactorLoginChallenge } from "@/data/contracts";

const twoFactorSchema = z.object({ code: z.string() });
const totpPattern = /^\d{6}$/u;
const backupCodePattern = /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/u;

type TwoFactorValues = z.infer<typeof twoFactorSchema>;

type TwoFactorLoginFormProps = {
  challenge: TwoFactorLoginChallenge;
  onAuthenticated(): void;
  onBack(): void;
};

export function TwoFactorLoginForm(props: TwoFactorLoginFormProps) {
  const { t } = useTranslation();
  const { verifyTwoFactorLogin } = useSession();
  const [useBackupCode, setUseBackupCode] = useState(false);
  const verificationLockRef = useRef(false);
  const form = useForm<TwoFactorValues>({
    resolver: zodResolver(twoFactorSchema),
    defaultValues: { code: "" },
  });
  const code = form.watch("code");
  const codeIsComplete = useBackupCode ? backupCodePattern.test(code) : totpPattern.test(code);

  const submit = form.handleSubmit(async (values) => {
    if (verificationLockRef.current) return;
    const valid = useBackupCode
      ? backupCodePattern.test(values.code)
      : totpPattern.test(values.code);
    if (!valid) {
      form.setError("code", {
        message: t(
          useBackupCode
            ? "Enter a backup code in XXXX-XXXX format."
            : "Enter the 6-digit verification code.",
        ),
      });
      return;
    }

    verificationLockRef.current = true;
    try {
      await verifyTwoFactorLogin({
        code: values.code.replaceAll("-", ""),
        flowToken: props.challenge.flowToken,
      });
      toast.success(t("Signed in successfully"));
      props.onAuthenticated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Unable to verify the code"));
    } finally {
      verificationLockRef.current = false;
    }
  });

  const toggleMode = () => {
    setUseBackupCode((current) => !current);
    form.reset({ code: "" });
  };

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.code)}>
          <FieldLabel htmlFor="two-factor-code">
            {t(useBackupCode ? "Backup code" : "Verification code")}
          </FieldLabel>
          {useBackupCode ? (
            <Input
              aria-invalid={Boolean(form.formState.errors.code)}
              autoComplete="off"
              className="font-mono uppercase"
              id="two-factor-code"
              maxLength={9}
              onChange={(event) =>
                form.setValue("code", formatBackupCode(event.target.value), {
                  shouldValidate: true,
                })
              }
              placeholder="XXXX-XXXX"
              value={code}
            />
          ) : (
            <InputOTP
              aria-invalid={Boolean(form.formState.errors.code)}
              autoComplete="one-time-code"
              containerClassName="justify-between"
              id="two-factor-code"
              inputMode="numeric"
              maxLength={6}
              onChange={(value) => form.setValue("code", value, { shouldValidate: true })}
              pattern="^\\d+$"
              value={code}
            >
              <InputOTPGroup>
                <InputOTPSlot className="size-11 sm:size-12" index={0} />
                <InputOTPSlot className="size-11 sm:size-12" index={1} />
                <InputOTPSlot className="size-11 sm:size-12" index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot className="size-11 sm:size-12" index={3} />
                <InputOTPSlot className="size-11 sm:size-12" index={4} />
                <InputOTPSlot className="size-11 sm:size-12" index={5} />
              </InputOTPGroup>
            </InputOTP>
          )}
          <FieldDescription>
            {t(
              useBackupCode
                ? "Each backup code can only be used once."
                : "Enter the code from your authenticator app.",
            )}
          </FieldDescription>
          <FieldError errors={[form.formState.errors.code]} />
        </Field>
        <Button disabled={!codeIsComplete || form.formState.isSubmitting} type="submit">
          {form.formState.isSubmitting ? (
            <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
          ) : null}
          {t("Verify and sign in")}
        </Button>
        <div className="flex items-center justify-center gap-3">
          <Button className="h-auto p-0" onClick={toggleMode} type="button" variant="link">
            {t(useBackupCode ? "Use authenticator code" : "Use backup code")}
          </Button>
          <Separator className="h-4" orientation="vertical" />
          <Button className="h-auto p-0" onClick={props.onBack} type="button" variant="link">
            {t("Back to password")}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function formatBackupCode(value: string): string {
  const cleaned = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, "")
    .slice(0, 8);
  return cleaned.length > 4 ? `${cleaned.slice(0, 4)}-${cleaned.slice(4)}` : cleaned;
}
