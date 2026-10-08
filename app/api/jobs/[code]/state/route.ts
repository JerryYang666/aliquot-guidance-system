import type { StateResponse } from "@/lib/api-types";
import { getDb } from "@/lib/db";
import { after } from "next/server";

import { handle, HttpError, json } from "@/lib/server/errors";
import {
  batchSamples,
  getBatch,
  getJobByCode,
  listBatches,
  onlineParticipants,
  toJobInfo,
} from "@/lib/server/jobs";
import { jobLayouts } from "@/lib/server/layouts";
import { heartbeat } from "@/lib/server/participants";
import { publishPresence } from "@/lib/server/realtime";
import type { CodeContext } from "@/lib/server/route";
import { requireParticipant } from "@/lib/server/tokens";

/** Everything a station's screen needs for its batch, as of one job version. */
export const GET = handle(async (request: Request, context: CodeContext) => {
  const db = getDb();
  const { code } = await context.params;
  const me = await requireParticipant(request, code);
  const param = new URL(request.url).searchParams.get("batch");
  const batchNumber = param ? Number(param) : me.batchNumber;
  if (!Number.isInteger(batchNumber))
    throw new HttpError(400, "bad_request", "Bad batch number.");

  const { seenAt, cameBack } = await heartbeat(db, me);
  if (cameBack) after(() => publishPresence(me.jobId));
  // One snapshot: the version and the rows it describes are read together.
  const { job, batch, samples, batches, online, layouts } =
    await db.transaction(
      async (tx) => {
        const job = await getJobByCode(tx, code);
        const batch = await getBatch(tx, job.id, batchNumber);
        return {
          job,
          batch,
          samples: await batchSamples(tx, batch.id),
          batches: await listBatches(tx, job.id),
          online: await onlineParticipants(tx, job.id),
          layouts: await jobLayouts(tx, job.id),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  const body: StateResponse = {
    seenAt,
    version: job.version,
    job: toJobInfo(job),
    batch: {
      number: batch.number,
      boxNumber: batch.boxNumber,
      title: batch.title,
    },
    batches,
    samples,
    online,
    me: {
      participantId: me.participantId,
      name: me.name,
      role: me.role,
      batchNumber: me.batchNumber,
    },
    layouts,
  };
  return json(body);
});
