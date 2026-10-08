/**
 * Admin invite links: /admin/invite/<token>. The token is 32 random bytes.
 * The database keeps only its SHA-256, so reading the table gives nobody a
 * working link. The app makes invites through the admin page;
 * scripts/admin-invite-sql.ts renders the same insert as SQL, to seed the
 * first one.
 */
import { createHash, randomBytes } from "node:crypto";

import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { adminInvites } from "@/lib/db/schema";

/** How long a link made in the app stays valid. */
export const INVITE_MINUTES = 10;

export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function invitePath(token: string): string {
  return `/admin/invite/${token}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema, any driver
type AnyPgDatabase = PgDatabase<PgQueryResultHKT, any>;

/**
 * A new invite: its token, for the link, and the insert that records it.
 * The clock starts when the insert runs.
 */
export function newInvite(
  db: AnyPgDatabase,
  input: { createdBy: string | null; minutes: number },
) {
  const token = randomBytes(32).toString("base64url");
  const insert = db.insert(adminInvites).values({
    id: crypto.randomUUID(),
    tokenHash: hashInviteToken(token),
    createdBy: input.createdBy,
    expiresAt: sql`clock_timestamp() + make_interval(mins => ${input.minutes})`,
  });
  return { token, insert };
}
