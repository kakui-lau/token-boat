import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CircleAlertIcon,
  CheckCircle2Icon,
  ClipboardIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  ServerIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@token-boat/ui/components/ui/item";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@token-boat/ui/components/ui/table";
import { DataLoadError } from "@/components/data-load-error";
import { PageHeader } from "@/components/page-header";
import { TableEmptyState } from "@/components/table-empty-state";
import { TableLoadingState } from "@/components/table-loading-state";
import { TableText } from "@/components/table-value";
import { repository } from "@/data/repository";
import { FirstRequestCard } from "@/features/integration/components/first-request-card";
import { copyText } from "@/lib/clipboard";

export function IntegrationPage() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["integration"],
    queryFn: () => repository.getIntegration(),
  });
  const keys = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => repository.listApiKeys(),
  });
  const activeKeyCount = (keys.data ?? []).filter((apiKey) => apiKey.status === "active").length;

  const copy = async (value: string) => {
    if (!value) return;
    try {
      await copyText(value);
      toast.success(t("Copied to clipboard"));
    } catch {
      toast.error(t("Unable to copy value"));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        action={
          <Button nativeButton={false} render={<Link to="/api-keys" />}>
            {t("Create API key")}
          </Button>
        }
        description={t("Connect an application, verify the environment, and ship safely.")}
        title={t("Integration center")}
      />

      {query.isPending ? (
        <Skeleton className="h-36" />
      ) : query.isError ? (
        <DataLoadError
          description={t("Check the current API connection and try again.")}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          title={t("Unable to load integration environment")}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("API environment")}</CardTitle>
              <CardDescription>
                {t("Use one base URL across OpenAI-compatible SDKs.")}
              </CardDescription>
              <CardAction>
                <ServiceStatusBadge />
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,1.45fr)_minmax(0,0.75fr)_minmax(0,0.9fr)]">
              <EnvironmentValue label={t("Base URL")} value={query.data?.baseUrl ?? "—"} />
              <EnvironmentValue label={t("API version")} value={query.data?.apiVersion ?? "—"} />
              <EnvironmentValue label={t("Routing region")} value={query.data?.region ?? "—"} />
              <Button
                className="sm:col-span-3 sm:w-fit"
                onClick={() => void copy(query.data.baseUrl)}
                variant="outline"
              >
                <ClipboardIcon data-icon="inline-start" />
                {t("Copy base URL")}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("Connection readiness")}</CardTitle>
              <CardDescription>
                {t("Derived from the current environment and account.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ReadinessItem
                label={t("API environment reachable")}
                ready={query.data.serviceStatus === "reachable"}
              />
              <ReadinessItem
                error={keys.isError && keys.data === undefined}
                label={t("Active API key")}
                pending={keys.isPending}
                ready={activeKeyCount > 0}
              />
              <ReadinessItem
                label={t("OpenAI-compatible endpoint catalog")}
                ready={query.data.endpoints.length > 0}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {query.isError ? null : query.isPending ? (
        <Skeleton className="h-96" />
      ) : (
        <FirstRequestCard baseUrl={query.data.baseUrl} />
      )}

      {!query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("Core endpoints")}</CardTitle>
            <CardDescription>
              {t("Start with these stable OpenAI-compatible endpoints.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Method")}</TableHead>
                  <TableHead>{t("Endpoint")}</TableHead>
                  <TableHead>{t("Capability")}</TableHead>
                  <TableHead>{t("Description")}</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">{t("Actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody aria-busy={query.isPending}>
                {query.isPending ? <TableLoadingState colSpan={5} /> : null}
                {!query.isPending && query.data.endpoints.length === 0 ? (
                  <TableEmptyState
                    colSpan={5}
                    description={t("No OpenAI-compatible endpoints were returned by the API.")}
                    title={t("No endpoints available")}
                  />
                ) : null}
                {query.data?.endpoints.map((endpoint) => (
                  <TableRow key={endpoint.path}>
                    <TableCell>
                      <Badge variant="outline">{endpoint.method}</Badge>
                    </TableCell>
                    <TableCell>
                      <TableText className="max-w-64 font-mono text-xs" value={endpoint.path} />
                    </TableCell>
                    <TableCell>
                      <TableText className="max-w-48" value={endpoint.name} />
                    </TableCell>
                    <TableCell>
                      <TableText
                        className="max-w-80 text-muted-foreground"
                        value={t(endpoint.description)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        aria-label={t("Copy {{value}}", { value: endpoint.path })}
                        onClick={() => void copy(endpoint.path)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <ClipboardIcon aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheckIcon aria-hidden="true" />
              {t("Authentication and safety")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-muted-foreground">
            {t(
              "Keep API keys on the server, rotate compromised credentials, and never expose secrets in browser code.",
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ServerIcon aria-hidden="true" />
              {t("Need implementation help?")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button nativeButton={false} render={<Link to="/getting-started" />} variant="outline">
              {t("Open onboarding guide")}
              <ExternalLinkIcon data-icon="inline-end" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EnvironmentValue(props: { label: string; value: string }) {
  return (
    <Item className="min-w-0" variant="outline">
      <ItemContent>
        <ItemDescription>{props.label}</ItemDescription>
        <ItemTitle className="block max-w-full truncate font-mono" title={props.value}>
          {props.value}
        </ItemTitle>
      </ItemContent>
    </Item>
  );
}

function ReadinessItem(props: {
  error?: boolean;
  label: string;
  pending?: boolean;
  ready: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex min-w-0 items-start gap-2">
        {props.pending ? (
          <RefreshCwIcon className="mt-0.5 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : props.ready ? (
          <CheckCircle2Icon className="mt-0.5 text-primary" aria-hidden="true" />
        ) : (
          <CircleAlertIcon
            className="mt-0.5 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
        )}
        <span>{props.label}</span>
      </span>
      <Badge variant={props.error ? "destructive" : props.ready ? "secondary" : "outline"}>
        {props.pending
          ? t("Checking")
          : props.error
            ? t("Check unavailable")
            : props.ready
              ? t("Ready")
              : t("Needs attention")}
      </Badge>
    </div>
  );
}

function ServiceStatusBadge() {
  const { t } = useTranslation();

  return (
    <Badge variant="secondary">
      <CheckCircle2Icon data-icon="inline-start" />
      {t("Reachable")}
    </Badge>
  );
}
