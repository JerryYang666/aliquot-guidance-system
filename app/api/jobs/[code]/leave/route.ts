import { after } from "next/server";

import { getDb } from "@/lib/db";
import { handle, json } from "@/lib/server/errors";
import { leaveJob } from "@/lib/server/participants";
import { publishChange } from "@/lib/server/realtime";
import type { CodeContext } from "@/lib/server/route";
import { requireParticipant } from "@/lib/server/tokens";

export const POST = handle(async (request: Request, context: CodeContext) => {
  const me = await requireParticipant(request, (await context.params).code);
  const result = await leaveJob(getDb(), me);
  if (result) {
    after(() =>
      publishChange(me.jobId, {
        type: "change",
        version: result.version,
        samples: [],
        events: result.events,
      }),
    );
  }
  return json({ ok: true });
});
