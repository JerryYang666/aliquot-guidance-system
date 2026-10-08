import { z } from "zod";

import { getDb } from "@/lib/db";
import { handle, HttpError, json } from "@/lib/server/errors";
import { revokePasskey } from "@/lib/server/admin/passkeys";
import { requireAdmin } from "@/lib/server/admin/session";

/** Removes another admin's passkey. */
export const DELETE = handle(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin(request);
    const id = z.uuid().safeParse((await context.params).id);
    if (!id.success) throw new HttpError(404, "no_passkey", "No such passkey.");
    await revokePasskey(getDb(), admin, id.data);
    return json({ ok: true });
  },
);
