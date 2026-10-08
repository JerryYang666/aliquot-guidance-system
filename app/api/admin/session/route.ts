import { getDb } from "@/lib/db";
import { handle, json } from "@/lib/server/errors";
import { signIn } from "@/lib/server/admin/passkeys";
import { relyingParty } from "@/lib/server/admin/relying-party";
import { signInSchema } from "@/lib/server/admin/requests";
import {
  endSession,
  finishCeremony,
  startSession,
} from "@/lib/server/admin/session";
import { parseBody } from "@/lib/server/route";

/** Finishes an admin sign-in with the passkey's answer. */
export const POST = handle(async (request: Request) => {
  const rp = relyingParty(request);
  const { response } = await parseBody(request, signInSchema);
  const { challenge } = await finishCeremony("sign_in");
  const admin = await signIn(getDb(), rp, challenge, response);
  await startSession(admin);
  return json({ admin });
});

/** Signs out. */
export const DELETE = handle(async (request: Request) => {
  relyingParty(request);
  await endSession();
  return json({ ok: true });
});
