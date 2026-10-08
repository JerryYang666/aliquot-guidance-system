import type { CreateJobResponse } from "@/lib/api-types";
import { getDb } from "@/lib/db";
import { createJob, createJobRequestSchema } from "@/lib/server/create-job";
import { handle, json } from "@/lib/server/errors";
import { parseBody } from "@/lib/server/route";

export const POST = handle(async (request: Request) => {
  const input = await parseBody(request, createJobRequestSchema);
  const { code } = await createJob(getDb(), input);
  return json({ code } satisfies CreateJobResponse, 201);
});
