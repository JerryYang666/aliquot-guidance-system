import "server-only";

import { appOrigin } from "../env";
import { HttpError } from "../errors";

/** The site as passkeys know it: its origin, and its hostname as the WebAuthn RP ID. */
export interface RelyingParty {
  origin: string;
  id: string;
}

export const RELYING_PARTY_NAME = "Aliquot Guide";

/**
 * The relying party for a request from the admin pages. A passkey works only
 * at the origin it was made for, so a browser calling from any other address
 * (a second domain of the same deployment, or another site altogether) is
 * turned away and told where to go.
 */
export function relyingParty(request: Request): RelyingParty {
  const origin = appOrigin(request);
  const from = request.headers.get("origin");
  if (from && from !== origin) {
    throw new HttpError(
      403,
      "wrong_origin",
      `Admin sign-in works at ${origin} only.`,
    );
  }
  return { origin, id: new URL(origin).hostname };
}
