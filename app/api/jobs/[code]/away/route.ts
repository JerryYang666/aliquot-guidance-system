import { after } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { handle, HttpError, json } from "@/lib/server/errors";
import { GOODBYE_GRACE_SECONDS } from "@/lib/server/jobs";
import { goAway, SEEN_AT_PATTERN } from "@/lib/server/participants";
import { publishPresence } from "@/lib/server/realtime";
import { parseBody, type CodeContext } from "@/lib/server/route";
import { verifyParticipantToken } from "@/lib/server/tokens";

// The page sends this as a beacon while it unloads. A beacon cannot carry
// an Authorization header, so the token travels in the body.
const awaySchema = z.object({
  token: z.string().min(1),
  seenAt: z.string().regex(SEEN_AT_PATTERN),
});

/** A station's page is going away: its role is free in a few seconds. Not logged. */
export const POST = handle(async (request: Request, context: CodeContext) => {
  const { token, seenAt } = await parseBody(request, awaySchema);
  const me = await verifyParticipantToken(token);
  if (me.code !== (await context.params).code) {
    throw new HttpError(403, "wrong_job", "This session is for another job.");
  }
  if (await goAway(getDb(), me, seenAt)) {
    // Screens ask who is online once the grace has run out.
    after(() => publishPresence(me.jobId, GOODBYE_GRACE_SECONDS * 1000 + 500));
  }
  return json({ ok: true });
});
