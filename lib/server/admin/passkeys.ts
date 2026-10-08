import "server-only";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { COSEALG } from "@simplewebauthn/server/helpers";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { AdminPasskey } from "@/lib/api-types";
import type { Db, DbOrTx } from "@/lib/db";
import { adminInvites, adminPasskeys } from "@/lib/db/schema";

import { HttpError } from "../errors";
import { toIso } from "../rows";

import { inviteGone, redeemInvite } from "./invites";
import { RELYING_PARTY_NAME, type RelyingParty } from "./relying-party";

/** A signed-in admin: the passkey they used and the name on it. */
export interface Admin {
  id: string;
  name: string;
}

const isActive = isNull(adminPasskeys.revokedAt);

// Named here because the library's own default adds an experimental
// post-quantum algorithm on runtimes that happen to offer it.
const ALGORITHMS = [COSEALG.EdDSA, COSEALG.ES256, COSEALG.RS256];

const rejected = (status: number, error: unknown) => {
  console.warn(
    "[admin] passkey rejected:",
    error instanceof Error ? error.message : error,
  );
  return new HttpError(
    status,
    "passkey_rejected",
    "The passkey could not be verified. Try again.",
  );
};

export async function findAdmin(
  db: DbOrTx,
  passkeyId: string,
): Promise<Admin | null> {
  const [admin] = await db
    .select({ id: adminPasskeys.id, name: adminPasskeys.name })
    .from(adminPasskeys)
    .where(and(eq(adminPasskeys.id, passkeyId), isActive))
    .limit(1);
  return admin ?? null;
}

export function addPasskeyOptions(rp: RelyingParty, name: string) {
  return generateRegistrationOptions({
    rpName: RELYING_PARTY_NAME,
    rpID: rp.id,
    userName: name,
    userDisplayName: name,
    attestationType: "none",
    supportedAlgorithmIDs: ALGORITHMS,
    // A passkey proper: found without typing a name, unlocked by its owner.
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });
}

/** Saves the passkey a browser just made, spending the invite that allowed it. */
export async function addPasskey(
  db: Db,
  rp: RelyingParty,
  input: {
    inviteId: string;
    name: string;
    challenge: string;
    response: RegistrationResponseJSON;
  },
): Promise<Admin> {
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    supportedAlgorithmIDs: ALGORITHMS,
  }).catch((error: unknown) => {
    throw rejected(400, error);
  });
  if (!verification.verified) throw rejected(400, "not verified");

  const { credential } = verification.registrationInfo;
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(adminPasskeys).values({
      id,
      name: input.name,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports ?? [],
    });
    if (!(await redeemInvite(tx, input.inviteId, id))) throw inviteGone();
  });
  return { id, name: input.name };
}

export function signInOptions(rp: RelyingParty) {
  // No list of allowed passkeys: the browser offers the ones it holds for
  // this site, so nobody types a name and the server reveals none.
  return generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: "required",
  });
}

export async function signIn(
  db: DbOrTx,
  rp: RelyingParty,
  challenge: string,
  response: AuthenticationResponseJSON,
): Promise<Admin> {
  const [passkey] = await db
    .select()
    .from(adminPasskeys)
    .where(and(eq(adminPasskeys.credentialId, response.id), isActive))
    .limit(1);
  if (!passkey) {
    throw new HttpError(
      401,
      "unknown_passkey",
      "That passkey does not have admin access.",
    );
  }
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    credential: {
      id: passkey.credentialId,
      publicKey: Buffer.from(passkey.publicKey, "base64url"),
      counter: passkey.counter,
      transports: passkey.transports,
    },
  }).catch((error: unknown) => {
    throw rejected(401, error);
  });
  if (!verification.verified) throw rejected(401, "not verified");

  await db
    .update(adminPasskeys)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: sql`clock_timestamp()`,
    })
    .where(eq(adminPasskeys.id, passkey.id));
  return { id: passkey.id, name: passkey.name };
}

/** Every passkey that can sign in, oldest first, with who invited it. */
export async function listPasskeys(db: DbOrTx): Promise<AdminPasskey[]> {
  const inviter = alias(adminPasskeys, "inviter");
  const rows = await db
    .select({
      id: adminPasskeys.id,
      name: adminPasskeys.name,
      createdAt: adminPasskeys.createdAt,
      lastUsedAt: adminPasskeys.lastUsedAt,
      invitedBy: inviter.name,
    })
    .from(adminPasskeys)
    .leftJoin(adminInvites, eq(adminInvites.usedBy, adminPasskeys.id))
    .leftJoin(inviter, eq(inviter.id, adminInvites.createdBy))
    .where(isActive)
    .orderBy(asc(adminPasskeys.createdAt));
  return rows.map((row) => ({
    ...row,
    createdAt: toIso(row.createdAt),
    lastUsedAt: toIso(row.lastUsedAt),
  }));
}

/**
 * Ends a passkey's access. Not your own: whoever is signed in keeps theirs,
 * so removing passkeys can never leave the site without an admin.
 */
export async function revokePasskey(
  db: DbOrTx,
  admin: Admin,
  passkeyId: string,
): Promise<void> {
  if (passkeyId === admin.id) {
    throw new HttpError(
      409,
      "own_passkey",
      "You are signed in with this passkey. Another admin can remove it.",
    );
  }
  const revoked = await db
    .update(adminPasskeys)
    .set({ revokedAt: sql`clock_timestamp()`, revokedBy: admin.id })
    .where(and(eq(adminPasskeys.id, passkeyId), isActive))
    .returning({ id: adminPasskeys.id });
  if (!revoked.length) {
    throw new HttpError(404, "no_passkey", "That passkey is already removed.");
  }
}
