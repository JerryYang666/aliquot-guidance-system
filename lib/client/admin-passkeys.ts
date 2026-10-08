import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

import { api, ApiFailure } from "./api";

// None of these is retried: each passkey prompt can be answered once.
const once = { retry: false } as const;

/** Signs this browser in as an admin with a passkey it holds. */
export async function signInWithPasskey(): Promise<void> {
  const optionsJSON = await api<PublicKeyCredentialRequestOptionsJSON>(
    "/api/admin/session/options",
    { method: "POST", ...once },
  );
  const response = await startAuthentication({ optionsJSON });
  await api("/api/admin/session", { body: { response }, ...once });
}

/** Makes a passkey on this device for an invite link, and signs in with it. */
export async function addPasskey(token: string, name: string): Promise<void> {
  const optionsJSON = await api<PublicKeyCredentialCreationOptionsJSON>(
    "/api/admin/passkeys/options",
    { body: { token, name }, ...once },
  );
  const response = await startRegistration({ optionsJSON });
  await api("/api/admin/passkeys", { body: { response }, ...once });
}

export async function signOut(): Promise<void> {
  await api("/api/admin/session", { method: "DELETE", ...once });
}

/** What to tell someone whose passkey prompt did not go through. */
export function passkeyErrorMessage(error: unknown): string {
  if (error instanceof ApiFailure) return error.message;
  if (error instanceof Error && error.name === "NotAllowedError") {
    return "The passkey prompt was closed or timed out. Try again.";
  }
  return "This browser could not use a passkey here.";
}
