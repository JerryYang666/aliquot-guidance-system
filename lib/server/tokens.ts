import "server-only";

import { jwtVerify, SignJWT } from "jose";

import type { Role } from "@/lib/pipeline/types";

import { appSecret } from "./env";
import { HttpError } from "./errors";

/** Who is acting: one join of one person, at one station (role + batch). */
export interface Participant {
  participantId: string;
  jobId: string;
  code: string;
  name: string;
  role: Role;
  batchNumber: number;
}

const AUDIENCE = "ags-participant";

export async function signParticipantToken(p: Participant): Promise<string> {
  return new SignJWT({
    job: p.jobId,
    code: p.code,
    name: p.name,
    role: p.role,
    batch: p.batchNumber,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.participantId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(appSecret());
}

export async function verifyParticipantToken(
  token: string,
): Promise<Participant> {
  try {
    const { payload } = await jwtVerify(token, appSecret(), {
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    return {
      participantId: String(payload.sub),
      jobId: String(payload.job),
      code: String(payload.code),
      name: String(payload.name),
      role: payload.role as Role,
      batchNumber: Number(payload.batch),
    };
  } catch {
    throw new HttpError(
      401,
      "rejoin",
      "Your session has expired. Join the job again.",
    );
  }
}

/**
 * The station a request's tab already holds on this job, or null. For calls
 * that work without one, such as joining.
 */
export async function optionalParticipant(
  request: Request,
  code: string,
): Promise<Participant | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const participant = await verifyParticipantToken(header.slice(7)).catch(
    () => null,
  );
  return participant?.code === code ? participant : null;
}

/** The participant behind a request, from the Authorization header (or ?t= for downloads). */
export async function requireParticipant(
  request: Request,
  code: string,
): Promise<Participant> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ")
    ? header.slice(7)
    : new URL(request.url).searchParams.get("t");
  if (!token) throw new HttpError(401, "rejoin", "Join the job first.");
  const participant = await verifyParticipantToken(token);
  if (participant.code !== code)
    throw new HttpError(403, "wrong_job", "This session is for another job.");
  return participant;
}
