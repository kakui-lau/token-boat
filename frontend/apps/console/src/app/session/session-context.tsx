import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type PropsWithChildren,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  AuthCapabilities,
  ConsoleSession,
  EmailVerificationInput,
  OAuthCallbackInput,
  OAuthLoginFlow,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  RegisterInput,
  SignInInput,
  SignInResult,
  VerifyTwoFactorLoginInput,
} from "@/data/contracts";
import { repository } from "@/data/repository";
import { createSessionSync } from "./session-sync";

type SessionContextValue = {
  capabilities: AuthCapabilities | null;
  capabilitiesError: Error | null;
  capabilitiesLoading: boolean;
  capabilitiesRetrying: boolean;
  error: Error | null;
  session: ConsoleSession | null;
  loading: boolean;
  mode: typeof repository.mode;
  retrying: boolean;
  signingOut: boolean;
  retryCapabilities(): Promise<void>;
  retry(): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  createOAuthLoginFlow(provider: string): Promise<OAuthLoginFlow>;
  completeOAuthLogin(input: OAuthCallbackInput): Promise<ConsoleSession>;
  sendEmailVerification(input: EmailVerificationInput): Promise<void>;
  requestPasswordReset(input: PasswordResetRequestInput): Promise<void>;
  confirmPasswordReset(input: PasswordResetConfirmInput): Promise<string>;
  signIn(input: SignInInput): Promise<SignInResult>;
  signInWithPasskey(): Promise<ConsoleSession | null>;
  verifyTwoFactorLogin(input: VerifyTwoFactorLoginInput): Promise<ConsoleSession>;
  signOut(): Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const sessionRefreshLeadTimeMs = 60_000;
const sessionRefreshRetryIntervalMs = 30_000;
const maximumBrowserTimerDelayMs = 2_147_483_647;

export function resolveSessionRefreshInterval(
  session: ConsoleSession | null | undefined,
  refreshFailed: boolean,
  now = Date.now(),
): number | false {
  if (!session?.accessExpiresAt) return false;
  if (refreshFailed) return sessionRefreshRetryIntervalMs;
  return Math.min(
    maximumBrowserTimerDelayMs,
    Math.max(
      sessionRefreshRetryIntervalMs,
      session.accessExpiresAt * 1_000 - now - sessionRefreshLeadTimeMs,
    ),
  );
}

export function SessionProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const signOutRequestRef = useRef<Promise<void> | null>(null);
  const sessionSyncRef = useRef<ReturnType<typeof createSessionSync> | null>(null);
  const sessionSyncRevisionRef = useRef(0);
  const previousAccessTokenRef = useRef<string | null>(null);
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: ({ signal }) => repository.getSession({ signal }),
    refetchInterval: (query) =>
      resolveSessionRefreshInterval(query.state.data, query.state.status === "error"),
    refetchIntervalInBackground: true,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const capabilitiesQuery = useQuery({
    queryKey: ["auth-capabilities"],
    queryFn: () => repository.getAuthCapabilities(),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const clearAuthenticatedQueryData = useCallback(() => {
    void queryClient.cancelQueries({ queryKey: ["session"] });
    queryClient.removeQueries({
      predicate: (query) =>
        query.queryKey[0] !== "session" && query.queryKey[0] !== "auth-capabilities",
    });
    queryClient.setQueryData(["session"], null);
  }, [queryClient]);
  useEffect(() => {
    const sync = createSessionSync((event) => {
      const revision = ++sessionSyncRevisionRef.current;
      if (event === "signed-out") {
        repository.clearLocalSession();
        clearAuthenticatedQueryData();
        return;
      }

      void queryClient.cancelQueries({ queryKey: ["session"] });
      void repository
        .getSession({ ignoreCurrentSession: true })
        .then((session) => {
          if (revision !== sessionSyncRevisionRef.current) return;
          if (session) {
            queryClient.setQueryData(["session"], session);
            return;
          }
          clearAuthenticatedQueryData();
        })
        .catch(() => {
          // Preserve the current state when another tab signs in but refresh is temporarily offline.
        });
    });
    sessionSyncRef.current = sync;
    return () => {
      sync.close();
      if (sessionSyncRef.current === sync) sessionSyncRef.current = null;
    };
  }, [clearAuthenticatedQueryData, queryClient]);
  useEffect(() => {
    const accessToken = sessionQuery.data?.accessToken ?? null;
    const previousAccessToken = previousAccessTokenRef.current;
    previousAccessTokenRef.current = accessToken;
    if (!previousAccessToken || !accessToken || previousAccessToken === accessToken) return;

    void queryClient.refetchQueries({
      type: "active",
      predicate: (query) =>
        query.queryKey[0] !== "session" &&
        query.queryKey[0] !== "auth-capabilities" &&
        query.state.status === "error",
    });
  }, [queryClient, sessionQuery.data?.accessToken]);
  const applyAuthenticatedSession = useCallback(
    (session: ConsoleSession) => {
      queryClient.setQueryData(["session"], session);
      sessionSyncRef.current?.publish("authenticated");
    },
    [queryClient],
  );
  const signInMutation = useMutation({
    mutationFn: (input: SignInInput) => repository.signIn(input),
    onSuccess: (result) => {
      if (result.kind === "authenticated") {
        applyAuthenticatedSession(result.session);
      }
    },
  });
  const oauthFlowMutation = useMutation({
    mutationFn: (provider: string) => repository.createOAuthLoginFlow(provider),
  });
  const oauthCallbackMutation = useMutation({
    mutationFn: (input: OAuthCallbackInput) => repository.completeOAuthLogin(input),
    onSuccess: applyAuthenticatedSession,
  });
  const registerMutation = useMutation({
    mutationFn: (input: RegisterInput) => repository.register(input),
  });
  const emailVerificationMutation = useMutation({
    mutationFn: (input: EmailVerificationInput) => repository.sendEmailVerification(input),
  });
  const passwordResetRequestMutation = useMutation({
    mutationFn: (input: PasswordResetRequestInput) => repository.requestPasswordReset(input),
  });
  const passwordResetConfirmMutation = useMutation({
    mutationFn: (input: PasswordResetConfirmInput) => repository.confirmPasswordReset(input),
  });
  const verifyTwoFactorMutation = useMutation({
    mutationFn: (input: VerifyTwoFactorLoginInput) => repository.verifyTwoFactorLogin(input),
    onSuccess: applyAuthenticatedSession,
  });
  const passkeyMutation = useMutation({
    mutationFn: () => repository.signInWithPasskey(),
    onSuccess: (session) => {
      if (session) applyAuthenticatedSession(session);
    },
  });
  const { isPending: signingOut, mutateAsync: mutateSignOut } = useMutation({
    mutationFn: () => repository.signOut(sessionQuery.data ?? null),
    onSuccess: () => {
      clearAuthenticatedQueryData();
      sessionSyncRef.current?.publish("signed-out");
    },
  });
  const signOut = useCallback(() => {
    if (signOutRequestRef.current) return signOutRequestRef.current;

    const request = mutateSignOut().finally(() => {
      signOutRequestRef.current = null;
    });
    signOutRequestRef.current = request;
    return request;
  }, [mutateSignOut]);

  return (
    <SessionContext.Provider
      value={{
        capabilities: capabilitiesQuery.data ?? null,
        capabilitiesError:
          capabilitiesQuery.error instanceof Error ? capabilitiesQuery.error : null,
        capabilitiesLoading: capabilitiesQuery.isPending,
        capabilitiesRetrying: capabilitiesQuery.isFetching,
        error: sessionQuery.error instanceof Error ? sessionQuery.error : null,
        session: sessionQuery.data ?? null,
        loading: sessionQuery.isPending,
        mode: repository.mode,
        retrying: sessionQuery.isFetching,
        signingOut,
        retryCapabilities: async () => {
          await capabilitiesQuery.refetch();
        },
        retry: async () => {
          await sessionQuery.refetch();
        },
        register: registerMutation.mutateAsync,
        createOAuthLoginFlow: oauthFlowMutation.mutateAsync,
        completeOAuthLogin: oauthCallbackMutation.mutateAsync,
        sendEmailVerification: emailVerificationMutation.mutateAsync,
        requestPasswordReset: passwordResetRequestMutation.mutateAsync,
        confirmPasswordReset: passwordResetConfirmMutation.mutateAsync,
        signIn: signInMutation.mutateAsync,
        signInWithPasskey: passkeyMutation.mutateAsync,
        verifyTwoFactorLogin: verifyTwoFactorMutation.mutateAsync,
        signOut,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used within SessionProvider");
  return value;
}
