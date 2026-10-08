import type { ParseResponse } from "@/lib/api-types";
import { handle, HttpError, json } from "@/lib/server/errors";
import { summarizeBatch } from "@/lib/workbook/model";
import { parseWorkbook } from "@/lib/workbook/parse";

const MAX_BYTES = 4 * 1024 * 1024;

/** Reads an uploaded workbook and returns the job data it would create, without saving it. */
export const POST = handle(async (request: Request) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    throw new HttpError(400, "bad_request", "Choose a workbook file.");
  if (file.size > MAX_BYTES)
    throw new HttpError(413, "too_large", "The workbook is over 4 MB.");
  const result = await parseWorkbook(await file.arrayBuffer());
  const body: ParseResponse = {
    workbook: result.workbook,
    summary: result.workbook?.batches.map(summarizeBatch) ?? [],
    errors: result.errors,
    warnings: result.warnings,
  };
  return json(body);
});
