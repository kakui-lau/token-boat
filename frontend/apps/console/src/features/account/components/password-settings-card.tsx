import { useState } from "react";
import { ApiClientError } from "@token-boat/api-client";
import { useMutation } from "@tanstack/react-query";
import { KeyRoundIcon, LoaderCircleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@token-boat/ui/components/ui/button";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Card, CardFooter } from "@token-boat/ui/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@token-boat/ui/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
import type { AccountSecurityResult } from "@/data/contracts";
import { repository } from "@/data/repository";
import { useActionLock } from "@/hooks/use-action-lock";
import { EVMWalletButton } from "@/features/auth/components/evm-wallet-button";
import {
  SecurityMethodCardHeader,
  securityMethodCardClassName,
} from "./security-method-card-header";

type PasswordSettingsCardProps = {
  evmWalletEnabled: boolean;
  passwordSet: boolean;
  onUpdated(result: AccountSecurityResult): void;
};

type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type PasswordErrors = Partial<Record<keyof PasswordForm, string>>;

const EMPTY_FORM: PasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export function PasswordSettingsCard(props: PasswordSettingsCardProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PasswordForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [walletSetupBusy, setWalletSetupBusy] = useState(false);
  const changeLock = useActionLock();
  const changeMutation = useMutation({
    mutationFn: () =>
      repository.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      }),
    onSuccess: (result) => {
      props.onUpdated(result);
      setOpen(false);
      setForm(EMPTY_FORM);
      setErrors({});
      toast.success(t("Password changed"), {
        description: t("Your password has been updated and this session remains active."),
      });
    },
    onError: (error) =>
      toast.error(error instanceof ApiClientError ? error.message : t("Unable to change password")),
    onSettled: changeLock.release,
  });

  const pending = changeMutation.isPending || walletSetupBusy;
  const setupPasswordValid =
    form.newPassword.length >= 8 &&
    form.newPassword.length <= 20 &&
    form.confirmPassword === form.newPassword;

  const closeDialog = () => {
    if (pending) return;
    setOpen(false);
    setForm(EMPTY_FORM);
    setErrors({});
    changeMutation.reset();
  };

  const submitPassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: PasswordErrors = {};
    if (props.passwordSet && !form.currentPassword) {
      nextErrors.currentPassword = t("Enter your current password.");
    }
    if (!form.newPassword) {
      nextErrors.newPassword = t("Enter a new password.");
    } else if (form.newPassword.length < 8 || form.newPassword.length > 20) {
      nextErrors.newPassword = t("Password must be between 8 and 20 characters.");
    } else if (props.passwordSet && form.newPassword === form.currentPassword) {
      nextErrors.newPassword = t("New password must be different from the current password.");
    }
    if (form.confirmPassword !== form.newPassword) {
      nextErrors.confirmPassword = t("Passwords do not match");
    }
    setErrors(nextErrors);
    if (!props.passwordSet || Object.keys(nextErrors).length > 0 || !changeLock.tryAcquire())
      return;
    changeMutation.mutate();
  };

  return (
    <>
      <Card className={securityMethodCardClassName}>
        <SecurityMethodCardHeader
          description={
            props.passwordSet
              ? t("Update the password used to sign in to this account.")
              : t("Add a password as another way to sign in to this account.")
          }
          icon={KeyRoundIcon}
          status={
            <Badge variant={props.passwordSet ? "secondary" : "outline"}>
              {props.passwordSet ? t("Enabled") : t("Not enabled")}
            </Badge>
          }
          title={t("Password")}
        />
        <CardFooter className="mt-auto">
          <Button onClick={() => setOpen(true)} size="sm">
            <KeyRoundIcon data-icon="inline-start" />
            {props.passwordSet ? t("Change password") : t("Set password")}
          </Button>
        </CardFooter>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setOpen(true);
          else closeDialog();
        }}
      >
        <DialogContent closeLabel={t("Close")} showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>
              {props.passwordSet ? t("Change password") : t("Set password")}
            </DialogTitle>
            <DialogDescription>
              {props.passwordSet
                ? t("Your current session stays active; all other sessions will be signed out.")
                : t(
                    "Create the first password after verifying the EVM wallet bound to this account.",
                  )}
            </DialogDescription>
          </DialogHeader>
          <form id="change-password-form" onSubmit={submitPassword}>
            <FieldGroup>
              {props.passwordSet && (
                <Field data-invalid={Boolean(errors.currentPassword)}>
                  <FieldLabel htmlFor="current-password">{t("Current password")}</FieldLabel>
                  <Input
                    aria-invalid={Boolean(errors.currentPassword)}
                    autoComplete="current-password"
                    disabled={pending}
                    id="current-password"
                    onChange={(event) => {
                      setForm((current) => ({ ...current, currentPassword: event.target.value }));
                      setErrors((current) => ({ ...current, currentPassword: undefined }));
                    }}
                    type="password"
                    value={form.currentPassword}
                  />
                  <FieldError errors={[{ message: errors.currentPassword }]} />
                </Field>
              )}
              <Field data-invalid={Boolean(errors.newPassword)}>
                <FieldLabel htmlFor="new-password">{t("New password")}</FieldLabel>
                <Input
                  aria-invalid={Boolean(errors.newPassword)}
                  autoComplete="new-password"
                  disabled={pending}
                  id="new-password"
                  maxLength={20}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, newPassword: event.target.value }));
                    setErrors((current) => ({ ...current, newPassword: undefined }));
                  }}
                  type="password"
                  value={form.newPassword}
                />
                {!errors.newPassword && (
                  <FieldDescription>{t("Use 8 to 20 characters.")}</FieldDescription>
                )}
                <FieldError errors={[{ message: errors.newPassword }]} />
              </Field>
              <Field data-invalid={Boolean(errors.confirmPassword)}>
                <FieldLabel htmlFor="confirm-new-password">{t("Confirm new password")}</FieldLabel>
                <Input
                  aria-invalid={Boolean(errors.confirmPassword)}
                  autoComplete="new-password"
                  disabled={pending}
                  id="confirm-new-password"
                  maxLength={20}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, confirmPassword: event.target.value }));
                    setErrors((current) => ({ ...current, confirmPassword: undefined }));
                  }}
                  type="password"
                  value={form.confirmPassword}
                />
                <FieldError errors={[{ message: errors.confirmPassword }]} />
              </Field>
            </FieldGroup>
          </form>
          {!props.passwordSet && !props.evmWalletEnabled && (
            <Alert variant="destructive">
              <KeyRoundIcon />
              <AlertTitle>{t("Wallet verification unavailable")}</AlertTitle>
              <AlertDescription>
                {t("Bind an EVM wallet before setting the first password.")}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button disabled={pending} onClick={closeDialog} variant="outline">
              {t("Cancel")}
            </Button>
            {props.passwordSet ? (
              <Button disabled={pending} form="change-password-form" type="submit">
                {changeMutation.isPending && (
                  <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                )}
                {changeMutation.isPending ? t("Changing password…") : t("Change password")}
              </Button>
            ) : (
              <div className="min-w-0 flex-1 sm:max-w-sm">
                <EVMWalletButton
                  beginChallenge={repository.beginEVMWalletPasswordSetup}
                  buttonLabel="Verify wallet and set password"
                  completeChallenge={async (input) => {
                    const result = await repository.completeEVMWalletPasswordSetup({
                      ...input,
                      newPassword: form.newPassword,
                    });
                    props.onUpdated(result);
                  }}
                  description="Sign once to confirm ownership of the wallet bound to this account."
                  disabled={!props.evmWalletEnabled || !setupPasswordValid}
                  errorMessage="Unable to set password"
                  intent="login"
                  onAuthenticated={() => {
                    setOpen(false);
                    setForm(EMPTY_FORM);
                    setErrors({});
                  }}
                  onBusyChange={setWalletSetupBusy}
                  successMessage="Password set"
                  walletDialogDescription="Select the wallet already bound to this account."
                />
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
