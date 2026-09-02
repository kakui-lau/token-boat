import { useState } from "react";
import { LoaderCircleIcon, MailIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@token-boat/ui/components/ui/button";
import {
  Field,
  FieldDescription,
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
import type { UpdateProfileInput } from "@/data/contracts";
import { useCountdown } from "@/hooks/use-countdown";
import { Turnstile } from "@/features/auth/components/turnstile";

type ProfileInformationFormProps = {
  pending: boolean;
  savedEmail: string;
  usernameEditable: boolean;
  value: UpdateProfileInput;
  onChange(value: UpdateProfileInput): void;
  onSubmit(): void;
};

export function ProfileInformationForm(props: ProfileInformationFormProps) {
  const { t } = useTranslation();
  const { capabilities, sendEmailVerification } = useSession();
  const countdown = useCountdown();
  const [sendingCode, setSendingCode] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const emailChanged = props.value.email.trim().toLowerCase() !== props.savedEmail.toLowerCase();
  const emailVerificationRequired = capabilities?.emailVerificationEnabled === true && emailChanged;
  const turnstileRequired = Boolean(
    emailVerificationRequired && capabilities?.turnstileEnabled && capabilities.turnstileSiteKey,
  );
  const verificationReady =
    !emailVerificationRequired || props.value.verificationCode?.trim().length === 6;
  const valid =
    props.value.username.trim().length > 0 &&
    props.value.displayName.trim().length > 0 &&
    verificationReady;

  const resetHumanVerification = () => {
    setTurnstileToken("");
    setTurnstileKey((current) => current + 1);
  };

  const sendVerificationCode = async () => {
    const email = props.value.email.trim().toLowerCase();
    if (!email || sendingCode || countdown.seconds > 0) return;
    if (turnstileRequired && !turnstileToken) {
      toast.info(t("Complete the human verification first"));
      return;
    }
    setSendingCode(true);
    try {
      await sendEmailVerification({ email, turnstileToken: turnstileToken || undefined });
      countdown.start();
      toast.success(t("Verification email sent"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Unable to send verification email"));
    } finally {
      if (turnstileRequired) resetHumanVerification();
      setSendingCode(false);
    }
  };

  return (
    <form
      className="max-w-xl"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) props.onSubmit();
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="account-username">{t("Username")}</FieldLabel>
          <Input
            autoComplete="username"
            disabled={!props.usernameEditable || props.pending}
            id="account-username"
            maxLength={20}
            onChange={(event) => props.onChange({ ...props.value, username: event.target.value })}
            value={props.value.username}
          />
          <FieldDescription>
            {props.usernameEditable
              ? t("Set your username once. It cannot be changed after you save it.")
              : t("Your username is fixed after it is set.")}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="display-name">{t("Display name")}</FieldLabel>
          <Input
            id="display-name"
            maxLength={20}
            onChange={(event) =>
              props.onChange({ ...props.value, displayName: event.target.value })
            }
            value={props.value.displayName}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-email">{t("Email")}</FieldLabel>
          <Input
            autoComplete="email"
            id="account-email"
            maxLength={50}
            onChange={(event) =>
              props.onChange({
                ...props.value,
                email: event.target.value,
                verificationCode: "",
              })
            }
            type="email"
            value={props.value.email}
          />
          <FieldDescription>
            {t("Email addresses are verified before they are linked and must be unique.")}
          </FieldDescription>
        </Field>
        {emailVerificationRequired ? (
          <>
            {turnstileRequired && capabilities ? (
              <Turnstile
                key={turnstileKey}
                onExpire={() => setTurnstileToken("")}
                onVerify={setTurnstileToken}
                siteKey={capabilities.turnstileSiteKey}
              />
            ) : null}
            <Field>
              <FieldLabel htmlFor="account-verification-code">
                {t("Email verification code")}
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  autoComplete="one-time-code"
                  id="account-verification-code"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) =>
                    props.onChange({ ...props.value, verificationCode: event.target.value })
                  }
                  value={props.value.verificationCode ?? ""}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    disabled={props.pending || sendingCode || countdown.seconds > 0}
                    onClick={() => void sendVerificationCode()}
                  >
                    {sendingCode ? <LoaderCircleIcon className="animate-spin" /> : <MailIcon />}
                    {countdown.seconds > 0
                      ? t("Resend in {{seconds}}s", { seconds: countdown.seconds })
                      : t("Send code")}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </>
        ) : null}
        <Button className="w-fit" disabled={!valid || props.pending} type="submit">
          {props.pending ? (
            <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
          ) : null}
          {t("Save changes")}
        </Button>
      </FieldGroup>
    </form>
  );
}
