import "server-only";

import { createHash } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Db } from "@/lib/db";
import { jobs, participants } from "@/lib/db/schema";
import { ROLES, type LogEvent, type Role } from "@/lib/pipeline/types";

import { commitChange } from "./actions";
import { HttpError } from "./errors";
import { getBatch, isOnline } from "./jobs";
import { signParticipantToken, type Participant } from "./tokens";

export const joinRequestSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(60),
  role: z.enum(ROLES as [Role, ...Role[]]),
  batchNumber: z.number().int().min(1),
  /** A random ID the browser makes for each press of Start. */
  attempt: z
    .string()
    .regex(/^[0-9a-f-]{32,36}$/i)
    .optional(),
});

/**
 * The participant an attempt to join creates. A browser that gets no answer
 * sends the same attempt again; it must find the station it already took,
 * not take a second one and wait behind itself. The attempt is known only
 * to that browser, so nobody else can arrive at this ID.
 */
function participantIdFor(jobId: string, attempt: string | undefined): string {
  if (!attempt) return crypto.randomUUID();
  const hex = createHash("sha256").update(`${jobId}:${attempt}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export interface JoinResult {
  token: string;
  participant: Participant;
  version: number;
  events: LogEvent[];
}

/**
 * Records a person taking a station (role + batch) and hands back their
 * token. Nobody is turned away: if the role is taken on that batch, they
 * wait behind whoever holds it (see onlineParticipants).
 */
export async function joinJob(
  db: Db,
  jobId: string,
  input: z.infer<typeof joinRequestSchema>,
  userAgent: string | null,
): Promise<JoinResult> {
  await getBatch(db, jobId, input.batchNumber);
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .for("update");
    if (!job) throw new HttpError(404, "no_job", "No job has this code.");
    const participantId = participantIdFor(jobId, input.attempt);
    const [already] = await tx
      .select()
      .from(participants)
      .where(eq(participants.id, participantId))
      .limit(1);
    if (already) {
      // This attempt got through before; its answer was lost on the way back.
      const participant: Participant = {
        participantId,
        jobId,
        code: job.code,
        name: already.name,
        role: already.role,
        batchNumber: already.batchNumber ?? input.batchNumber,
      };
      return {
        token: await signParticipantToken(participant),
        participant,
        version: job.version,
        events: [],
      };
    }
    if (job.archivedAt) {
      throw new HttpError(
        403,
        "archived",
        "This job is archived, so nobody new can join it. An admin can reopen it.",
      );
    }
    await tx.insert(participants).values({
      id: participantId,
      jobId,
      name: input.name,
      role: input.role,
      batchNumber: input.batchNumber,
      userAgent: userAgent?.slice(0, 300) ?? null,
    });
    const committed = await commitChange(
      tx,
      job,
      { participantId, name: input.name, role: input.role },
      [
        {
          type: "participant_joined",
          batchNumber: input.batchNumber,
          data: { userAgent: userAgent?.slice(0, 300) ?? null },
        },
      ],
      [],
    );
    const participant: Participant = {
      participantId,
      jobId,
      code: job.code,
      name: input.name,
      role: input.role,
      batchNumber: input.batchNumber,
    };
    return {
      token: await signParticipantToken(participant),
      participant,
      ...committed,
    };
  });
}

export async function leaveJob(db: Db, p: Participant) {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(jobs)
      .where(eq(jobs.id, p.jobId))
      .for("update");
    if (!job) throw new HttpError(404, "no_job", "No job has this code.");
    const updated = await tx
      .update(participants)
      .set({ leftAt: sql`clock_timestamp()` })
      .where(
        and(
          eq(participants.id, p.participantId),
          sql`${participants.leftAt} is null`,
        ),
      )
      .returning({ id: participants.id });
    if (!updated.length) return null;
    return commitChange(
      tx,
      job,
      { participantId: p.participantId, name: p.name, role: p.role },
      [{ type: "participant_left", batchNumber: p.batchNumber }],
      [],
    );
  });
}

/**
 * Marks the station as alive: the online list is who did this recently and
 * has not said goodbye since. Returns the moment recorded, which the
 * station hands back if it says goodbye (see goAway), and whether this
 * brought it back from being offline.
 *
 * A station that comes back from offline takes a new place in line for its
 * role. If someone took the role over while it was away, they keep it.
 */
export async function heartbeat(
  db: Db,
  p: Participant,
): Promise<{ seenAt: string; cameBack: boolean }> {
  const [me] = await db
    .select({ wasOnline: sql<boolean>`${isOnline}` })
    .from(participants)
    .where(eq(participants.id, p.participantId))
    .limit(1);
  if (!me) throw new HttpError(401, "rejoin", "Join the job again.");
  const [seen] = await db
    .update(participants)
    .set({
      lastSeenAt: sql`clock_timestamp()`,
      goneAt: null,
      ...(me.wasOnline ? {} : { queuedAt: sql`clock_timestamp()` }),
    })
    .where(eq(participants.id, p.participantId))
    .returning({ at: participants.lastSeenAt });
  return { seenAt: seen?.at ?? "", cameBack: !me.wasOnline };
}

/** A timestamp exactly as Postgres prints one, which is how `seenAt` travels. */
export const SEEN_AT_PATTERN =
  /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(\.\d{1,6})?(Z|[+-]\d\d(:?\d\d)?)$/;

/**
 * Records that a station's page is going away: its tab was closed, or it is
 * reloading. A few seconds later (GOODBYE_GRACE_SECONDS) it counts as
 * offline, and whoever waits for its role has it, unless the page is back
 * by then. This is not a leave and is not logged.
 *
 * `seenAt` is what the page's last heartbeat returned. A reload can deliver
 * the old page's goodbye after the new page's first heartbeat; by then the
 * two no longer match, and the goodbye is ignored.
 */
export async function goAway(
  db: Db,
  p: Participant,
  seenAt: string,
): Promise<boolean> {
  const gone = await db
    .update(participants)
    .set({ goneAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(participants.id, p.participantId),
        isNull(participants.leftAt),
        isNull(participants.goneAt),
        sql`${participants.lastSeenAt} = ${seenAt}::timestamptz`,
      ),
    )
    .returning({ id: participants.id });
  return gone.length > 0;
}
