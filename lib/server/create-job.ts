import "server-only";

import { z } from "zod";

import type { Db } from "@/lib/db";
import { generateJobCode } from "@/lib/job-code";
import { buildJobInserts } from "@/lib/jobs/create";
import {
  checkWorkbook,
  normalizeWorkbook,
  parsedWorkbookSchema,
} from "@/lib/workbook/model";

import { HttpError } from "./errors";

export const createJobRequestSchema = z.object({
  name: z.string().trim().min(1, "Name the job.").max(120),
  createdBy: z.string().trim().min(1, "Enter your name.").max(60),
  sourceFilename: z.string().max(200).nullable(),
  workbook: parsedWorkbookSchema,
});

/** True when an insert lost a race for an already-taken job code. */
function isCodeCollision(error: unknown): boolean {
  const pgError = ((error as { cause?: unknown })?.cause ?? error) as {
    code?: string;
    constraint?: string;
  };
  return pgError?.code === "23505" && pgError.constraint === "jobs_code_key";
}

export async function createJob(
  db: Db,
  input: z.infer<typeof createJobRequestSchema>,
): Promise<{ code: string; jobId: string }> {
  const workbook = normalizeWorkbook(input.workbook);
  const check = checkWorkbook(workbook);
  if (check.errors.length) {
    throw new HttpError(
      422,
      "invalid_workbook",
      check.errors.slice(0, 5).join(" "),
    );
  }
  // A code collision is astronomically unlikely, but retrying is cheap.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateJobCode();
    try {
      const jobId = await db.transaction(async (tx) => {
        const built = buildJobInserts(tx, {
          code,
          name: input.name,
          createdBy: input.createdBy,
          sourceFilename: input.sourceFilename,
          workbook,
        });
        for (const statement of built.statements) await statement;
        return built.jobId;
      });
      return { code, jobId };
    } catch (error) {
      if (!isCodeCollision(error)) throw error;
    }
  }
  throw new HttpError(503, "busy", "Could not allocate a job code; try again.");
}
