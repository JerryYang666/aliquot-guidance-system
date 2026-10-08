import { getDb } from "@/lib/db";
import { handle, json } from "@/lib/server/errors";
import { addPasskey } from "@/lib/server/admin/passkeys";
import { relyingParty } from "@/lib/server/admin/relying-party";
import { addPasskeySchema } from "@/lib/server/admin/requests";
import { finishCeremony, startSession } from "@/lib/server/admin/session";
import { parseBody } from "@/lib/server/route";

/** Saves the new passkey, spends the invite, and signs its owner in. */
export const POST = handle(async (request: Request) => {
  const rp = relyingParty(request);
  const { response } = await parseBody(request, addPasskeySchema);
  const { challenge, inviteId, name } = await finishCeremony("add");
  const admin = await addPasskey(getDb(), rp, {
    inviteId,
    name,
    challenge,
    response,
  });
  await startSession(admin);
  return json({ admin }, 201);
});
