import type { JobSummaryResponse } from "@/lib/api-types";
import { getDb } from "@/lib/db";
import { handle, json } from "@/lib/server/errors";
import { getJobByCode, listBatches, toJobInfo } from "@/lib/server/jobs";
import type { CodeContext } from "@/lib/server/route";

/** What the join screen shows: the job and its batches' progress. Knowing the code is enough. */
export const GET = handle(async (_request: Request, context: CodeContext) => {
  const db = getDb();
  const job = await getJobByCode(db, (await context.params).code);
  const { id: _id, ...info } = toJobInfo(job);
  return json({
    job: info,
    batches: await listBatches(db, job.id),
  } satisfies JobSummaryResponse);
});
