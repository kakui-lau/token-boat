import {
  parsePublicPricingEnvelope,
  type PricingAudience,
  type PublicPricingModel,
} from "@/islands/pricing/public-pricing";

export type ViewerPricingCatalog = {
  audience: ViewerPricingAudience;
  models: PublicPricingModel[];
  officialModels: PublicPricingModel[];
};

export type ViewerPricingAudience = PricingAudience | "degraded";

type ViewerSession = {
  accessToken: string;
  accessExpiresAt: number;
  sid: string;
};

const accessTokenLeewaySeconds = 30;
const refreshRaceDelays = [80, 200, 500] as const;

let cachedSession: ViewerSession | null = null;
let refreshPromise: Promise<ViewerSession | null> | null = null;

export async function fetchViewerPricing(signal?: AbortSignal): Promise<ViewerPricingCatalog> {
  let session: ViewerSession | null;
  try {
    session = await getViewerSession();
  } catch {
    throwIfAborted(signal);
    return fetchOfficialPricing("degraded", signal);
  }
  throwIfAborted(signal);

  if (session) {
    return fetchAccountPricing(session, signal, true);
  }

  return fetchOfficialPricing("official", signal);
}

async function fetchAccountPricing(
  session: ViewerSession,
  signal: AbortSignal | undefined,
  retryAuthentication: boolean,
): Promise<ViewerPricingCatalog> {
  try {
    const response = await requestPricing(session.accessToken, signal);
    if (response.status === 401) {
      if (!retryAuthentication) {
        cachedSession = null;
        return fetchOfficialPricing("degraded", signal);
      }
      cachedSession = { ...session, accessExpiresAt: 0 };

      let refreshedSession: ViewerSession | null;
      try {
        refreshedSession = await getViewerSession();
      } catch {
        throwIfAborted(signal);
        return fetchOfficialPricing("degraded", signal);
      }
      throwIfAborted(signal);
      if (!refreshedSession) return fetchOfficialPricing("official", signal);
      return fetchAccountPricing(refreshedSession, signal, false);
    }

    const payload = await readPricingEnvelope(response);
    return {
      audience: "account",
      models: parsePublicPricingEnvelope(payload, "account"),
      officialModels: parsePublicPricingEnvelope(payload, "official"),
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return fetchOfficialPricing("degraded", signal);
  }
}

async function fetchOfficialPricing(
  audience: "degraded" | "official",
  signal?: AbortSignal,
): Promise<ViewerPricingCatalog> {
  const response = await requestPricing(null, signal);
  const payload = await readPricingEnvelope(response);
  const officialModels = parsePublicPricingEnvelope(payload, "official");
  return {
    audience,
    models: officialModels,
    officialModels,
  };
}

async function getViewerSession(): Promise<ViewerSession | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedSession && cachedSession.accessExpiresAt > now + accessTokenLeewaySeconds) {
    return cachedSession;
  }
  if (!refreshPromise) {
    refreshPromise = refreshViewerSessionWithLock().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
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
  const payload = await readJson(response, "Authentication refresh");
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

function requestPricing(accessToken: string | null, signal?: AbortSignal): Promise<Response> {
  const headers = new Headers({ Accept: "application/json" });
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch("/api/pricing", {
    cache: "no-store",
    credentials: "same-origin",
    headers,
    signal,
  });
}

async function readPricingEnvelope(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`Pricing request failed with ${response.status}`);
  const payload = await readJson(response, "Pricing request");
  const envelope = asRecord(payload);
  if (envelope.success !== true || !Array.isArray(envelope.data)) {
    throw new Error("Pricing request returned an invalid response");
  }
  return payload;
}

async function readJson(response: Response, requestName: string): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error(`${requestName} returned invalid JSON`);
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
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
