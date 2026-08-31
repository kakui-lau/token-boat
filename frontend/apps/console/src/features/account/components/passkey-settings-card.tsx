import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  FingerprintIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@token-boat/ui/components/ui/alert-dialog";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@token-boat/ui/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
import type { AccountData, AccountSecurityResult } from "@/data/contracts";
import { repository } from "@/data/repository";
import { formatDateTime } from "@/lib/format";
import { isWebAuthnSupported } from "@/lib/webauthn";

type PasskeySettingsCardProps = {
  security: AccountData["security"];
  onUpdated(result: AccountSecurityResult): void;
};

export function PasskeySettingsCard(props: PasskeySettingsCardProps) {
  const { t, i18n } = useTranslation();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerCode, setRegisterCode] = useState("");
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeCode, setRemoveCode] = useState("");
  const supported = isWebAuthnSupported();
  const locale = i18n.resolvedLanguage ?? "en";

  const registerMutation = useMutation({
    mutationFn: () =>
      repository.registerPasskey(props.security.twoFactorEnabled ? registerCode.trim() : undefined),
    onSuccess: (result) => {
      props.onUpdated(result);
      setRegisterOpen(false);
      setRegisterCode("");
      toast.success(t("Passkey registered"));
    },
    onError: (error) =>
      toast.error(
        passkeyErrorMessage(
          error,
          t("Unable to register Passkey"),
          t("Passkey verification was cancelled or timed out."),
        ),
      ),
  });
  const removeMutation = useMutation({
    mutationFn: () =>
      repository.removePasskey(props.security.twoFactorEnabled ? removeCode.trim() : undefined),
    onSuccess: (result) => {
      props.onUpdated(result);
      setRemoveOpen(false);
      setRemoveCode("");
      toast.success(t("Passkey removed"));
    },
    onError: (error) =>
      toast.error(
        passkeyErrorMessage(
          error,
          t("Unable to remove Passkey"),
          t("Passkey verification was cancelled or timed out."),
        ),
      ),
  });

  const verificationAvailable = props.security.twoFactorEnabled || supported;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FingerprintIcon className="size-4" />
            </span>
            <Badge variant={props.security.passkeyEnabled ? "secondary" : "outline"}>
              {props.security.passkeyEnabled ? t("Enabled") : t("Not enabled")}
            </Badge>
          </div>
          <CardTitle className="pt-3">{t("Passkeys")}</CardTitle>
          <CardDescription>
            {t("Use biometrics or a hardware security key for phishing-resistant sign-in.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          {props.security.passkeyLastUsedAt && (
            <p>
              {t("Last used {{time}}", {
                time: formatDateTime(props.security.passkeyLastUsedAt, locale),
              })}
            </p>
          )}
          {!supported && (
            <p>{t("This browser cannot create or verify a Passkey on this device.")}</p>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button disabled={!supported} onClick={() => setRegisterOpen(true)} size="sm">
            <KeyRoundIcon data-icon="inline-start" />
            {props.security.passkeyEnabled ? t("Replace Passkey") : t("Register Passkey")}
          </Button>
          {props.security.passkeyEnabled && (
            <Button
              disabled={!verificationAvailable}
              onClick={() => setRemoveOpen(true)}
              size="sm"
              variant="destructive"
            >
              <Trash2Icon data-icon="inline-start" />
              {t("Remove Passkey")}
            </Button>
          )}
        </CardFooter>
      </Card>

      <Dialog
        open={registerOpen}
        onOpenChange={(open) => {
          setRegisterOpen(open);
          if (!open) setRegisterCode("");
        }}
      >
        <DialogContent closeLabel={t("Close")}>
          <DialogHeader>
            <DialogTitle>
              {props.security.passkeyEnabled ? t("Replace Passkey") : t("Register Passkey")}
            </DialogTitle>
            <DialogDescription>
              {t("Your browser will ask you to use biometrics, a device PIN, or a hardware key.")}
            </DialogDescription>
          </DialogHeader>
          {props.security.twoFactorEnabled ? (
            <Field>
              <FieldLabel htmlFor="passkey-registration-code">
                {t("Authenticator or recovery code")}
              </FieldLabel>
              <Input
                autoComplete="one-time-code"
                id="passkey-registration-code"
                onChange={(event) => setRegisterCode(event.target.value)}
                value={registerCode}
              />
              <FieldDescription>
                {t("A current 2FA code is required before changing Passkeys.")}
              </FieldDescription>
            </Field>
          ) : (
            <Alert>
              <FingerprintIcon />
              <AlertTitle>{t("Browser verification required")}</AlertTitle>
              <AlertDescription>
                {t("Keep this page open while completing the browser security prompt.")}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button onClick={() => setRegisterOpen(false)} variant="outline">
              {t("Cancel")}
            </Button>
            <Button
              disabled={
                registerMutation.isPending ||
                (props.security.twoFactorEnabled && !registerCode.trim())
              }
              onClick={() => registerMutation.mutate()}
            >
              {registerMutation.isPending && (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
              )}
              {t("Continue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <ShieldAlertIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("Remove this Passkey?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "You will no longer be able to sign in or verify security actions with this Passkey.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {props.security.twoFactorEnabled ? (
            <Field>
              <FieldLabel htmlFor="passkey-removal-code">
                {t("Authenticator or recovery code")}
              </FieldLabel>
              <Input
                autoComplete="one-time-code"
                id="passkey-removal-code"
                onChange={(event) => setRemoveCode(event.target.value)}
                value={removeCode}
              />
            </Field>
          ) : (
            <Alert>
              <FingerprintIcon />
              <AlertTitle>{t("Passkey verification required")}</AlertTitle>
              <AlertDescription>
                {t("Your browser will verify the existing Passkey before removal.")}
              </AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                removeMutation.isPending || (props.security.twoFactorEnabled && !removeCode.trim())
              }
              onClick={(event) => {
                event.preventDefault();
                removeMutation.mutate();
              }}
              variant="destructive"
            >
              {removeMutation.isPending && (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
              )}
              {t("Remove Passkey")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function passkeyErrorMessage(error: Error, fallback: string, cancellation: string): string {
  if (error.name === "NotAllowedError") return cancellation;
  return error.message || fallback;
}
