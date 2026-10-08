"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { OnlineParticipant } from "@/lib/api-types";
import { useAdminJobSync } from "@/lib/client/use-job-sync";
import { formatJobCode } from "@/lib/job-code";
import { batchProgress } from "@/lib/pipeline/queue";
import { ROLE_LABELS, type Batch, type Sample } from "@/lib/pipeline/types";

import { ConnectionPill, ProgressBar } from "../station/common";
import { BatchOverview } from "../station/overview-view";
import { Card, cx } from "../ui";

function BatchTile({
  batch,
  samples,
  here,
  selected,
  onSelect,
}: {
  batch: Batch;
  samples: Sample[];
  here: OnlineParticipant[];
  selected: boolean;
  onSelect: () => void;
}) {
  const progress = batchProgress(samples);
  const started = samples.some((s) => s.pulledAt || s.labeledAt);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cx(
        "rounded-xl bg-white p-3 text-left",
        selected
          ? "ring-2 ring-slate-900"
          : "ring-1 ring-slate-200 hover:ring-slate-400",
      )}
    >
      <ProgressBar
        label={`Batch ${batch.number}`}
        value={progress.finished}
        total={progress.total}
      />
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
        {here.length > 0 && (
          <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
        )}
        <span className="truncate">
          {here.length
            ? here
                .map(
                  (p) =>
                    `${p.name} (${ROLE_LABELS[p.role]}${p.waiting ? ", waiting" : ""})`,
                )
                .join(", ")
            : progress.finished === progress.total
              ? "Done"
              : started
                ? "In progress"
                : "Not started"}
        </span>
      </div>
    </button>
  );
}

/**
 * A job as an admin watches it: every batch's progress and who is on it,
 * live, with one batch opened up. The admin has not joined the job: nothing
 * here is logged, shown to the operators, or able to change a sample.
 */
export function JobWatch({ code }: { code: string }) {
  const router = useRouter();
  const { snapshot, samples, feed, online, connection, fatal } =
    useAdminJobSync(code);
  const [chosen, setChosen] = useState<number | null>(null);

  const byBatch = useMemo(() => {
    const groups = new Map<number, Sample[]>();
    for (const s of samples) {
      const group = groups.get(s.batchNumber);
      if (group) group.push(s);
      else groups.set(s.batchNumber, [s]);
    }
    return groups;
  }, [samples]);

  // Signed out, or this passkey was removed: back to the sign-in screen.
  const signedOut = fatal?.status === 401;
  useEffect(() => {
    if (signedOut) router.refresh();
  }, [signedOut, router]);

  if (fatal && !signedOut) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center p-6">
        <Card className="w-full p-6">
          <h1 className="text-xl font-semibold">
            Job {formatJobCode(code)} cannot be shown
          </h1>
          <p className="mt-2 text-slate-600">{fatal.message}</p>
          <Link href="/admin" className="mt-4 inline-block text-sm underline">
            All jobs
          </Link>
        </Card>
      </main>
    );
  }
  if (!snapshot) return <p className="p-6 text-slate-500">Loading job…</p>;

  const { job, batches } = snapshot;
  const samplesOf = (batch: Batch) => byBatch.get(batch.number) ?? [];
  // Until the admin picks a batch, show where the work is: the first batch
  // with someone on it, or else the first one not yet finished.
  const batch =
    batches.find((b) => b.number === chosen) ??
    batches.find((b) => online.some((p) => p.batchNumber === b.number)) ??
    batches.find((b) => samplesOf(b).some((s) => !s.finishedAt)) ??
    batches[0];
  const finished = samples.filter((s) => s.finishedAt).length;

  return (
    <div className="min-h-dvh pb-16">
      <header className="sticky top-0 z-30 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate font-semibold">{job.name}</span>
              <span className="hidden font-mono text-xs text-slate-400 sm:inline">
                {formatJobCode(job.code)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-sm text-slate-300">
              <span className="font-semibold text-white">Watching</span>
              <span>·</span>
              <span>
                {finished}/{samples.length} aliquoted
              </span>
              <span>·</span>
              <span>{online.length} online</span>
            </div>
          </div>
          <ConnectionPill connection={connection} />
          <Link href="/admin" className="text-sm underline">
            All jobs
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-2 px-4 pt-4 sm:grid-cols-3 lg:grid-cols-5">
        {batches.map((b) => (
          <BatchTile
            key={b.number}
            batch={b}
            samples={samplesOf(b)}
            here={online.filter((p) => p.batchNumber === b.number)}
            selected={b.number === batch?.number}
            onSelect={() => setChosen(b.number)}
          />
        ))}
      </div>

      {batch && (
        <BatchOverview
          key={batch.number}
          destSets={job.destSets}
          batch={batch}
          layout={snapshot.layouts.dest}
          samples={samplesOf(batch)}
          feed={feed}
          online={online}
        />
      )}
    </div>
  );
}
