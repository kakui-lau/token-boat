import { useMemo, useState } from "react";
import { ArrowRightIcon, LoaderCircleIcon, ShieldCheckIcon, WalletMinimalIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getAddress, type Address } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import {
  type Connector,
  useConnect,
  useConnectors,
  useDisconnect,
  useSignMessage,
  WagmiProvider,
} from "wagmi";

import { Button } from "@token-boat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@token-boat/ui/components/ui/dialog";
import { useSession } from "@/app/session/session-context";
import type { EVMWalletAuthChallenge } from "@/data/contracts";
import { wagmiConfig } from "@/lib/wagmi";

type EVMWalletButtonProps = {
  affiliateCode?: string;
  disabled?: boolean;
  humanVerificationRequired?: boolean;
  intent: "login" | "register";
  onAuthenticated(): void | Promise<void>;
  onBusyChange?(busy: boolean): void;
  onHumanVerificationConsumed?(): void;
  turnstileToken?: string;
  buttonLabel?: string;
  successMessage?: string;
  errorMessage?: string;
  walletDialogDescription?: string;
  description?: string;
  beginChallenge?(input: { address: string; chainId: number }): Promise<EVMWalletAuthChallenge>;
  completeChallenge?(input: { flowToken: string; signature: string }): Promise<unknown>;
};

function wasWalletRequestRejected(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 6; depth += 1) {
    if (!current || typeof current !== "object") return false;
    const details = current as { cause?: unknown; code?: unknown; name?: unknown };
    if (details.code === 4001 || details.name === "UserRejectedRequestError") return true;
    current = details.cause;
  }
  return false;
}

export function EVMWalletButton(props: EVMWalletButtonProps) {
  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <EVMWalletButtonContent {...props} />
    </WagmiProvider>
  );
}

function EVMWalletButtonContent(props: EVMWalletButtonProps) {
  const { t } = useTranslation();
  const { beginEVMWalletAuth, completeEVMWalletAuth } = useSession();
  const connectors = useConnectors();
  const { connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [availableConnectors, setAvailableConnectors] = useState<readonly Connector[]>([]);
  const [checkingWallets, setCheckingWallets] = useState(false);
  const [loading, setLoading] = useState(false);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const visibleConnectors = useMemo(() => {
    if (connectors.length <= 1) return connectors;
    const namedConnectors = connectors.filter(
      (connector) => connector.id !== "injected" || connector.name !== "Injected",
    );
    return namedConnectors.length > 0 ? namedConnectors : connectors;
  }, [connectors]);

  const authenticate = async (connector: Connector) => {
    if (loading) return;
    setLoading(true);
    props.onBusyChange?.(true);
    setWalletDialogOpen(false);
    let connected = false;
    try {
      const connection = await connectAsync({ connector });
      connected = true;
      const address = connection.accounts[0];
      if (!address) throw new Error("The wallet did not return an EVM account.");
      let challenge: EVMWalletAuthChallenge;
      try {
        challenge = props.beginChallenge
          ? await props.beginChallenge({ address, chainId: connection.chainId })
          : await beginEVMWalletAuth({
              address,
              affiliateCode: props.affiliateCode,
              chainId: connection.chainId,
              intent: props.intent,
              turnstileToken: props.turnstileToken,
            });
      } finally {
        if (props.turnstileToken) {
          props.onHumanVerificationConsumed?.();
        }
      }
      const parsedMessage = parseSiweMessage(challenge.message);
      const canonicalAddress = getAddress(address);
      const challengeIsValid =
        challenge.address.toLowerCase() === canonicalAddress.toLowerCase() &&
        challenge.chainId === connection.chainId &&
        parsedMessage.chainId === connection.chainId &&
        parsedMessage.uri === window.location.origin &&
        validateSiweMessage({
          address: canonicalAddress as Address,
          domain: window.location.host,
          message: parsedMessage,
          nonce: challenge.nonce,
        });
      if (!challengeIsValid) {
        throw new Error("The wallet sign-in challenge does not match this site or account.");
      }
      const signature = await signMessageAsync({
        account: canonicalAddress,
        connector,
        message: challenge.message,
      });
      if (props.completeChallenge) {
        await props.completeChallenge({ flowToken: challenge.flowToken, signature });
      } else {
        await completeEVMWalletAuth({ flowToken: challenge.flowToken, signature });
      }
      toast.success(t(props.successMessage ?? "Signed in with EVM wallet"));
      await props.onAuthenticated();
    } catch (error) {
      if (wasWalletRequestRejected(error)) {
        toast.info(t("Wallet request was cancelled"));
      } else {
        toast.error(
          error instanceof Error
            ? t(error.message)
            : t(props.errorMessage ?? "EVM wallet sign-in failed"),
        );
      }
    } finally {
      if (connected) {
        await disconnectAsync({ connector }).catch(() => undefined);
      }
      setLoading(false);
      props.onBusyChange?.(false);
    }
  };

  const start = async () => {
    if (loading || checkingWallets) return;
    if (props.humanVerificationRequired && !props.turnstileToken) {
      toast.info(t("Complete the human verification first"));
      return;
    }
    setCheckingWallets(true);
    props.onBusyChange?.(true);
    try {
      const readyConnectors = (
        await Promise.all(
          visibleConnectors.map(async (connector) => {
            try {
              return (await connector.getProvider()) ? connector : null;
            } catch {
              return null;
            }
          }),
        )
      ).filter((connector): connector is Connector => connector !== null);
      if (readyConnectors.length === 0) {
        toast.error(t("No EVM wallet was found in this browser."));
        return;
      }
      const onlyConnector = readyConnectors[0];
      if (readyConnectors.length === 1 && onlyConnector) {
        await authenticate(onlyConnector);
        return;
      }
      setAvailableConnectors(readyConnectors);
      setWalletDialogOpen(true);
    } finally {
      setCheckingWallets(false);
      props.onBusyChange?.(false);
    }
  };

  return (
    <>
      <div data-slot="evm-wallet-access">
        <Button
          aria-label={t(props.buttonLabel ?? "Continue with EVM wallet")}
          className="h-auto w-full justify-start rounded-xl px-3.5 py-2.5 text-left whitespace-normal"
          disabled={props.disabled || loading || checkingWallets}
          onClick={() => void start()}
          type="button"
          variant="outline"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
            {loading || checkingWallets ? (
              <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
            ) : (
              <WalletMinimalIcon aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1" data-slot="evm-wallet-summary">
            <span className="block font-semibold">
              {t(props.buttonLabel ?? "Continue with EVM wallet")}
            </span>
            <span className="mt-0.5 block text-xs leading-4 font-normal text-muted-foreground">
              {t(
                props.description ??
                  "Sign a one-time message. No blockchain transaction or gas fee is required.",
              )}
            </span>
          </span>
          <ArrowRightIcon
            aria-hidden="true"
            className="text-muted-foreground"
            data-icon="inline-end"
          />
        </Button>
      </div>
      <Dialog onOpenChange={setWalletDialogOpen} open={walletDialogOpen}>
        <DialogContent className="gap-5 p-5 sm:max-w-md" closeLabel={t("Close")}>
          <div className="flex items-start gap-3 pr-8">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <WalletMinimalIcon aria-hidden="true" />
            </span>
            <DialogHeader className="gap-1.5">
              <DialogTitle>{t("Choose an EVM wallet")}</DialogTitle>
              <DialogDescription>
                {t(
                  props.walletDialogDescription ??
                    "Select the browser wallet that should sign this login request.",
                )}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="grid gap-2">
            {availableConnectors.map((connector) => (
              <Button
                aria-label={connector.name}
                className="h-auto justify-start rounded-xl px-3.5 py-3 text-left"
                key={connector.uid}
                onClick={() => void authenticate(connector)}
                type="button"
                variant="outline"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                  <WalletMinimalIcon aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{connector.name}</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {t("EVM wallet")}
                  </span>
                </span>
                <ArrowRightIcon
                  aria-hidden="true"
                  className="text-muted-foreground"
                  data-icon="inline-end"
                />
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <ShieldCheckIcon aria-hidden="true" />
            <span>
              {t("Sign a one-time message. No blockchain transaction or gas fee is required.")}
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
