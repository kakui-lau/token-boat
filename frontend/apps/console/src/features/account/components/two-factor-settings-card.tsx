import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ClipboardIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
import { Card, CardContent, CardFooter } from "@token-boat/ui/components/ui/card";
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
  FieldGroup,
  FieldLabel,
} from "@token-boat/ui/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@token-boat/ui/components/ui/input-group";
import { Input } from "@token-boat/ui/components/ui/input";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import type { AccountData, AccountSecurityResult, TwoFactorSetup } from "@/data/contracts";
import { repository } from "@/data/repository";
import { useActionLock } from "@/hooks/use-action-lock";
import { copyText } from "@/lib/clipboard";
import {
  SecurityMethodCardHeader,
  securityMethodCardClassName,
} from "./security-method-card-header";

type TwoFactorSettingsCardProps = {
  security: AccountData["security"];
  onUpdated(result: AccountSecurityResult): void;
};

export function TwoFactorSettingsCard(props: TwoFactorSettingsCardProps) {
  const { t } = useTranslation();
  const [setupOpen, setSetupOpen] = useState(false);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [setupComplete, setSetupComplete] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [regeneratedCodes, setRegeneratedCodes] = useState<string[] | null>(null);
  const setupLock = useActionLock();
  const enableLock = useActionLock();
  const disableLock = useActionLock();
  const backupLock = useActionLock();

  const setupMutation = useMutation({
    mutationFn: repository.setupTwoFactor,
    onSuccess: setSetup,
    onError: (error) => toast.error(error.message || t("Unable to start 2FA setup")),
    onSettled: setupLock.release,
  });
  const enableMutation = useMutation({
    mutationFn: repository.enableTwoFactor,
    onSuccess: (result) => {
      props.onUpdated(result);
      setSetupComplete(true);
      toast.success(t("Two-factor authentication enabled"));
    },
    onError: (error) => toast.error(error.message || t("Unable to enable 2FA")),
    onSettled: enableLock.release,
  });
  const disableMutation = useMutation({
    mutationFn: repository.disableTwoFactor,
    onSuccess: (result) => {
      props.onUpdated(result);
      setDisableOpen(false);
      setDisableCode("");
      toast.success(t("Two-factor authentication disabled"));
    },
    onError: (error) => toast.error(error.message || t("Unable to disable 2FA")),
    onSettled: disableLock.release,
  });
  const backupMutation = useMutation({
    mutationFn: repository.regenerateTwoFactorBackupCodes,
    onSuccess: (result) => {
      props.onUpdated(result);
      setRegeneratedCodes(result.backupCodes);
      setBackupCode("");
      toast.success(t("Backup codes regenerated"));
    },
    onError: (error) => toast.error(error.message || t("Unable to regenerate backup codes")),
    onSettled: backupLock.release,
  });

  function closeSetup() {
    if (setupMutation.isPending || enableMutation.isPending) return;
    setSetupOpen(false);
    setSetup(null);
    setSetupCode("");
    setSetupComplete(false);
    setupMutation.reset();
  }

  function openSetup() {
    if (!setupLock.tryAcquire()) return;
    setSetupOpen(true);
    setSetup(null);
    setSetupComplete(false);
    setupMutation.mutate();
  }

  function closeBackup() {
    if (backupMutation.isPending) return;
    setBackupOpen(false);
    setBackupCode("");
    setRegeneratedCodes(null);
  }

  function retrySetup() {
    if (!setupLock.tryAcquire()) return;
    setupMutation.mutate();
  }

  function enableCurrentSetup() {
    if (!setup || !setupCode.trim() || !enableLock.tryAcquire()) return;
    enableMutation.mutate(setupCode);
  }

  function regenerateBackupCodes() {
    if (!backupCode.trim() || !backupLock.tryAcquire()) return;
    backupMutation.mutate(backupCode);
  }

  function disableCurrentTwoFactor() {
    if (!disableCode.trim() || !disableLock.tryAcquire()) return;
    disableMutation.mutate(disableCode);
  }

  return (
    <>
      <Card className={securityMethodCardClassName}>
        <SecurityMethodCardHeader
          description={t("Protect password sign-in with an authenticator code and recovery codes.")}
          icon={ShieldCheckIcon}
          status={
            <Badge variant={props.security.twoFactorEnabled ? "secondary" : "outline"}>
              {props.security.twoFactorEnabled ? t("Enabled") : t("Not enabled")}
            </Badge>
          }
          title={t("Two-factor authentication")}
        />
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          {props.security.twoFactorEnabled && (
            <p>
              {props.security.backupCodesRemaining === null
                ? t("Recovery code count unavailable")
                : t("{{count}} recovery codes remaining", {
                    count: props.security.backupCodesRemaining,
                  })}
            </p>
          )}
          {props.security.twoFactorLocked && (
            <p className="text-destructive">
              {t("2FA is temporarily locked after failed attempts.")}
            </p>
          )}
        </CardContent>
        <CardFooter className="mt-auto flex flex-wrap gap-2">
          {props.security.twoFactorEnabled ? (
            <>
              <Button onClick={() => setBackupOpen(true)} size="sm" variant="outline">
                <RefreshCwIcon data-icon="inline-start" />
                {t("Regenerate recovery codes")}
              </Button>
              <Button onClick={() => setDisableOpen(true)} size="sm" variant="destructive">
                <ShieldOffIcon data-icon="inline-start" />
                {t("Disable 2FA")}
              </Button>
            </>
          ) : (
            <Button onClick={openSetup} size="sm">
              <ShieldCheckIcon data-icon="inline-start" />
              {t("Enable 2FA")}
            </Button>
          )}
        </CardFooter>
      </Card>

      <Dialog
        open={setupOpen}
        onOpenChange={(open) => {
          if (!open && setupComplete) closeSetup();
        }}
      >
        <DialogContent
          className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>{t("Set up two-factor authentication")}</DialogTitle>
            <DialogDescription>
              {t(
                "Scan the QR code, save the recovery codes, then enter a current authenticator code.",
              )}
            </DialogDescription>
          </DialogHeader>

          {setupMutation.isPending && <Skeleton className="h-80" />}
          {setupMutation.isError && !setup ? (
            <Alert variant="destructive">
              <ShieldOffIcon />
              <AlertTitle>{t("Unable to load two-factor setup")}</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <span>{t("Retry setup without closing this dialog.")}</span>
                <Button
                  className="w-fit"
                  disabled={setupMutation.isPending}
                  onClick={retrySetup}
                  size="sm"
                  variant="outline"
                >
                  {setupMutation.isPending && (
                    <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                  )}
                  {t("Retry setup")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {setup && (
            <FieldGroup>
              <div className="mx-auto rounded-xl border bg-white p-3">
                <QRCodeSVG aria-label={t("2FA QR code")} size={180} value={setup.qrCodeData} />
              </div>
              <Field>
                <FieldLabel htmlFor="two-factor-secret">{t("Manual setup key")}</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    className="font-mono"
                    id="two-factor-secret"
                    readOnly
                    value={setup.secret}
                  />
                  <InputGroupAddon align="inline-end">
                    <Button
                      aria-label={t("Copy setup key")}
                      onClick={() =>
                        void copyText(setup.secret)
                          .then(() => toast.success(t("Setup key copied")))
                          .catch(() => toast.error(t("Unable to copy setup key")))
                      }
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <ClipboardIcon />
                    </Button>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
              <BackupCodes codes={setup.backupCodes} />
              {!setupComplete && (
                <Field>
                  <FieldLabel htmlFor="two-factor-setup-code">{t("Authenticator code")}</FieldLabel>
                  <Input
                    autoComplete="one-time-code"
                    id="two-factor-setup-code"
                    inputMode="numeric"
                    onChange={(event) => setSetupCode(event.target.value)}
                    placeholder="123456"
                    value={setupCode}
                  />
                  <FieldDescription>
                    {t("Enter the six-digit code shown by your authenticator app.")}
                  </FieldDescription>
                </Field>
              )}
              {setupComplete && (
                <Alert>
                  <ShieldCheckIcon />
                  <AlertTitle>{t("2FA is now enabled")}</AlertTitle>
                  <AlertDescription>
                    {t("Store the recovery codes before closing this dialog.")}
                  </AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          )}

          <DialogFooter>
            {setupComplete ? (
              <Button onClick={closeSetup}>{t("I have saved the recovery codes")}</Button>
            ) : (
              <>
                <Button
                  disabled={setupMutation.isPending || enableMutation.isPending}
                  onClick={closeSetup}
                  variant="outline"
                >
                  {t("Cancel")}
                </Button>
                <Button
                  disabled={!setup || !setupCode.trim() || enableMutation.isPending}
                  onClick={enableCurrentSetup}
                >
                  {enableMutation.isPending && (
                    <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                  )}
                  {t("Enable 2FA")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={backupOpen}
        onOpenChange={(open) => {
          if (!open && (backupMutation.isPending || regeneratedCodes)) return;
          if (!open) closeBackup();
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          closeLabel={t("Close")}
          showCloseButton={!backupMutation.isPending && !regeneratedCodes}
        >
          <DialogHeader>
            <DialogTitle>{t("Regenerate recovery codes")}</DialogTitle>
            <DialogDescription>
              {regeneratedCodes
                ? t("Your previous recovery codes are now invalid.")
                : t(
                    "Enter a current authenticator code. Existing recovery codes will be replaced.",
                  )}
            </DialogDescription>
          </DialogHeader>
          {regeneratedCodes ? (
            <BackupCodes codes={regeneratedCodes} />
          ) : (
            <Field>
              <FieldLabel htmlFor="backup-code-verification">{t("Authenticator code")}</FieldLabel>
              <Input
                autoComplete="one-time-code"
                id="backup-code-verification"
                inputMode="numeric"
                onChange={(event) => setBackupCode(event.target.value)}
                placeholder="123456"
                value={backupCode}
              />
            </Field>
          )}
          <DialogFooter>
            {regeneratedCodes ? (
              <Button onClick={closeBackup}>{t("I have saved the recovery codes")}</Button>
            ) : (
              <Button
                disabled={!backupCode.trim() || backupMutation.isPending}
                onClick={regenerateBackupCodes}
              >
                {backupMutation.isPending && (
                  <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                )}
                {t("Regenerate codes")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={disableOpen}
        onOpenChange={(open) => {
          if (!open && disableMutation.isPending) return;
          setDisableOpen(open);
          if (!open) setDisableCode("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <ShieldOffIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("Disable two-factor authentication?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Password sign-in will no longer require a second verification step.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="disable-two-factor-code">
              {t("Authenticator or recovery code")}
            </FieldLabel>
            <Input
              autoComplete="one-time-code"
              id="disable-two-factor-code"
              onChange={(event) => setDisableCode(event.target.value)}
              value={disableCode}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disableMutation.isPending}>
              {t("Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!disableCode.trim() || disableMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                disableCurrentTwoFactor();
              }}
              variant="destructive"
            >
              {disableMutation.isPending && (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
              )}
              {t("Disable 2FA")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function BackupCodes(props: { codes: string[] }) {
  const { t } = useTranslation();
  return (
    <Alert>
      <KeyRoundIcon />
      <AlertTitle>{t("Recovery codes")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{t("Each code can be used once. Store them somewhere secure.")}</span>
        <span className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {props.codes.map((code) => (
            <code className="rounded bg-muted px-2 py-1 font-mono text-foreground" key={code}>
              {code}
            </code>
          ))}
        </span>
        <Button
          className="w-fit"
          onClick={() =>
            void copyText(props.codes.join("\n"))
              .then(() => toast.success(t("Recovery codes copied")))
              .catch(() => toast.error(t("Unable to copy recovery codes")))
          }
          size="sm"
          type="button"
          variant="outline"
        >
          <ClipboardIcon data-icon="inline-start" />
          {t("Copy all codes")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
