import { after } from "next/server";

import { getDb } from "@/lib/db";
import { actionRequestSchema, performAction } from "@/lib/server/actions";
import { handle, json } from "@/lib/server/errors";
import { publishChange } from "@/lib/server/realtime";
import { parseBody, type CodeContext } from "@/lib/server/route";
import { requireParticipant } from "@/lib/server/tokens";

/** Every change to a job's samples goes through here; see docs/design.md. */
export const POST = handle(async (request: Request, context: CodeContext) => {
  const participant = await requireParticipant(
    request,
    (await context.params).code,
  );
  const body = await parseBody(request, actionRequestSchema);
  const result = await performAction(getDb(), participant, body);
  if (result.events.length) {
    after(() =>
      publishChange(participant.jobId, {
        type: "change",
        version: result.version,
        samples: result.samples,
        events: result.events,
      }),
    );
  }
  return json(result);
});
