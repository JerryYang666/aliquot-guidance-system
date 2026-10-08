import { getDb } from "@/lib/db";
import { handle, json } from "@/lib/server/errors";
import { findOpenInvite, inviteGone } from "@/lib/server/admin/invites";
import { addPasskeyOptions } from "@/lib/server/admin/passkeys";
import { relyingParty } from "@/lib/server/admin/relying-party";
import { addPasskeyOptionsSchema } from "@/lib/server/admin/requests";
import { beginCeremony } from "@/lib/server/admin/session";
import { parseBody } from "@/lib/server/route";

/** Starts adding a passkey: only an open invite link gets this far. */
export const POST = handle(async (request: Request) => {
  const rp = relyingParty(request);
  const { token, name } = await parseBody(request, addPasskeyOptionsSchema);
  const invite = await findOpenInvite(getDb(), token);
  if (!invite) throw inviteGone();
  const options = await addPasskeyOptions(rp, name);
  await beginCeremony({
    kind: "add",
    challenge: options.challenge,
    inviteId: invite.id,
    name,
  });
  return json(options);
});
