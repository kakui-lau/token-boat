import type { ConsoleRepository } from "./contracts";
import { demoRepository } from "./demo-repository";
import { liveSessionRepository } from "./live-session-repository";

type ConsoleSessionRepositoryKey =
  | "mode"
  | "getAuthCapabilities"
  | "createOAuthLoginFlow"
  | "completeOAuthLogin"
  | "register"
  | "sendEmailVerification"
  | "requestPasswordReset"
  | "confirmPasswordReset"
  | "getSession"
  | "signIn"
  | "verifyTwoFactorLogin"
  | "signInWithPasskey"
  | "beginEVMWalletAuth"
  | "completeEVMWalletAuth"
  | "clearLocalSession"
  | "signOut";

export type ConsoleSessionRepository = Pick<ConsoleRepository, ConsoleSessionRepositoryKey>;

type ConsoleAuthActionRepositoryKey =
  | "createOAuthLoginFlow"
  | "completeOAuthLogin"
  | "register"
  | "sendEmailVerification"
  | "requestPasswordReset"
  | "confirmPasswordReset"
  | "signIn"
  | "verifyTwoFactorLogin"
  | "signInWithPasskey"
  | "beginEVMWalletAuth"
  | "completeEVMWalletAuth";

export type ConsoleAuthActionRepository = Pick<ConsoleRepository, ConsoleAuthActionRepositoryKey>;

export const sessionRepository: ConsoleSessionRepository =
  import.meta.env.VITE_CONSOLE_DATA_MODE === "demo" ? demoRepository : liveSessionRepository;
