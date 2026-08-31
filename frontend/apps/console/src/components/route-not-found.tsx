import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, FileQuestionIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@token-boat/ui/components/ui/button";
import { SystemState } from "@/components/system-state";

export function RouteNotFound() {
  const { t } = useTranslation();

  return (
    <SystemState
      actions={
        <Button nativeButton={false} render={<Link to="/" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          {t("Back to overview")}
        </Button>
      }
      className="min-h-[calc(100svh-10rem)]"
      code="404"
      description={t("The requested console page does not exist or has been moved.")}
      icon={<FileQuestionIcon aria-hidden="true" />}
      title={t("Page not found")}
    />
  );
}
