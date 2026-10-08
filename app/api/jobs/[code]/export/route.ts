import { getDb } from "@/lib/db";
import { handle } from "@/lib/server/errors";
import { exportLogCsv, exportWorkbook } from "@/lib/server/export";
import { getJobByCode } from "@/lib/server/jobs";
import type { CodeContext } from "@/lib/server/route";
import { requireParticipant } from "@/lib/server/tokens";

/** Downloads: ?format=xlsx (pull lists + log) or ?format=csv (log only). Token in ?t=. */
export const GET = handle(async (request: Request, context: CodeContext) => {
  const { code } = await context.params;
  await requireParticipant(request, code);
  const db = getDb();
  const job = await getJobByCode(db, code);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const base = `aliquot-${job.code}-${stamp}`;

  if (new URL(request.url).searchParams.get("format") === "csv") {
    return new Response(await exportLogCsv(db, job), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}-log.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response(await exportWorkbook(db, job), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
});
