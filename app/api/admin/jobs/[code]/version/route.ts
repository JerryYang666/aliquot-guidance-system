import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/server/admin/session";
import { handle, json } from "@/lib/server/errors";
import { getJobByCode } from "@/lib/server/jobs";
import type { CodeContext } from "@/lib/server/route";

/** The cheap check an admin's screen polls when the relay is unavailable. */
export const GET = handle(async (request: Request, context: CodeContext) => {
  await requireAdmin(request);
  const job = await getJobByCode(getDb(), (await context.params).code);
  return json({ version: job.version });
});
