"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { ROLE_LABELS } from "@/lib/pipeline/types";

import { useToast } from "../toast";
import { Button, Card } from "../ui";

import { AliquoterView } from "./aliquoter-view";
import { PipelineStrip, StationHeader } from "./common";
import { LabelerView } from "./labeler-view";
import { OverviewView } from "./overview-view";
import { PullerView } from "./puller-view";
import type { ViewProps } from "./types";

// While waiting for a role, how often to ask whether it is free yet.
const WAITING_POLL_MS = 3_000;

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
      // Scan failures are shown in the station's own result banner.
      const isScan = action.type === "scan" || action.type === "label_scan";
      if (!result.ok && !isScan) notify(result.error.message, "error");
      return result;
    },
    [run, notify],
  );

  // A batch has one Puller, one Labeler and one Aliquoter at work. If
  // someone was in this station's role first, they hold it, and this
  // screen is locked until they have gone.
  const me = session?.me;
  const holder = sync.online.find(
    (p) => p.id === me?.participantId && p.waiting,
  )
    ? sync.online.find(
        (p) =>
          p.role === me?.role &&
          p.batchNumber === me?.batchNumber &&
          !p.waiting,
      )
    : undefined;
  const holderName = holder?.name;
  const role = me?.role;

  // Ask often while waiting, so the screen opens soon after they go even
  // when they went without a word.
  const { refreshOnline } = sync;
  useEffect(() => {
    if (!holderName) return;
    const id = setInterval(() => void refreshOnline(), WAITING_POLL_MS);
    return () => clearInterval(id);
  }, [holderName, refreshOnline]);

  const waitedFor = useRef<string | null>(null);
  useEffect(() => {
    if (holderName) {
      waitedFor.current = holderName;
    } else if (waitedFor.current && role) {
      notify(
        `${waitedFor.current} has gone. You are the ${ROLE_LABELS[role]} now.`,
        "success",
      );
      waitedFor.current = null;
    }
  }, [holderName, role, notify]);

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
        onDialogChange={setDialogOpen}
      />
      {holder ? (
        <main className="mx-auto max-w-xl p-4 pt-8 sm:p-6 sm:pt-12">
          <Card className="flex flex-col items-center gap-4 p-8 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Lock className="size-7" />
            </span>
            <h1 className="text-2xl font-bold">
              {holder.name} is already the {ROLE_LABELS[session.me.role]} on
              batch {session.me.batchNumber}
            </h1>
            <p className="text-slate-600">
              One person does this at a time. Ask {holder.name} to leave: on
              their screen, the menu at the top right, then &ldquo;Switch role
              or batch&rdquo;. This screen opens by itself as soon as they have
              gone.
            </p>
            <p className="text-sm text-slate-500">
              If their device is off or has lost its connection, that takes
              about a minute.
            </p>
            <Button onClick={() => void leave()}>Pick another role</Button>
          </Card>
        </main>
      ) : (
        <>
          <PipelineStrip samples={sync.samples} />
          {session.me.role === "puller" && <PullerView {...props} />}
          {session.me.role === "labeler" && <LabelerView {...props} />}
          {session.me.role === "aliquoter" && <AliquoterView {...props} />}
          {session.me.role === "overview" && <OverviewView {...props} />}
        </>
      )}
    </div>
  );
}
