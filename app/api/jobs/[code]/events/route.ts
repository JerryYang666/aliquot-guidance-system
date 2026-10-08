import { and, desc, eq, lt, type SQL } from "drizzle-orm";

import type { EventsResponse } from "@/lib/api-types";
import { getDb } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { handle, json } from "@/lib/server/errors";
import { toLogEvent } from "@/lib/server/rows";
import type { CodeContext } from "@/lib/server/route";
import { requireParticipant } from "@/lib/server/tokens";

/** The event log, newest first, a page at a time (?before=<id>&limit=&batch=). */
export const GET = handle(async (request: Request, context: CodeContext) => {
  const me = await requireParticipant(request, (await context.params).code);
  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 200, 1), 1000);
  const before = Number(params.get("before"));
  const batch = Number(params.get("batch"));

  const where: SQL[] = [eq(events.jobId, me.jobId)];
  if (Number.isInteger(before) && before > 0) where.push(lt(events.id, before));
  if (Number.isInteger(batch) && batch > 0)
    where.push(eq(events.batchNumber, batch));

  const rows = await getDb()
    .select()
    .from(events)
    .where(and(...where))
    .orderBy(desc(events.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit).map(toLogEvent);
  const body: EventsResponse = {
    events: page,
    nextBefore:
      rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
  };
  return json(body);
});
