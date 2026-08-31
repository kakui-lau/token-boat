import { createContext, useCallback, useContext, useRef, type PropsWithChildren } from "react";
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

export function SessionProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const signOutRequestRef = useRef<Promise<void> | null>(null);
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: () => repository.getSession(),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const capabilitiesQuery = useQuery({
    queryKey: ["auth-capabilities"],
    queryFn: () => repository.getAuthCapabilities(),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const signInMutation = useMutation({
    mutationFn: (input: SignInInput) => repository.signIn(input),
    onSuccess: (result) => {
      if (result.kind === "authenticated") {
        queryClient.setQueryData(["session"], result.session);
      }
    },
  });
  const oauthFlowMutation = useMutation({
    mutationFn: (provider: string) => repository.createOAuthLoginFlow(provider),
  });
  const oauthCallbackMutation = useMutation({
    mutationFn: (input: OAuthCallbackInput) => repository.completeOAuthLogin(input),
    onSuccess: (session) => queryClient.setQueryData(["session"], session),
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
    onSuccess: (session) => queryClient.setQueryData(["session"], session),
  });
  const passkeyMutation = useMutation({
    mutationFn: () => repository.signInWithPasskey(),
    onSuccess: (session) => {
      if (session) queryClient.setQueryData(["session"], session);
    },
  });
  const { isPending: signingOut, mutateAsync: mutateSignOut } = useMutation({
    mutationFn: () => repository.signOut(sessionQuery.data ?? null),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(["session"], null);
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
