import type { TicketResponse } from "@/lib/api-types";
import { handle, json } from "@/lib/server/errors";
import { mintRelayTicket } from "@/lib/server/realtime";
import type { CodeContext } from "@/lib/server/route";
import { requireParticipant } from "@/lib/server/tokens";

/** A short-lived ticket for the realtime relay; url is null when no relay is configured. */
export const POST = handle(async (request: Request, context: CodeContext) => {
  const me = await requireParticipant(request, (await context.params).code);
  const ticket = await mintRelayTicket(me.jobId, me.participantId);
  return json((ticket ?? { url: null, ticket: null }) satisfies TicketResponse);
});
