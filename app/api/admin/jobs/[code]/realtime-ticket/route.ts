import type { TicketResponse } from "@/lib/api-types";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/server/admin/session";
import { handle, json } from "@/lib/server/errors";
import { getJobByCode } from "@/lib/server/jobs";
import { mintRelayTicket } from "@/lib/server/realtime";
import type { CodeContext } from "@/lib/server/route";

/** A relay ticket for an admin watching this job; url is null when no relay is configured. */
export const POST = handle(async (request: Request, context: CodeContext) => {
  const admin = await requireAdmin(request);
  const job = await getJobByCode(getDb(), (await context.params).code);
  const ticket = await mintRelayTicket(job.id, `admin:${admin.id}`);
  return json((ticket ?? { url: null, ticket: null }) satisfies TicketResponse);
});
