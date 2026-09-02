import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { KeyRoundIcon, MailCheckIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
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
import { useActionLock } from "@/hooks/use-action-lock";
import { PasskeySettingsCard } from "../components/passkey-settings-card";
import { EVMWalletSettingsCard } from "../components/evm-wallet-settings-card";
import { PasswordSettingsCard } from "../components/password-settings-card";
import { ProfileInformationForm } from "../components/profile-information-form";
import { TwoFactorSettingsCard } from "../components/two-factor-settings-card";
import {
  SecurityMethodCardHeader,
  securityMethodCardClassName,
} from "../components/security-method-card-header";
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
  const [profile, setProfile] = useState<UpdateProfileInput>({
    username: "",
    displayName: "",
    email: "",
    verificationCode: "",
  });
  const [preferences, setPreferences] = useState<AccountPreferences>({
    balanceWarningThresholdUsd: null,
    barkUrl: "",
    gotifyPriority: 5,
    gotifyToken: "",
    gotifyTokenConfigured: false,
    gotifyUrl: "",
    notificationEmail: "",
    recordIpForced: false,
    recordIpLog: false,
    notifyType: null,
    webhookSecret: "",
    webhookSecretConfigured: false,
    webhookUrl: "",
  });
  const profileRef = useRef(profile);
  const preferencesRef = useRef(preferences);
  const profileLock = useActionLock();
  const preferencesLock = useActionLock();
  const sessionOperationLock = useActionLock();
  const hydratedUserIdRef = useRef<number | null>(null);
  const discardingChangesRef = useRef(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [preferencesDirty, setPreferencesDirty] = useState(false);
  const hasUnsavedChanges = profileDirty || preferencesDirty;
  const shouldBlockNavigation = useCallback(() => hasUnsavedChanges, [hasUnsavedChanges]);
  const blocker = useBlocker({
    disabled: !hasUnsavedChanges,
    enableBeforeUnload: hasUnsavedChanges,
    shouldBlockFn: shouldBlockNavigation,
    withResolver: true,
  });
  useEffect(() => {
    if (!query.data) return;
    const userChanged = hydratedUserIdRef.current !== query.data.user.id;
    if (userChanged || !profileDirty) {
      const nextProfile = {
        username: query.data.user.usernameEditable ? "" : query.data.user.username,
        displayName: query.data.user.displayName,
        email: query.data.user.email,
        verificationCode: "",
      };
      profileRef.current = nextProfile;
      setProfile(nextProfile);
    }
    if (userChanged || !preferencesDirty) {
      preferencesRef.current = query.data.preferences;
      setPreferences(query.data.preferences);
    }
    if (userChanged) {
      setProfileDirty(false);
      setPreferencesDirty(false);
    }
    hydratedUserIdRef.current = query.data.user.id;
  }, [preferencesDirty, profileDirty, query.data]);
  const updateProfile = useMutation({
    mutationFn: repository.updateProfile,
    onSuccess: (account, submittedProfile) => {
      const savedProfile = {
        username: account.user.usernameEditable ? "" : account.user.username,
        displayName: account.user.displayName,
        email: account.user.email,
        verificationCode: "",
      };
      const currentProfile = profileRef.current;
      const changedSinceSubmit =
        currentProfile.username !== submittedProfile.username ||
        currentProfile.displayName !== submittedProfile.displayName ||
        currentProfile.email !== submittedProfile.email ||
        currentProfile.verificationCode !== submittedProfile.verificationCode;
      if (changedSinceSubmit) {
        setProfileDirty(
          currentProfile.displayName !== savedProfile.displayName ||
            currentProfile.email !== savedProfile.email ||
            currentProfile.username !== savedProfile.username ||
            Boolean(currentProfile.verificationCode),
        );
      } else {
        profileRef.current = savedProfile;
        setProfile(savedProfile);
        setProfileDirty(false);
      }
      queryClient.setQueryData(["account"], account);
      if (session) queryClient.setQueryData(["session"], { ...session, user: account.user });
      toast.success(t("Profile updated"));
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Unable to update profile")),
    onSettled: profileLock.release,
  });
  const updatePreferences = useMutation({
    mutationFn: repository.updatePreferences,
    onSuccess: (account, submittedPreferences) => {
      const currentPreferences = preferencesRef.current;
      const currentPreferencesJson = JSON.stringify(currentPreferences);
      if (currentPreferencesJson === JSON.stringify(submittedPreferences)) {
        preferencesRef.current = account.preferences;
        setPreferences(account.preferences);
        setPreferencesDirty(false);
      } else {
        setPreferencesDirty(currentPreferencesJson !== JSON.stringify(account.preferences));
      }
      queryClient.setQueryData(["account"], account);
      toast.success(t("Preferences updated"));
    },
    onError: () => toast.error(t("Unable to update preferences")),
    onSettled: preferencesLock.release,
  });
  const revokeSession = useMutation({
    mutationFn: repository.revokeSession,
    onSuccess: (account) => {
      queryClient.setQueryData(["account"], account);
      toast.success(t("Session revoked"));
    },
    onError: () => toast.error(t("Unable to sign out session")),
    onSettled: sessionOperationLock.release,
  });
  const revokeOtherSessions = useMutation({
    mutationFn: repository.revokeOtherSessions,
    onSuccess: (result) => {
      queryClient.setQueryData(["account"], result.account);
      toast.success(t("Signed out {{count}} other sessions", { count: result.revokedCount }));
    },
    onError: () => toast.error(t("Unable to sign out other sessions")),
    onSettled: sessionOperationLock.release,
  });
  const locale = i18n.resolvedLanguage ?? "en";
  function handleSecurityUpdated(result: AccountSecurityResult) {
    queryClient.setQueryData(["account"], result.account);
    queryClient.setQueryData(["session"], result.session);
  }
  function saveProfile() {
    if (
      !profileRef.current.username.trim() ||
      !profileRef.current.displayName.trim() ||
      !profileLock.tryAcquire()
    )
      return;
    updateProfile.mutate({ ...profileRef.current });
  }
  function savePreferences() {
    if (!preferencesLock.tryAcquire()) return;
    updatePreferences.mutate({ ...preferencesRef.current });
  }
  function signOutSession(id: string) {
    if (!sessionOperationLock.tryAcquire()) return;
    revokeSession.mutate(id);
  }
  function signOutOtherSessions() {
    if (!sessionOperationLock.tryAcquire()) return;
    revokeOtherSessions.mutate();
  }
  function discardChangesAndProceed() {
    discardingChangesRef.current = true;
    if (query.data) {
      const nextProfile = {
        username: query.data.user.usernameEditable ? "" : query.data.user.username,
        displayName: query.data.user.displayName,
        email: query.data.user.email,
        verificationCode: "",
      };
      profileRef.current = nextProfile;
      preferencesRef.current = query.data.preferences;
      setProfile(nextProfile);
      setPreferences(query.data.preferences);
    }
    setProfileDirty(false);
    setPreferencesDirty(false);
    blocker.proceed?.();
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
                <CardDescription>
                  {t("Manage your username, display name, and verified email address.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProfileInformationForm
                  onChange={(nextProfile) => {
                    profileRef.current = nextProfile;
                    setProfile(nextProfile);
                    setProfileDirty(
                      !query.data ||
                        nextProfile.username !== query.data.user.username ||
                        nextProfile.displayName !== query.data.user.displayName ||
                        nextProfile.email !== query.data.user.email ||
                        Boolean(nextProfile.verificationCode),
                    );
                  }}
                  onSubmit={saveProfile}
                  pending={updateProfile.isPending}
                  savedEmail={query.data.user.email}
                  usernameEditable={query.data.user.usernameEditable}
                  value={profile}
                />
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
                    preferencesRef.current = value;
                    setPreferences(value);
                    setPreferencesDirty(
                      !query.data ||
                        JSON.stringify(value) !== JSON.stringify(query.data.preferences),
                    );
                  }}
                  onSubmit={savePreferences}
                  pending={updatePreferences.isPending}
                  value={preferences}
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="security">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {query.data && (
                <>
                  <PasswordSettingsCard
                    evmWalletEnabled={query.data.security.evmWalletEnabled}
                    onUpdated={handleSecurityUpdated}
                    passwordSet={query.data.user.passwordSet}
                  />
                  <PasskeySettingsCard
                    onUpdated={handleSecurityUpdated}
                    security={query.data.security}
                  />
                  <EVMWalletSettingsCard
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
                  onRevoke={signOutSession}
                  onRevokeOthers={signOutOtherSessions}
                  pendingSessionId={revokeSession.isPending ? revokeSession.variables : null}
                  revokeOthersPending={revokeOtherSessions.isPending}
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
      <AlertDialog
        onOpenChange={(open) => {
          if (open || blocker.status !== "blocked") return;
          if (discardingChangesRef.current) {
            discardingChangesRef.current = false;
            return;
          }
          blocker.reset();
        }}
        open={blocker.status === "blocked"}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TriangleAlertIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("Discard unsaved changes?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "You have unsaved account settings. Leaving this page or switching tabs will discard them.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Keep editing")}</AlertDialogCancel>
            <AlertDialogAction onClick={discardChangesAndProceed} variant="destructive">
              {t("Discard changes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
    <Card className={securityMethodCardClassName}>
      <SecurityMethodCardHeader
        description={description}
        icon={Icon}
        status={
          <Badge variant={active ? "secondary" : "outline"}>
            {active ? t("Enabled") : t("Not enabled")}
          </Badge>
        }
        title={title}
      />
    </Card>
  );
}
