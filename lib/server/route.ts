import "server-only";

import type { ZodType } from "zod";

import { HttpError, readJson } from "./errors";

export interface CodeContext {
  params: Promise<{ code: string }>;
}

/** Parses a JSON body against a schema, answering 400 with the first problem. */
export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  const result = schema.safeParse(await readJson(request));
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(
      400,
      "bad_request",
      issue?.message ?? "The request is not valid.",
    );
  }
  return result.data;
}
