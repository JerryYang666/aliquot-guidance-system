import "server-only";

import { sql } from "drizzle-orm";

import type { AdminJob } from "@/lib/api-types";
import type { DbOrTx } from "@/lib/db";

import { ONLINE_WINDOW_SECONDS } from "../jobs";
import { toIso } from "../rows";

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
