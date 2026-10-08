import "server-only";

import { eq } from "drizzle-orm";

import type { DbOrTx } from "@/lib/db";
import { samples } from "@/lib/db/schema";
import { computeLayouts, type JobLayouts } from "@/lib/pipeline/layout";

// A job's pull list never changes after creation, so neither do its layouts.
const cache = new Map<string, JobLayouts>();

export async function jobLayouts(
  db: DbOrTx,
  jobId: string,
): Promise<JobLayouts> {
  const cached = cache.get(jobId);
  if (cached) return cached;
  const rows = await db
    .select({
      sourceBox: samples.sourceBox,
      sourcePosition: samples.sourcePosition,
      slot: samples.slot,
    })
    .from(samples)
    .where(eq(samples.jobId, jobId));
  const layouts = computeLayouts(rows);
  if (cache.size > 100) cache.clear();
  cache.set(jobId, layouts);
  return layouts;
}
