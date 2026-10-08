import "server-only";

import { asc, desc, eq, sql } from "drizzle-orm";

import type { AdminJob, AdminJobStateResponse } from "@/lib/api-types";
import type { Db, DbOrTx } from "@/lib/db";
import { batches, events, samples } from "@/lib/db/schema";

import {
  getJobByCode,
  ONLINE_WINDOW_SECONDS,
  onlineParticipants,
  toJobInfo,
} from "../jobs";
import { jobLayouts } from "../layouts";
import { toIso, toLogEvent, toSample } from "../rows";

/** How far back the activity feed of a job being watched starts. */
const RECENT_EVENTS = 100;

interface JobOverviewRow extends Record<string, unknown> {
  code: string;
  name: string;
  created_by: string;
  created_at: string;
  batches: number;
  samples: number;
  finished: number;
  online: number;
  last_activity_at: string | null;
}

/** Every job, newest first, with how far along it is and who is on it now. */
export async function listAllJobs(db: DbOrTx): Promise<AdminJob[]> {
  const { rows } = await db.execute<JobOverviewRow>(sql`
    SELECT
      j.code,
      j.name,
      j.created_by,
      j.created_at::text,
      (SELECT count(*)::int FROM batches b WHERE b.job_id = j.id) AS batches,
      (SELECT count(*)::int FROM samples s WHERE s.job_id = j.id) AS samples,
      (SELECT count(s.finished_at)::int FROM samples s WHERE s.job_id = j.id)
        AS finished,
      (SELECT count(*)::int FROM participants p
        WHERE p.job_id = j.id
          AND p.left_at IS NULL
          AND p.last_seen_at >
            clock_timestamp() - make_interval(secs => ${ONLINE_WINDOW_SECONDS}))
        AS online,
      (SELECT e.at::text FROM events e
        WHERE e.job_id = j.id ORDER BY e.id DESC LIMIT 1) AS last_activity_at
    FROM jobs j
    ORDER BY j.created_at DESC
  `);
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    batches: row.batches,
    samples: row.samples,
    finished: row.finished,
    online: row.online,
    lastActivityAt: toIso(row.last_activity_at),
  }));
}

/**
 * A whole job as of one version: every batch's samples, who is online and
 * the latest events. Reading it leaves no trace in the job; an admin who
 * watches has not joined.
 */
export async function watchJob(
  db: Db,
  code: string,
): Promise<AdminJobStateResponse> {
  // One snapshot: the version and the rows it describes are read together.
  return db.transaction(
    async (tx) => {
      const job = await getJobByCode(tx, code);
      const sampleRows = await tx
        .select()
        .from(samples)
        .where(eq(samples.jobId, job.id))
        .orderBy(asc(samples.batchNumber), asc(samples.pullOrder));
      const eventRows = await tx
        .select()
        .from(events)
        .where(eq(events.jobId, job.id))
        .orderBy(desc(events.id))
        .limit(RECENT_EVENTS);
      return {
        version: job.version,
        job: toJobInfo(job),
        batches: await tx
          .select({
            number: batches.number,
            boxNumber: batches.boxNumber,
            title: batches.title,
          })
          .from(batches)
          .where(eq(batches.jobId, job.id))
          .orderBy(asc(batches.number)),
        samples: sampleRows.map(toSample),
        online: await onlineParticipants(tx, job.id),
        feed: eventRows.map(toLogEvent),
        layouts: await jobLayouts(tx, job.id),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
