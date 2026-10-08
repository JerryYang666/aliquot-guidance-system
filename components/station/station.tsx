"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/client/api";
import { unlockAudio } from "@/lib/client/feedback";
import {
  clearSession,
  parseSession,
  useStoredSessionRaw,
} from "@/lib/client/session";
import { useActions } from "@/lib/client/use-actions";
import { useJobSync } from "@/lib/client/use-job-sync";
import { useWakeLock } from "@/lib/client/use-wake-lock";
import type { Action } from "@/lib/pipeline/actions";

import { useToast } from "../toast";
import { Button, Card } from "../ui";

import { AliquoterView } from "./aliquoter-view";
import { PipelineStrip, StationHeader } from "./common";
import { LabelerView } from "./labeler-view";
import { OverviewView } from "./overview-view";
import { PullerView } from "./puller-view";
import type { ViewProps } from "./types";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center p-6">
      <Card className="w-full p-6">{children}</Card>
    </main>
  );
}

export function Station({ code }: { code: string }) {
  const router = useRouter();
  const raw = useStoredSessionRaw(code);
  const session = useMemo(() => parseSession(raw), [raw]);
  const sync = useJobSync(code, session);
  const { run, busy } = useActions(code, session?.token ?? null, sync);
  const notify = useToast();
  const wake = useWakeLock();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Browsers keep audio muted until the page is touched.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (raw === null) router.replace(`/j/${code}`);
  }, [raw, code, router]);

  const perform = useCallback(
    async (action: Action) => {
      const result = await run(action);
      if (!result.ok && action.type !== "scan")
        notify(result.error.message, "error");
      return result;
    },
    [run, notify],
  );

  const leave = useCallback(async () => {
    if (session) {
      await api(`/api/jobs/${code}/leave`, {
        method: "POST",
        token: session.token,
      }).catch(() => undefined);
    }
    clearSession(code);
    router.push(`/j/${code}`);
  }, [code, session, router]);

  if (sync.fatal) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Join again</h1>
        <p className="mt-2 text-slate-600">{sync.fatal.message}</p>
        <Button
          variant="primary"
          className="mt-4"
          onClick={() => {
            clearSession(code);
            router.push(`/j/${code}`);
          }}
        >
          Go to the join page
        </Button>
      </Centered>
    );
  }

  if (!session || !sync.snapshot) {
    return (
      <Centered>
        <p className="text-slate-600">Loading…</p>
        <Link
          href={`/j/${code}`}
          className="mt-2 block text-sm text-slate-500 underline"
        >
          Back to the join page
        </Link>
      </Centered>
    );
  }

  const props: ViewProps = {
    snapshot: sync.snapshot,
    samples: sync.samples,
    feed: sync.feed,
    online: sync.online,
    perform,
    busy,
    hotkeysEnabled: !dialogOpen,
    setDialogOpen,
  };

  return (
    <div className="min-h-dvh pb-16">
      <StationHeader
        snapshot={sync.snapshot}
        online={sync.online}
        connection={sync.connection}
        wake={wake}
        token={session.token}
        onLeave={() => void leave()}
        onRefresh={() => void sync.refresh()}
      />
      <PipelineStrip samples={sync.samples} />
      {session.me.role === "puller" && <PullerView {...props} />}
      {session.me.role === "labeler" && <LabelerView {...props} />}
      {session.me.role === "aliquoter" && <AliquoterView {...props} />}
      {session.me.role === "overview" && <OverviewView {...props} />}
    </div>
  );
}
