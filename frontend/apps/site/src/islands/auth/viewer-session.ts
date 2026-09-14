export type ViewerSession = {
  accessToken: string;
  accessExpiresAt: number;
  sid: string;
};

const accessTokenLeewaySeconds = 30;
const refreshRaceDelays = [80, 200, 500] as const;

let cachedSession: ViewerSession | null = null;
let refreshPromise: Promise<ViewerSession | null> | null = null;

export async function hasViewerSession(forceRefresh = false): Promise<boolean> {
  try {
    return (await getViewerSession(forceRefresh)) !== null;
  } catch {
    return false;
  }
}

export async function getViewerSession(forceRefresh = false): Promise<ViewerSession | null> {
  const now = Math.floor(Date.now() / 1000);
  if (
    !forceRefresh &&
    cachedSession &&
    cachedSession.accessExpiresAt > now + accessTokenLeewaySeconds
  ) {
    return cachedSession;
  }
  if (forceRefresh && refreshPromise) {
    try {
      await refreshPromise;
    } catch {
      // A forced check must observe server state newer than the in-flight request.
    }
  }
  if (!refreshPromise) {
    refreshPromise = refreshViewerSessionWithLock().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export function expireViewerSession(session: ViewerSession): void {
  if (cachedSession?.sid !== session.sid) return;
  cachedSession = { ...session, accessExpiresAt: 0 };
}

export function clearViewerSession(session: ViewerSession): void {
  if (cachedSession?.sid === session.sid) cachedSession = null;
}

async function refreshViewerSessionWithLock(): Promise<ViewerSession | null> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("new-api:auth-refresh", { mode: "exclusive" }, () =>
      refreshViewerSession(0, true),
    );
  }
  return refreshViewerSession(0, true);
}

async function refreshViewerSession(
  raceAttempt: number,
  allowSessionMismatchRetry: boolean,
): Promise<ViewerSession | null> {
  const expectedSid = cachedSession?.sid;
  const headers = new Headers({ Accept: "application/json" });
  if (expectedSid) headers.set("X-Auth-Session", expectedSid);

  const response = await fetch("/api/user/auth/refresh", {
    cache: "no-store",
    credentials: "same-origin",
    headers,
    keepalive: true,
    method: "POST",
  });
  if (response.status === 401) {
    cachedSession = null;
    return null;
  }
  const payload = await readJson(response);
  const envelope = asRecord(payload);
  const code = readString(envelope.code);

  if (response.status === 409 && code === "AUTH_REFRESH_RACE") {
    const delay = refreshRaceDelays[raceAttempt];
    if (delay === undefined) throw new Error("Authentication refresh remained out of sync");
    await wait(delay);
    return refreshViewerSession(raceAttempt + 1, allowSessionMismatchRetry);
  }
  if (response.status === 409 && code === "AUTH_SESSION_MISMATCH" && allowSessionMismatchRetry) {
    cachedSession = null;
    return refreshViewerSession(0, false);
  }
  if (!response.ok) throw new Error(`Authentication refresh failed with ${response.status}`);
  if (envelope.success !== true) throw new Error("Authentication refresh returned an error");

  const data = asRecord(envelope.data);
  const accessToken = readString(data.access_token);
  const tokenType = readString(data.token_type);
  const accessExpiresAt = readNumber(data.access_expires_at);
  const sessionData = asRecord(data.session);
  const sid = readString(sessionData.sid);
  const isCurrent = sessionData.current;
  const now = Math.floor(Date.now() / 1000);
  if (
    !accessToken ||
    tokenType !== "Bearer" ||
    accessExpiresAt === null ||
    accessExpiresAt <= now ||
    !sid ||
    isCurrent !== true ||
    (expectedSid && sid !== expectedSid)
  ) {
    throw new Error("Authentication refresh returned an invalid session");
  }

  cachedSession = { accessExpiresAt, accessToken, sid };
  return cachedSession;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error("Authentication refresh returned invalid JSON");
  }
}

function wait(delay: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delay));
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
