import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Db } from "@/lib/db";
import { jobs, participants } from "@/lib/db/schema";
import { ROLES, type LogEvent, type Role } from "@/lib/pipeline/types";

import { commitChange } from "./actions";
import { HttpError } from "./errors";
import { getBatch } from "./jobs";
import { signParticipantToken, type Participant } from "./tokens";

export const joinRequestSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(60),
  role: z.enum(ROLES as [Role, ...Role[]]),
  batchNumber: z.number().int().min(1),
});

export interface JoinResult {
  token: string;
  participant: Participant;
  version: number;
  events: LogEvent[];
}

/** Records a person taking a station (role + batch) and hands back their token. */
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
    const participantId = crypto.randomUUID();
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
