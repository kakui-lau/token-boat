import { createApiClient } from "@token-boat/api-client";

import type { ConsoleSession } from "./contracts";

export const liveApiClient = createApiClient({
  baseUrl: import.meta.env.VITE_CONSOLE_API_BASE_URL,
});

let currentSession: ConsoleSession | null = null;

export function clearLiveSession() {
  currentSession = null;
  liveApiClient.clearAccessToken();
}

export function getLiveSession(): ConsoleSession | null {
  return currentSession;
}

export function setLiveSession(session: ConsoleSession): ConsoleSession {
  currentSession = session;
  liveApiClient.setAccessToken(session.accessToken ?? null);
  return session;
}
