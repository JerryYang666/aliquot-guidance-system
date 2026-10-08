import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/server/admin/session";
import { handle, json } from "@/lib/server/errors";
import { getJobByCode, onlineParticipants } from "@/lib/server/jobs";
import type { CodeContext } from "@/lib/server/route";

/** Who is on this job right now. Asking does not put the admin on the list. */
export const GET = handle(async (request: Request, context: CodeContext) => {
  await requireAdmin(request);
  const db = getDb();
  const job = await getJobByCode(db, (await context.params).code);
  return json({ online: await onlineParticipants(db, job.id) });
});
