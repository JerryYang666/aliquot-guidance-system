import "server-only";

import { and, asc, eq, gt, isNull, or, sql, type SQL } from "drizzle-orm";

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

/**
 * How long after a page says goodbye its station still counts as online. A
 * reload says goodbye too, and the page is back within a moment; without
 * this, someone waiting could take the role in that moment.
 */
export const GOODBYE_GRACE_SECONDS = 5;

/**
 * Online: has not left, did not say goodbye more than a few seconds ago,
 * and was heard from within the window. The window is only the fallback,
 * for a station that vanishes without a word (a crash, a dead battery, no
 * network).
 */
export const isOnline: SQL = sql`${and(
  isNull(participants.leftAt),
  or(
    isNull(participants.goneAt),
    gt(
      participants.goneAt,
      sql`clock_timestamp() - make_interval(secs => ${GOODBYE_GRACE_SECONDS})`,
    ),
  ),
  gt(
    participants.lastSeenAt,
    sql`clock_timestamp() - make_interval(secs => ${ONLINE_WINDOW_SECONDS})`,
  ),
)}`;

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
    archivedAt: toIso(job.archivedAt),
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

/**
 * Who is on the job now. A batch has one Puller, one Labeler and one
 * Aliquoter at work: of several people in the same role, the one who has
 * been there longest holds it and the others wait. Overview is never held.
 */
export async function onlineParticipants(
  db: DbOrTx,
  jobId: string,
): Promise<OnlineParticipant[]> {
  const rows = await db
    .select({
      id: participants.id,
      name: participants.name,
      role: participants.role,
      batchNumber: participants.batchNumber,
    })
    .from(participants)
    .where(and(eq(participants.jobId, jobId), isOnline))
    .orderBy(asc(participants.queuedAt), asc(participants.joinedAt));
  const held = new Set<string>();
  return rows.map((p) => {
    const station = `${p.role} ${p.batchNumber}`;
    const waiting = p.role !== "overview" && held.has(station);
    held.add(station);
    return { ...p, waiting };
  });
}
