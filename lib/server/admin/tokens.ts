import "server-only";

import { jwtVerify, SignJWT } from "jose";

import { appSecret } from "../env";

export const SESSION_HOURS = 12;
export const CEREMONY_MINUTES = 5;

const SESSION_AUDIENCE = "ags-admin";
const CEREMONY_AUDIENCE = "ags-admin-ceremony";

/**
 * A passkey prompt in progress. The browser must answer with the challenge
 * it was given; adding a passkey also carries the invite that allowed it.
 */
export type Ceremony =
  | { kind: "sign_in"; challenge: string }
  | { kind: "add"; challenge: string; inviteId: string; name: string };

function sign(
  claims: Record<string, unknown>,
  audience: string,
  lifetime: string,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(lifetime)
    .sign(appSecret());
}

async function verify(
  token: string,
  audience: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, appSecret(), {
      audience,
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

export function signAdminSession(passkeyId: string): Promise<string> {
  return sign({ sub: passkeyId }, SESSION_AUDIENCE, `${SESSION_HOURS}h`);
}

/** The passkey a session token was issued to, or null if it is not valid. */
export async function verifyAdminSession(
  token: string,
): Promise<string | null> {
  const payload = await verify(token, SESSION_AUDIENCE);
  return typeof payload?.sub === "string" ? payload.sub : null;
}

export function signCeremony(ceremony: Ceremony): Promise<string> {
  return sign({ ...ceremony }, CEREMONY_AUDIENCE, `${CEREMONY_MINUTES}m`);
}

export async function verifyCeremony<K extends Ceremony["kind"]>(
  token: string,
  kind: K,
): Promise<Extract<Ceremony, { kind: K }> | null> {
  const payload = await verify(token, CEREMONY_AUDIENCE);
  if (payload?.kind !== kind || typeof payload.challenge !== "string") {
    return null;
  }
  return payload as Extract<Ceremony, { kind: K }>;
}
