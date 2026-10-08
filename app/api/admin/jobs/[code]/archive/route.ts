import { after } from "next/server";

import { getDb } from "@/lib/db";
import { setJobArchived } from "@/lib/server/admin/jobs";
import { requireAdmin } from "@/lib/server/admin/session";
import { handle, json } from "@/lib/server/errors";
import { publishChange } from "@/lib/server/realtime";
import type { CodeContext } from "@/lib/server/route";

async function archive(
  request: Request,
  context: CodeContext,
  archived: boolean,
): Promise<Response> {
  const admin = await requireAdmin(request);
  const { code } = await context.params;
  const result = await setJobArchived(getDb(), code, admin, archived);
  if (result) {
    after(() =>
      publishChange(result.jobId, {
        type: "change",
        version: result.version,
        samples: [],
        events: result.events,
      }),
    );
  }
  return json({ archived });
}

/** Archives the job: nobody new can join it. Those already on it carry on. */
export const POST = handle((request: Request, context: CodeContext) =>
  archive(request, context, true),
);

/** Reopens an archived job. */
export const DELETE = handle((request: Request, context: CodeContext) =>
  archive(request, context, false),
);
