import { handle, json } from "@/lib/server/errors";
import { signInOptions } from "@/lib/server/admin/passkeys";
import { relyingParty } from "@/lib/server/admin/relying-party";
import { beginCeremony } from "@/lib/server/admin/session";

/** Starts an admin sign-in: what the browser needs to ask for a passkey. */
export const POST = handle(async (request: Request) => {
  const options = await signInOptions(relyingParty(request));
  await beginCeremony({ kind: "sign_in", challenge: options.challenge });
  return json(options);
});
