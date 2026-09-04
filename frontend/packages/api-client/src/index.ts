export type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  code?: string;
  data?: T;
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(message: string, status: number, code?: string, requestId?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

type ApiClientOptions = {
  baseUrl?: string;
};

type RequestOptions = {
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  authenticated?: boolean;
};

export function createApiClient(options: ApiClientOptions = {}) {
  let accessToken: string | null = null;

  async function fetchJson<T>(
    request: RequestOptions,
  ): Promise<{ response: Response; payload: T }> {
    const headers = new Headers(request.headers);
    headers.set("Accept", "application/json");
    headers.set("Cache-Control", "no-store");

    if (request.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    if (request.authenticated !== false && accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    const response = await fetch(`${options.baseUrl ?? ""}${request.path}`, {
      method: request.method ?? "GET",
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      cache: "no-store",
      credentials: "include",
      headers,
      signal: request.signal,
    });

    try {
      return { response, payload: (await response.json()) as T };
    } catch {
      throw new ApiClientError(
        "The server returned an invalid response.",
        response.status,
        undefined,
        responseRequestId(response),
      );
    }
  }

  return {
    clearAccessToken() {
      accessToken = null;
    },
    setAccessToken(token: string | null) {
      accessToken = token;
    },
    async request<T>(request: RequestOptions): Promise<ApiEnvelope<T>> {
      const { response, payload: envelope } = await fetchJson<ApiEnvelope<T>>(request);

      if (!response.ok || envelope.success !== true) {
        throw new ApiClientError(
          envelope.message || `Request failed with status ${response.status}.`,
          response.status,
          envelope.code,
          responseRequestId(response),
        );
      }

      return envelope;
    },
    async requestRaw<T>(request: RequestOptions): Promise<T> {
      const { response, payload } = await fetchJson<T>(request);
      if (!response.ok) {
        const record =
          payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        throw new ApiClientError(
          typeof record.message === "string"
            ? record.message
            : `Request failed with status ${response.status}.`,
          response.status,
          typeof record.code === "string" ? record.code : undefined,
          responseRequestId(response),
        );
      }
      return payload;
    },
    async requestBlob(request: RequestOptions): Promise<Blob> {
      const headers = new Headers(request.headers);
      headers.set("Accept", "*/*");
      headers.set("Cache-Control", "no-store");
      if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

      const response = await fetch(`${options.baseUrl ?? ""}${request.path}`, {
        method: request.method ?? "GET",
        cache: "no-store",
        credentials: "include",
        headers,
        signal: request.signal,
      });
      if (!response.ok) {
        let message = `Request failed with status ${response.status}.`;
        let code: string | undefined;
        try {
          const payload = (await response.clone().json()) as Record<string, unknown>;
          if (typeof payload.message === "string") message = payload.message;
          if (typeof payload.code === "string") code = payload.code;
          const error = payload.error;
          if (error && typeof error === "object") {
            const errorMessage = (error as Record<string, unknown>).message;
            if (typeof errorMessage === "string") message = errorMessage;
          }
        } catch {
          // Keep the status-derived message for non-JSON media errors.
        }
        throw new ApiClientError(message, response.status, code, responseRequestId(response));
      }
      return response.blob();
    },
  };
}

function responseRequestId(response: Response): string | undefined {
  const requestId = response.headers.get("X-Oneapi-Request-Id")?.trim();
  return requestId || undefined;
}

export type ApiClient = ReturnType<typeof createApiClient>;
