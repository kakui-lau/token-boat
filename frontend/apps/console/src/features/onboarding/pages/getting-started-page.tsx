import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  ClipboardIcon,
  BellRingIcon,
  KeyRoundIcon,
  MessageSquareTextIcon,
  ScrollTextIcon,
  WalletCardsIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@token-boat/ui/components/ui/empty";
import { Progress } from "@token-boat/ui/components/ui/progress";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { DataLoadError } from "@/components/data-load-error";
import { repository } from "@/data/repository";
import { copyText } from "@/lib/clipboard";

export function GettingStartedPage() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ["onboarding"], queryFn: () => repository.getOnboarding() });
  const complete = query.data ? query.data.steps.filter((step) => step.complete).length : null;
  const total = query.data?.steps.length ?? null;
  const snippet = query.data?.exampleModel
    ? `curl ${query.data.baseUrl}/chat/completions \\\n  -H "Authorization: Bearer $TOKEN_BOAT_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${query.data.exampleModel}","messages":[{"role":"user","content":"Hello"}]}'`
    : null;
  const definitions = {
    "create-key": {
      icon: KeyRoundIcon,
      title: t("Create your first API key"),
      description: t("Generate a separate credential for each application and environment."),
      to: "/api-keys" as const,
      action: t("Manage API keys"),
    },
    "fund-account": {
      icon: WalletCardsIcon,
      title: t("Add balance or redeem a code"),
      description: t("Add funds before sending production requests."),
      to: "/recharge" as const,
      action: t("Open recharge"),
    },
    "first-request": {
      icon: MessageSquareTextIcon,
      title: t("Send a request in Playground"),
      description: t("Validate model behavior and parameters before writing integration code."),
      to: "/playground" as const,
      action: t("Open Playground"),
    },
  };

  const copySnippet = async () => {
    if (!snippet) return;
    try {
      await copyText(snippet);
      toast.success(t("Code copied"));
    } catch {
      toast.error(t("Unable to copy code"));
    }
  };

  if (query.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("Getting started")}
          description={t("Follow the onboarding checklist for your first API request.")}
        />
        <DataLoadError
          description={t("Try refreshing the page or check the API connection.")}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          title={t("Unable to load onboarding progress")}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("Getting started")}
        description={t("Follow the onboarding checklist for your first API request.")}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("Workspace readiness")}</CardTitle>
          <CardDescription>
            {complete === null || total === null
              ? "—"
              : t("{{complete}} of {{total}} steps completed", { complete, total })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {complete === null || total === null ? (
            <Skeleton className="h-2" />
          ) : (
            <Progress value={total === 0 ? 0 : (complete / total) * 100} />
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="flex flex-col gap-3">
          {query.isPending ? (
            <Skeleton className="h-80" />
          ) : (
            query.data?.steps.map((step, index) => {
              const item = definitions[step.id];
              const Icon = item.icon;
              return (
                <Card key={step.id}>
                  <CardContent className="flex items-start gap-4 py-2">
                    <span
                      className={
                        step.complete
                          ? "flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                          : "flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                      }
                    >
                      {step.complete ? (
                        <CheckIcon aria-hidden="true" className="size-4" />
                      ) : (
                        <Icon aria-hidden="true" className="size-4" />
                      )}
                    </span>
                    <div className="flex flex-1 flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {t("Step {{number}}", { number: index + 1 })}
                        </span>
                        {step.complete && <Badge variant="secondary">{t("Completed")}</Badge>}
                      </div>
                      <div>
                        <h2 className="font-medium">{item.title}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                      </div>
                      <Button
                        className="w-fit"
                        nativeButton={false}
                        render={<Link to={item.to} />}
                        variant="outline"
                      >
                        {item.action}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t("Your first request")}</CardTitle>
            <CardDescription>
              {t(
                "Use an environment variable instead of placing the secret directly in source code.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {query.isPending ? (
              <Skeleton className="h-40" />
            ) : snippet ? (
              <div className="relative">
                <pre className="overflow-x-auto rounded-xl bg-foreground p-4 pr-12 text-xs leading-6 text-background">
                  <code>{snippet}</code>
                </pre>
                <Button
                  aria-label={t("Copy code")}
                  className="absolute right-2 top-2"
                  onClick={() => void copySnippet()}
                  size="icon-sm"
                  variant="secondary"
                >
                  <ClipboardIcon data-icon="inline-start" />
                </Button>
              </div>
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MessageSquareTextIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>{t("No model available for the first request")}</EmptyTitle>
                  <EmptyDescription>
                    {t("No available model was returned for your account group.")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </div>
      <div>
        <h2 className="text-lg font-semibold">{t("After the first request")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Prepare observability and cost controls before production traffic grows.")}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <NextStepCard
            action={t("Open request logs")}
            description={t("Use request IDs to diagnose latency, service errors, and cost.")}
            icon={ScrollTextIcon}
            title={t("Trace requests")}
            to="/logs"
          />
          <NextStepCard
            action={t("Open alerts")}
            description={t("Notify engineering and billing teams before customers are affected.")}
            icon={BellRingIcon}
            title={t("Configure alerts")}
            to="/alerts"
          />
          <NextStepCard
            action={t("Open integration center")}
            description={t("Review endpoints, SDK examples, retry policy, and production checks.")}
            icon={MessageSquareTextIcon}
            title={t("Harden integration")}
            to="/integration"
          />
        </div>
      </div>
    </div>
  );
}

function NextStepCard(props: {
  action: string;
  description: string;
  icon: typeof MessageSquareTextIcon;
  title: string;
  to: "/logs" | "/alerts" | "/integration";
}) {
  const Icon = props.icon;
  return (
    <Card>
      <CardHeader>
        <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
          <Icon aria-hidden="true" />
        </span>
        <CardTitle className="pt-2 text-base">{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button nativeButton={false} render={<Link to={props.to} />} variant="outline">
          {props.action}
        </Button>
      </CardContent>
    </Card>
  );
}
