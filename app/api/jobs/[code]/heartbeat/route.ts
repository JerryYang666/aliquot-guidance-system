import { getDb } from "@/lib/db";
import { handle, json } from "@/lib/server/errors";
import { onlineParticipants } from "@/lib/server/jobs";
import { heartbeat } from "@/lib/server/participants";
import type { CodeContext } from "@/lib/server/route";
import { requireParticipant } from "@/lib/server/tokens";

/** Keeps a station on the online list and returns the list. Not logged. */
export const POST = handle(async (request: Request, context: CodeContext) => {
  const db = getDb();
  const me = await requireParticipant(request, (await context.params).code);
  await heartbeat(db, me);
  return json({ online: await onlineParticipants(db, me.jobId) });
});
