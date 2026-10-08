import "server-only";

import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "zod";

import { INVITE_TOKEN_PATTERN } from "@/lib/admin/invites";

// What a browser's passkey prompt returns. Only the outline is checked here;
// verifying the response checks everything inside it.
const credential = z.looseObject({
  id: z.string().min(1).max(1024),
  rawId: z.string().min(1).max(1024),
  type: z.literal("public-key"),
  response: z.looseObject({ clientDataJSON: z.string().min(1) }),
});

export const addPasskeyOptionsSchema = z.object({
  token: z.string().regex(INVITE_TOKEN_PATTERN, "This link is not valid."),
  name: z.string().trim().min(1, "Enter your name.").max(60),
});

export const addPasskeySchema = z.object({
  response: credential.transform(
    (c) => c as unknown as RegistrationResponseJSON,
  ),
});

export const signInSchema = z.object({
  response: credential.transform(
    (c) => c as unknown as AuthenticationResponseJSON,
  ),
});
