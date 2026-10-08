import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import {
  hashInviteToken,
  INVITE_MINUTES,
  INVITE_TOKEN_PATTERN,
  newInvite,
} from "@/lib/admin/invites";
import type { DbOrTx, Tx } from "@/lib/db";
import { adminInvites } from "@/lib/db/schema";

import { HttpError } from "../errors";
import { toIso } from "../rows";

export interface OpenInvite {
  id: string;
  expiresAt: string;
}

const isOpen = and(
  isNull(adminInvites.usedAt),
  sql`${adminInvites.expiresAt} > clock_timestamp()`,
);

export const inviteGone = () =>
  new HttpError(
    410,
    "invite_gone",
    "This link has expired or was already used. Ask an admin for a new one.",
  );

/** Makes a link's token: one person can add one passkey with it, for a few minutes. */
export async function createInvite(
  db: DbOrTx,
  createdBy: string,
): Promise<{ token: string; expiresAt: string }> {
  const { token, insert } = newInvite(db, {
    createdBy,
    minutes: INVITE_MINUTES,
  });
  const [invite] = await insert.returning({
    expiresAt: adminInvites.expiresAt,
  });
  if (!invite) throw new Error("the invite was not saved");
  return { token, expiresAt: toIso(invite.expiresAt) };
}

/** The unused, unexpired invite behind a link's token, if there is one. */
export async function findOpenInvite(
  db: DbOrTx,
  token: string,
): Promise<OpenInvite | null> {
  if (!INVITE_TOKEN_PATTERN.test(token)) return null;
  const [invite] = await db
    .select({ id: adminInvites.id, expiresAt: adminInvites.expiresAt })
    .from(adminInvites)
    .where(and(eq(adminInvites.tokenHash, hashInviteToken(token)), isOpen))
    .limit(1);
  return invite ? { id: invite.id, expiresAt: toIso(invite.expiresAt) } : null;
}

/** Spends an invite on the passkey it added. False if it was no longer open. */
export async function redeemInvite(
  tx: Tx,
  inviteId: string,
  passkeyId: string,
): Promise<boolean> {
  const redeemed = await tx
    .update(adminInvites)
    .set({ usedAt: sql`clock_timestamp()`, usedBy: passkeyId })
    .where(and(eq(adminInvites.id, inviteId), isOpen))
    .returning({ id: adminInvites.id });
  return redeemed.length > 0;
}
