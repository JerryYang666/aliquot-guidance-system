import "server-only";

import { createHash } from "node:crypto";

import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import type { Db } from "@/lib/db";
import { jobs, participants } from "@/lib/db/schema";
import {
  ROLE_LABELS,
  ROLES,
  type LogEvent,
  type Role,
} from "@/lib/pipeline/types";

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
 * not be turned away by it. The attempt is known only to that browser, so
 * nobody else can arrive at this ID.
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
 * token. A batch has one Puller, one Labeler and one Aliquoter at a time:
 * while someone holds one of those stations and is online, nobody else can
 * take it. Any number of people can be Overview.
 *
 * `current` is the station the joining tab already holds, if it holds one.
 * That tab is switching, so its own station does not stand in its way.
 */
export async function joinJob(
  db: Db,
  jobId: string,
  input: z.infer<typeof joinRequestSchema>,
  userAgent: string | null,
  current: Participant | null = null,
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
    if (input.role !== "overview") {
      // The job row is locked, so two people joining at once are checked
      // one after the other.
      const [holder] = await tx
        .select({ name: participants.name })
        .from(participants)
        .where(
          and(
            eq(participants.jobId, jobId),
            eq(participants.role, input.role),
            eq(participants.batchNumber, input.batchNumber),
            current ? ne(participants.id, current.participantId) : undefined,
            isOnline,
          ),
        )
        .limit(1);
      if (holder) {
        throw new HttpError(
          409,
          "role_taken",
          `${holder.name} is already the ${ROLE_LABELS[input.role]} on batch ${input.batchNumber}. If they have gone, the role frees up within about a minute.`,
        );
      }
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

/** Marks the station as alive; the online list is who did this recently. */
export async function heartbeat(db: Db, p: Participant): Promise<void> {
  await db
    .update(participants)
    .set({ lastSeenAt: sql`clock_timestamp()` })
    .where(eq(participants.id, p.participantId));
}
