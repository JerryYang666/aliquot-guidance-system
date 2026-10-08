/** An error that becomes a JSON response with this status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Wraps a route handler so thrown HttpErrors become their JSON response. */
export function handle<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof HttpError) {
        return json(
          { error: { code: error.code, message: error.message } },
          error.status,
        );
      }
      console.error("[api] unhandled error:", error);
      return json(
        { error: { code: "internal", message: "Something went wrong." } },
        500,
      );
    }
  };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "bad_request", "The request body is not JSON.");
  }
}
