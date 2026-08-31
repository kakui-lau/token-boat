import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRoundIcon, LoaderCircleIcon, MailCheckIcon } from "lucide-react";
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@token-boat/ui/components/ui/tabs";
import { DataLoadError } from "@/components/data-load-error";
import { PageHeader } from "@/components/page-header";
import { useSession } from "@/app/session/session-context";
import type {
  AccountPreferences,
  AccountSecurityResult,
  UpdateProfileInput,
} from "@/data/contracts";
import { repository } from "@/data/repository";
import { PasskeySettingsCard } from "../components/passkey-settings-card";
import { TwoFactorSettingsCard } from "../components/two-factor-settings-card";
import { UsageNotificationsForm } from "../components/usage-notifications-form";
import type { AccountTab } from "../lib/account-tabs";

const ThemeSettingsContent = lazy(() =>
  import("@/features/preferences/components/theme-settings-content").then((module) => ({
    default: module.ThemeSettingsContent,
  })),
);

const SessionManagementCard = lazy(() =>
  import("../components/session-management-card").then((module) => ({
    default: module.SessionManagementCard,
  })),
);

type AccountPageProps = {
  activeTab: AccountTab;
  onTabChange(tab: AccountTab): void;
};

export function AccountPage(props: AccountPageProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const query = useQuery({ queryKey: ["account"], queryFn: () => repository.getAccount() });
  const [profile, setProfile] = useState<UpdateProfileInput>({ displayName: "", email: "" });
  const [preferences, setPreferences] = useState<AccountPreferences>({
    balanceWarningThresholdUsd: null,
    barkUrl: "",
    gotifyPriority: 5,
    gotifyToken: "",
    gotifyTokenConfigured: false,
    gotifyUrl: "",
    notificationEmail: "",
    recordIpLog: false,
    notifyType: null,
    webhookSecret: "",
    webhookSecretConfigured: false,
    webhookUrl: "",
  });
  const hydratedUserIdRef = useRef<number | null>(null);
  const profileDirtyRef = useRef(false);
  const preferencesDirtyRef = useRef(false);
  useEffect(() => {
    if (!query.data) return;
    const userChanged = hydratedUserIdRef.current !== query.data.user.id;
    if (userChanged || !profileDirtyRef.current) {
      setProfile({ displayName: query.data.user.displayName, email: query.data.user.email });
    }
    if (userChanged || !preferencesDirtyRef.current) {
      setPreferences(query.data.preferences);
    }
    hydratedUserIdRef.current = query.data.user.id;
  }, [query.data]);
  const updateProfile = useMutation({
    mutationFn: repository.updateProfile,
    onSuccess: (account) => {
      profileDirtyRef.current = false;
      setProfile({ displayName: account.user.displayName, email: account.user.email });
      queryClient.setQueryData(["account"], account);
      if (session) queryClient.setQueryData(["session"], { ...session, user: account.user });
      toast.success(t("Profile updated"));
    },
    onError: () => toast.error(t("Unable to update profile")),
  });
  const updatePreferences = useMutation({
    mutationFn: repository.updatePreferences,
    onSuccess: (account) => {
      preferencesDirtyRef.current = false;
      setPreferences(account.preferences);
      queryClient.setQueryData(["account"], account);
      toast.success(t("Preferences updated"));
    },
    onError: () => toast.error(t("Unable to update preferences")),
  });
  const revokeSession = useMutation({
    mutationFn: repository.revokeSession,
    onSuccess: (account) => {
      queryClient.setQueryData(["account"], account);
      toast.success(t("Session revoked"));
    },
    onError: () => toast.error(t("Unable to sign out session")),
  });
  const revokeOtherSessions = useMutation({
    mutationFn: repository.revokeOtherSessions,
    onSuccess: (result) => {
      queryClient.setQueryData(["account"], result.account);
      toast.success(t("Signed out {{count}} other sessions", { count: result.revokedCount }));
    },
    onError: () => toast.error(t("Unable to sign out other sessions")),
  });
  const locale = i18n.resolvedLanguage ?? "en";
  function handleSecurityUpdated(result: AccountSecurityResult) {
    queryClient.setQueryData(["account"], result.account);
    queryClient.setQueryData(["session"], result.session);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("Account settings")}
        description={t(
          "Manage profile, usage notifications, security, sessions, and theme settings.",
        )}
      />
      {query.isPending ? (
        <Skeleton className="h-96" />
      ) : query.isError ? (
        <DataLoadError
          description={t(
            "Check the connection and retry before changing profile, notification, or security settings.",
          )}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          title={t("Unable to load account settings")}
        />
      ) : (
        <Tabs
          onValueChange={(value) => props.onTabChange(value as AccountTab)}
          value={props.activeTab}
        >
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="profile">{t("Profile")}</TabsTrigger>
            <TabsTrigger value="preferences">{t("Usage notifications")}</TabsTrigger>
            <TabsTrigger value="security">{t("Security")}</TabsTrigger>
            <TabsTrigger value="sessions">{t("Sessions")}</TabsTrigger>
            <TabsTrigger value="theme">{t("Theme settings")}</TabsTrigger>
          </TabsList>
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>{t("Profile information")}</CardTitle>
                <CardDescription>{t("Update the name shown across the console.")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="max-w-xl"
                  onSubmit={(event) => {
                    event.preventDefault();
                    updateProfile.mutate(profile);
                  }}
                >
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="display-name">{t("Display name")}</FieldLabel>
                      <Input
                        id="display-name"
                        value={profile.displayName}
                        onChange={(event) => {
                          profileDirtyRef.current = true;
                          setProfile({ ...profile, displayName: event.target.value });
                        }}
                      />
                    </Field>
                    <Field data-disabled={repository.mode === "live" || undefined}>
                      <FieldLabel htmlFor="account-email">{t("Email")}</FieldLabel>
                      <Input
                        disabled={repository.mode === "live"}
                        id="account-email"
                        type="email"
                        value={profile.email}
                        onChange={(event) => {
                          profileDirtyRef.current = true;
                          setProfile({ ...profile, email: event.target.value });
                        }}
                      />
                      <FieldDescription>
                        {repository.mode === "live" &&
                          t("Email binding is managed by the existing verification flow.")}
                      </FieldDescription>
                    </Field>
                    <Button
                      className="w-fit"
                      disabled={!profile.displayName.trim() || updateProfile.isPending}
                      type="submit"
                    >
                      {updateProfile.isPending && (
                        <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                      )}
                      {t("Save changes")}
                    </Button>
                  </FieldGroup>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="preferences">
            <Card>
              <CardHeader>
                <CardTitle>{t("Usage notifications")}</CardTitle>
                <CardDescription>
                  {t("Control balance warnings and account activity records.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UsageNotificationsForm
                  onChange={(value) => {
                    preferencesDirtyRef.current = true;
                    setPreferences(value);
                  }}
                  onSubmit={() => updatePreferences.mutate(preferences)}
                  pending={updatePreferences.isPending}
                  value={preferences}
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="security">
            <div className="grid gap-4 md:grid-cols-3">
              {query.data && (
                <>
                  <PasskeySettingsCard
                    onUpdated={handleSecurityUpdated}
                    security={query.data.security}
                  />
                  <TwoFactorSettingsCard
                    onUpdated={handleSecurityUpdated}
                    security={query.data.security}
                  />
                </>
              )}
              <SecurityCard
                icon={MailCheckIcon}
                title={t("Verified email")}
                active={query.data?.security.emailBound ?? false}
                description={t("Used for alerts and account recovery.")}
              />
            </div>
          </TabsContent>
          <TabsContent value="sessions">
            {props.activeTab === "sessions" && (
              <Suspense fallback={<Skeleton className="h-64" />}>
                <SessionManagementCard
                  locale={locale}
                  onRevoke={(id) => revokeSession.mutate(id)}
                  onRevokeOthers={() => revokeOtherSessions.mutate()}
                  pending={revokeSession.isPending || revokeOtherSessions.isPending}
                  sessions={query.data?.sessions ?? []}
                />
              </Suspense>
            )}
          </TabsContent>
          <TabsContent value="theme">
            {props.activeTab === "theme" && (
              <Suspense fallback={<Skeleton className="h-96" />}>
                <ThemeSettingsContent />
              </Suspense>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function SecurityCard({
  icon: Icon,
  title,
  active,
  description,
}: {
  icon: typeof KeyRoundIcon;
  title: string;
  active: boolean;
  description: string;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <Badge variant={active ? "secondary" : "outline"}>
            {active ? t("Enabled") : t("Not enabled")}
          </Badge>
        </div>
        <CardTitle className="pt-3">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
