import "server-only";

import { SignJWT } from "jose";

import type { ChangeMessage } from "@/lib/api-types";

import { relayConfig } from "./env";

const TICKET_AUDIENCE = "ags-relay";
const PUBLISH_AUDIENCE = "ags-relay-publish";

/**
 * A one-minute ticket that lets a browser open a socket on one job's topic.
 * The relay and the app are on different domains, so a cookie cannot do this.
 */
export async function mintRelayTicket(
  jobId: string,
  /** Who is connecting: a participant's ID, or "admin:<passkey ID>". */
  subject: string,
): Promise<{ url: string; ticket: string } | null> {
  const relay = relayConfig();
  if (!relay) return null;
  const ticket = await new SignJWT({ job: jobId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setAudience(TICKET_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(relay.secret);
  return { url: relay.publicUrl, ticket };
}

/**
 * Tells every screen on the job about a committed change. Best effort: a
 * screen that misses it notices the version gap (or polls) and refetches.
 */
export async function publishChange(
  jobId: string,
  message: ChangeMessage,
): Promise<void> {
  const relay = relayConfig();
  if (!relay) return;
  try {
    const bearer = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setAudience(PUBLISH_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(relay.secret);
    const response = await fetch(
      `${relay.internalUrl.replace(/\/$/, "")}/publish`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ job: jobId, message }),
        signal: AbortSignal.timeout(3_000),
      },
    );
    if (!response.ok)
      console.warn(`[realtime] publish failed: HTTP ${response.status}`);
  } catch (error) {
    console.warn(
      "[realtime] publish failed:",
      error instanceof Error ? error.message : error,
    );
  }
}
