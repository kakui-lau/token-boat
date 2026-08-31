import type { ReactNode } from "react";
import { LoaderCircleIcon, RefreshCwIcon, WifiOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Button } from "@token-boat/ui/components/ui/button";
import { useSession } from "@/app/session/session-context";

type AuthCapabilitiesErrorProps = {
  description: ReactNode;
};

export function AuthCapabilitiesError({ description }: AuthCapabilitiesErrorProps) {
  const { t } = useTranslation();
  const { capabilitiesRetrying, retryCapabilities } = useSession();

  return (
    <Alert variant="destructive">
      <WifiOffIcon aria-hidden="true" />
      <AlertTitle>{t("Authentication service unavailable")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{description}</span>
        <Button
          disabled={capabilitiesRetrying}
          onClick={() => void retryCapabilities()}
          size="sm"
          type="button"
          variant="outline"
        >
          {capabilitiesRetrying ? (
            <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
          ) : (
            <RefreshCwIcon data-icon="inline-start" />
          )}
          {t(capabilitiesRetrying ? "Retrying…" : "Try again")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
