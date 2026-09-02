import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircleIcon, ShieldAlertIcon, Trash2Icon, WalletCardsIcon } from "lucide-react";
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
  DialogHeader,
  DialogTitle,
} from "@token-boat/ui/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
import type { AccountData, AccountSecurityResult } from "@/data/contracts";
import { repository } from "@/data/repository";
import { formatDateTime } from "@/lib/format";
import { EVMWalletButton } from "@/features/auth/components/evm-wallet-button";
import {
  SecurityMethodCardHeader,
  securityMethodCardClassName,
} from "./security-method-card-header";

type EVMWalletSettingsCardProps = {
  security: AccountData["security"];
  onUpdated(result: AccountSecurityResult): void;
};

export function EVMWalletSettingsCard(props: EVMWalletSettingsCardProps) {
  const { t, i18n } = useTranslation();
  const [bindOpen, setBindOpen] = useState(false);
  const [bindCode, setBindCode] = useState("");
  const [bindBusy, setBindBusy] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeCode, setRemoveCode] = useState("");
  const bindProof = useRef<string | undefined>(undefined);
  const locale = i18n.resolvedLanguage ?? "en";
  const method = props.security.evmWalletVerificationMethod;
  const requiresCode = method === "2fa" || method === "password";

  const removeMutation = useMutation({
    mutationFn: async () => {
      const proof = method
        ? await repository.createEVMWalletSecurityProof(
            method,
            "evm_wallet.delete",
            requiresCode ? removeCode : undefined,
          )
        : undefined;
      return repository.removeEVMWallet(proof);
    },
    onSuccess: (result) => {
      props.onUpdated(result);
      setRemoveOpen(false);
      setRemoveCode("");
      toast.success(t("EVM wallet removed"));
    },
    onError: (error) =>
      toast.error(error instanceof Error ? t(error.message) : t("Unable to remove EVM wallet")),
  });

  const canStartBinding = !requiresCode || Boolean(bindCode.trim());
  const bindChallenge = async (input: { address: string; chainId: number }) => {
    bindProof.current = method
      ? await repository.createEVMWalletSecurityProof(
          method,
          "evm_wallet.bind",
          requiresCode ? bindCode : undefined,
        )
      : undefined;
    return repository.beginEVMWalletBinding(
      bindProof.current ? { ...input, proof: bindProof.current } : input,
    );
  };

  return (
    <>
      <Card className={securityMethodCardClassName}>
        <SecurityMethodCardHeader
          description={t(
            "Use an EVM wallet signature to sign in without sending a blockchain transaction.",
          )}
          icon={WalletCardsIcon}
          status={
            <Badge variant={props.security.evmWalletEnabled ? "secondary" : "outline"}>
              {props.security.evmWalletEnabled ? t("Bound") : t("Not bound")}
            </Badge>
          }
          title={t("EVM wallet")}
        />
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          {props.security.evmWalletAddress && (
            <code className="break-all text-xs text-foreground">
              {props.security.evmWalletAddress}
            </code>
          )}
          {props.security.evmWalletLastUsedAt && (
            <p>
              {t("Last used {{time}}", {
                time: formatDateTime(props.security.evmWalletLastUsedAt, locale),
              })}
            </p>
          )}
        </CardContent>
        <CardFooter className="mt-auto flex flex-wrap gap-2">
          <Button onClick={() => setBindOpen(true)} size="sm">
            <WalletCardsIcon data-icon="inline-start" />
            {props.security.evmWalletEnabled ? t("Replace wallet") : t("Bind wallet")}
          </Button>
          {props.security.evmWalletEnabled && (
            <Button
              disabled={!props.security.evmWalletRemovable}
              onClick={() => setRemoveOpen(true)}
              size="sm"
              variant="destructive"
            >
              <Trash2Icon data-icon="inline-start" />
              {t("Remove wallet")}
            </Button>
          )}
        </CardFooter>
      </Card>

      <Dialog
        open={bindOpen}
        onOpenChange={(open) => {
          if (!open && bindBusy) return;
          setBindOpen(open);
          if (!open) {
            bindProof.current = undefined;
            setBindCode("");
          }
        }}
      >
        <DialogContent closeLabel={t("Close")} showCloseButton={!bindBusy}>
          <DialogHeader>
            <DialogTitle>
              {props.security.evmWalletEnabled ? t("Replace EVM wallet") : t("Bind EVM wallet")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Verify this account, then sign a one-time message with the wallet you want to bind.",
              )}
            </DialogDescription>
          </DialogHeader>
          {requiresCode ? (
            <Field>
              <FieldLabel htmlFor="evm-wallet-bind-verification">
                {method === "2fa" ? t("Authenticator or recovery code") : t("Current password")}
              </FieldLabel>
              <Input
                autoComplete={method === "2fa" ? "one-time-code" : "current-password"}
                id="evm-wallet-bind-verification"
                onChange={(event) => setBindCode(event.target.value)}
                type={method === "password" ? "password" : "text"}
                value={bindCode}
              />
              <FieldDescription>
                {t("This verification protects changes to your sign-in methods.")}
              </FieldDescription>
            </Field>
          ) : method === "passkey" ? (
            <Alert>
              <WalletCardsIcon />
              <AlertTitle>{t("Passkey verification required")}</AlertTitle>
              <AlertDescription>
                {t("Your browser will verify your Passkey before connecting the wallet.")}
              </AlertDescription>
            </Alert>
          ) : null}
          <EVMWalletButton
            beginChallenge={bindChallenge}
            buttonLabel={
              props.security.evmWalletEnabled ? "Choose replacement wallet" : "Choose wallet"
            }
            completeChallenge={async (input) => {
              const result = await repository.completeEVMWalletBinding(
                bindProof.current ? { ...input, proof: bindProof.current } : input,
              );
              props.onUpdated(result);
            }}
            disabled={!canStartBinding}
            errorMessage="Unable to bind EVM wallet"
            intent="login"
            onAuthenticated={() => {
              setBindOpen(false);
              setBindCode("");
              bindProof.current = undefined;
            }}
            onBusyChange={setBindBusy}
            successMessage="EVM wallet bound"
            walletDialogDescription="Select the browser wallet to bind to this account."
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <ShieldAlertIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("Remove this EVM wallet?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("This wallet will no longer be able to sign in to your account.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {requiresCode ? (
            <Field>
              <FieldLabel htmlFor="evm-wallet-remove-verification">
                {method === "2fa" ? t("Authenticator or recovery code") : t("Current password")}
              </FieldLabel>
              <Input
                autoComplete={method === "2fa" ? "one-time-code" : "current-password"}
                id="evm-wallet-remove-verification"
                onChange={(event) => setRemoveCode(event.target.value)}
                type={method === "password" ? "password" : "text"}
                value={removeCode}
              />
            </Field>
          ) : method === "passkey" ? (
            <Alert>
              <WalletCardsIcon />
              <AlertTitle>{t("Passkey verification required")}</AlertTitle>
              <AlertDescription>
                {t("Your browser will verify your Passkey before removing the wallet.")}
              </AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeMutation.isPending || (requiresCode && !removeCode.trim())}
              onClick={(event) => {
                event.preventDefault();
                removeMutation.mutate();
              }}
              variant="destructive"
            >
              {removeMutation.isPending && (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
              )}
              {t("Remove wallet")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
