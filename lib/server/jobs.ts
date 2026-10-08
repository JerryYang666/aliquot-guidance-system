import "server-only";

import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";

import type { BatchListItem, OnlineParticipant } from "@/lib/api-types";
import type { DbOrTx } from "@/lib/db";
import {
  batches,
  jobs,
  participants,
  samples,
  type JobRow,
} from "@/lib/db/schema";
import { isValidJobCode, normalizeJobCode } from "@/lib/job-code";
import type { JobInfo, Sample } from "@/lib/pipeline/types";

import { HttpError } from "./errors";
import { toIso, toSample } from "./rows";

export const ONLINE_WINDOW_SECONDS = 75;

export async function getJobByCode(
  db: DbOrTx,
  rawCode: string,
): Promise<JobRow> {
  const code = normalizeJobCode(rawCode);
  if (!isValidJobCode(code))
    throw new HttpError(404, "no_job", "No job has this code.");
  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.code, code))
    .limit(1);
  if (!job) throw new HttpError(404, "no_job", "No job has this code.");
  return job;
}

export function toJobInfo(job: JobRow): JobInfo {
  return {
    id: job.id,
    code: job.code,
    name: job.name,
    destSets: job.destSets,
    createdAt: toIso(job.createdAt),
    createdBy: job.createdBy,
  };
}

export async function listBatches(
  db: DbOrTx,
  jobId: string,
): Promise<BatchListItem[]> {
  const rows = await db
    .select({
      number: batches.number,
      boxNumber: batches.boxNumber,
      title: batches.title,
      total: sql<number>`count(${samples.id})::int`,
      finished: sql<number>`count(${samples.finishedAt})::int`,
      returned: sql<number>`count(${samples.returnedAt})::int`,
      firstNewId: sql<string>`min(${samples.newId})`,
      lastNewId: sql<string>`max(${samples.newId})`,
    })
    .from(batches)
    .leftJoin(samples, eq(samples.batchId, batches.id))
    .where(eq(batches.jobId, jobId))
    .groupBy(batches.id)
    .orderBy(asc(batches.number));
  return rows;
}

export async function getBatch(db: DbOrTx, jobId: string, number: number) {
  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.jobId, jobId), eq(batches.number, number)))
    .limit(1);
  if (!batch)
    throw new HttpError(404, "no_batch", `This job has no batch ${number}.`);
  return batch;
}

export async function batchSamples(
  db: DbOrTx,
  batchId: string,
): Promise<Sample[]> {
  const rows = await db
    .select()
    .from(samples)
    .where(eq(samples.batchId, batchId))
    .orderBy(asc(samples.pullOrder));
  return rows.map(toSample);
}

export async function onlineParticipants(
  db: DbOrTx,
  jobId: string,
): Promise<OnlineParticipant[]> {
  return db
    .select({
      id: participants.id,
      name: participants.name,
      role: participants.role,
      batchNumber: participants.batchNumber,
    })
    .from(participants)
    .where(
      and(
        eq(participants.jobId, jobId),
        isNull(participants.leftAt),
        gt(
          participants.lastSeenAt,
          sql`clock_timestamp() - make_interval(secs => ${ONLINE_WINDOW_SECONDS})`,
        ),
      ),
    )
    .orderBy(asc(participants.joinedAt));
}
