import {
  parsePublicPricingEnvelope,
  type PricingAudience,
  type PublicPricingModel,
} from "@/islands/pricing/public-pricing";
import {
  clearViewerSession,
  expireViewerSession,
  getViewerSession,
  type ViewerSession,
} from "@/islands/auth/viewer-session";

export type ViewerPricingCatalog = {
  audience: ViewerPricingAudience;
  models: PublicPricingModel[];
  officialModels: PublicPricingModel[];
};

export type ViewerPricingAudience = PricingAudience | "degraded";

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
        clearViewerSession(session);
        return fetchOfficialPricing("degraded", signal);
      }
      expireViewerSession(session);

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
