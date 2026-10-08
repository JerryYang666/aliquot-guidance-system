"use client";

import { useCallback, useState } from "react";

import type { ActionResponse } from "@/lib/api-types";
import type { Action } from "@/lib/pipeline/actions";

import { api, ApiFailure } from "./api";
import { randomId } from "./ids";
import type { JobSync } from "./use-job-sync";

export type RunResult =
  { ok: true; response: ActionResponse } | { ok: false; error: ApiFailure };

/** Sends actions for this station and applies the server's answer locally at once. */
export function useActions(
  code: string,
  token: string | null,
  sync: Pick<JobSync, "applyResponse">,
) {
  const [busy, setBusy] = useState(0);
  const { applyResponse } = sync;

  const run = useCallback(
    async (action: Action): Promise<RunResult> => {
      if (!token)
        return {
          ok: false,
          error: new ApiFailure(401, "rejoin", "Join the job first."),
        };
      setBusy((n) => n + 1);
      try {
        const response = await api<ActionResponse>(
          `/api/jobs/${code}/actions`,
          {
            token,
            body: {
              clientActionId: randomId(),
              clientAt: new Date().toISOString(),
              action,
            },
          },
        );
        applyResponse(response);
        return { ok: true, response };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof ApiFailure
              ? error
              : new ApiFailure(0, "unknown", "Something went wrong.", {
                  cause: error,
                }),
        };
      } finally {
        setBusy((n) => n - 1);
      }
    },
    [code, token, applyResponse],
  );

  return { run, busy: busy > 0 };
}
