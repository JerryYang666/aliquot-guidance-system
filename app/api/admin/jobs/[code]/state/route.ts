import { getDb } from "@/lib/db";
import { watchJob } from "@/lib/server/admin/jobs";
import { requireAdmin } from "@/lib/server/admin/session";
import { handle, json } from "@/lib/server/errors";
import type { CodeContext } from "@/lib/server/route";

/** Everything an admin's screen needs to watch a job, as of one job version. */
export const GET = handle(async (request: Request, context: CodeContext) => {
  await requireAdmin(request);
  return json(await watchJob(getDb(), (await context.params).code));
});
