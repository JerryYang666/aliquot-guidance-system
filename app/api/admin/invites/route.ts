import { invitePath } from "@/lib/admin/invites";
import type { AdminInviteResponse } from "@/lib/api-types";
import { getDb } from "@/lib/db";
import { handle, json } from "@/lib/server/errors";
import { createInvite } from "@/lib/server/admin/invites";
import { requireAdmin } from "@/lib/server/admin/session";

/** Makes an invite link. The token is shown this once and never stored. */
export const POST = handle(async (request: Request) => {
  const admin = await requireAdmin(request);
  const { token, expiresAt } = await createInvite(getDb(), admin.id);
  return json(
    { path: invitePath(token), expiresAt } satisfies AdminInviteResponse,
    201,
  );
});
