import { getDb } from "@/lib/db";
import { handle, json } from "@/lib/server/errors";
import { getJobByCode } from "@/lib/server/jobs";
import type { CodeContext } from "@/lib/server/route";
import { requireParticipant } from "@/lib/server/tokens";

/** The cheap check screens poll when the relay is unavailable. */
export const GET = handle(async (request: Request, context: CodeContext) => {
  const { code } = await context.params;
  await requireParticipant(request, code);
  const job = await getJobByCode(getDb(), code);
  return json({ version: job.version });
});
