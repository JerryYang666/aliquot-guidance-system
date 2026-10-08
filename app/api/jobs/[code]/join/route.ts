import { after } from "next/server";

import type { JoinResponse } from "@/lib/api-types";
import { getDb } from "@/lib/db";
import { handle, json } from "@/lib/server/errors";
import { getJobByCode } from "@/lib/server/jobs";
import { joinJob, joinRequestSchema } from "@/lib/server/participants";
import { publishChange } from "@/lib/server/realtime";
import { parseBody, type CodeContext } from "@/lib/server/route";

export const POST = handle(async (request: Request, context: CodeContext) => {
  const db = getDb();
  const job = await getJobByCode(db, (await context.params).code);
  const input = await parseBody(request, joinRequestSchema);
  const result = await joinJob(
    db,
    job.id,
    input,
    request.headers.get("user-agent"),
  );
  after(() =>
    publishChange(job.id, {
      type: "change",
      version: result.version,
      samples: [],
      events: result.events,
    }),
  );
  const { participantId, name, role, batchNumber } = result.participant;
  return json({
    token: result.token,
    me: { participantId, name, role, batchNumber },
  } satisfies JoinResponse);
});
