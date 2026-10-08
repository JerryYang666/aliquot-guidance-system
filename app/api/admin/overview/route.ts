import type { AdminOverviewResponse } from "@/lib/api-types";
import { getDb } from "@/lib/db";
import { handle, json } from "@/lib/server/errors";
import { listAllJobs } from "@/lib/server/admin/jobs";
import { listPasskeys } from "@/lib/server/admin/passkeys";
import { requireAdmin } from "@/lib/server/admin/session";

/** What the admin page shows: every job, and who the admins are. */
export const GET = handle(async (request: Request) => {
  await requireAdmin(request);
  const db = getDb();
  const [jobs, passkeys] = await Promise.all([
    listAllJobs(db),
    listPasskeys(db),
  ]);
  return json({ jobs, passkeys } satisfies AdminOverviewResponse);
});
