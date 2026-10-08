import type { ApiError } from "@/lib/api-types";

/** A failed API call, carrying the server's error code. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

const RETRY_DELAYS_MS = [400, 1200, 3000];

/**
 * Calls the API. Network failures are retried a few times, which is safe
 * because every mutating call is idempotent (actions carry their own id).
 * HTTP errors are not retried.
 */
export async function api<T>(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
    retry?: boolean;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const init: RequestInit = {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    cache: "no-store",
    body:
      options.body === undefined
        ? undefined
        : options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body),
  };

  const delays = options.retry === false ? [] : RETRY_DELAYS_MS;
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(path, init);
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined) {
        throw new ApiFailure(0, "network", "No connection to the server.", {
          cause: error,
        });
      }
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    if (response.ok) return (await response.json()) as T;
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiFailure(
      response.status,
      body?.error.code ?? "http",
      body?.error.message ?? `Request failed (${response.status}).`,
    );
  }
}
