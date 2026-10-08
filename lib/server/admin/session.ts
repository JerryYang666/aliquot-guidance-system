import "server-only";

import { cookies } from "next/headers";

import { getDb } from "@/lib/db";

import { HttpError } from "../errors";

import { findAdmin, type Admin } from "./passkeys";
import { relyingParty } from "./relying-party";
import {
  CEREMONY_MINUTES,
  SESSION_HOURS,
  signAdminSession,
  signCeremony,
  verifyAdminSession,
  verifyCeremony,
  type Ceremony,
} from "./tokens";

const SESSION_COOKIE = "ags_admin";
const CEREMONY_COOKIE = "ags_admin_ceremony";

// Scripts cannot read either cookie, and other sites cannot send them with
// a request that changes anything.
const cookie = (path: string, maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path,
  maxAge,
});
const session = (maxAge: number) => cookie("/", maxAge);
const ceremony = (maxAge: number) => cookie("/api/admin", maxAge);

export async function startSession(admin: Admin): Promise<void> {
  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    await signAdminSession(admin.id),
    session(SESSION_HOURS * 3600),
  );
}

export async function endSession(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", session(0));
}

/**
 * The admin signed in on this browser, or null. Checked against the database
 * every time, so removing a passkey ends its sessions at once.
 */
export async function currentAdmin(): Promise<Admin | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const passkeyId = token && (await verifyAdminSession(token));
  return passkeyId ? findAdmin(getDb(), passkeyId) : null;
}

export async function requireAdmin(request: Request): Promise<Admin> {
  relyingParty(request);
  const admin = await currentAdmin();
  if (!admin) throw new HttpError(401, "sign_in", "Sign in as an admin.");
  return admin;
}

/** Remembers the passkey prompt this browser was just sent. */
export async function beginCeremony(started: Ceremony): Promise<void> {
  const store = await cookies();
  store.set(
    CEREMONY_COOKIE,
    await signCeremony(started),
    ceremony(CEREMONY_MINUTES * 60),
  );
}

/** The prompt this browser is answering. Each one can be answered once. */
export async function finishCeremony<K extends Ceremony["kind"]>(
  kind: K,
): Promise<Extract<Ceremony, { kind: K }>> {
  const store = await cookies();
  const token = store.get(CEREMONY_COOKIE)?.value;
  store.set(CEREMONY_COOKIE, "", ceremony(0));
  const started = token ? await verifyCeremony(token, kind) : null;
  if (!started) {
    throw new HttpError(400, "start_over", "That took too long. Try again.");
  }
  return started;
}
