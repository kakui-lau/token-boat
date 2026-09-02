import type { ConsoleSession, ConsoleUser, EVMWalletAuthChallenge } from "./contracts";
import {
  asRecord,
  LiveDataContractError,
  readOptionalBoolean,
  readString,
  readUnixTime,
  requireBoolean,
  requireNumber,
  requireString,
} from "./live-contract";
import { setLiveSession } from "./live-repository-runtime";

export function mapLiveUser(value: unknown): ConsoleUser {
  const user = asRecord(value);
  return {
    id: requireNumber(user, "id", "user.id"),
    username: requireString(user, "username", "user.username"),
    usernameEditable: readOptionalBoolean(user, "username_editable") === true,
    passwordSet: requireBoolean(user, "has_password", "user.has_password"),
    displayName:
      readString(user, "display_name") || requireString(user, "username", "user.username"),
    email: readString(user, "email"),
    group: requireString(user, "group", "user.group"),
    role: requireNumber(user, "role", "user.role"),
    quotaUnits: requireNumber(user, "quota", "user.quota"),
    usedQuotaUnits: requireNumber(user, "used_quota", "user.used_quota"),
    requestCount: requireNumber(user, "request_count", "user.request_count"),
    createdAt: readUnixTime(user, "created_time"),
  };
}

export function mapLiveEVMWalletChallenge(value: unknown): EVMWalletAuthChallenge {
  const challenge = asRecord(value);
  const chainId = Number(requireString(challenge, "chain_id", "evm_wallet.chain_id"));
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new LiveDataContractError("evm_wallet.chain_id");
  }
  return {
    address: requireString(challenge, "address", "evm_wallet.address"),
    chainId,
    expiresAt: requireNumber(challenge, "expires_at", "evm_wallet.expires_at"),
    flowToken: requireString(challenge, "flow_token", "evm_wallet.flow_token"),
    message: requireString(challenge, "message", "evm_wallet.message"),
    nonce: requireString(challenge, "nonce", "evm_wallet.nonce"),
  };
}

export function mapLiveSessionBundle(value: unknown): ConsoleSession {
  const bundle = asRecord(value);
  const session = asRecord(bundle.session);
  return setLiveSession({
    user: mapLiveUser(bundle.user),
    accessToken: requireString(bundle, "access_token", "session.access_token"),
    accessExpiresAt: requireNumber(bundle, "access_expires_at", "session.access_expires_at"),
    sessionId: requireString(session, "sid", "session.sid"),
  });
}
