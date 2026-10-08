"use client";

import { ArrowLeft, ArrowRight, SkipForward, Undo2 } from "lucide-react";

import { useHotkeys } from "@/lib/client/use-hotkeys";
import { labelFor } from "@/lib/pipeline/labels";
import { hasPlacedTube, toLabel } from "@/lib/pipeline/queue";
import type { Sample } from "@/lib/pipeline/types";

import { Button, Card, cx, Kbd, Label, setColor } from "../ui";

import { SampleFlags } from "./common";
import type { ViewProps } from "./types";

function undoableLabel(samples: Sample[], me: string): Sample | undefined {
  return samples
    .filter((s) => s.labeledAt && !s.finishedAt && !hasPlacedTube(s))
    .sort(
      (a, b) =>
        Number(b.labeledBy === me) - Number(a.labeledBy === me) ||
        (b.labeledAt ?? "").localeCompare(a.labeledAt ?? ""),
    )[0];
}

export function LabelerView({
  snapshot,
  samples,
  perform,
  busy,
  hotkeysEnabled,
}: ViewProps) {
  const queue = toLabel(samples);
  const next = queue[0];
  const undoTarget = undoableLabel(samples, snapshot.me.name);
  const { destSets } = snapshot.job;

  const label = () =>
    next && !busy && perform({ type: "label", sampleId: next.id });
  const skip = () =>
    next && !busy && perform({ type: "skip", sampleId: next.id });
  const undo = () =>
    undoTarget &&
    !busy &&
    perform({ type: "undo_label", sampleId: undoTarget.id });

  useHotkeys(
    {
      " ": label,
      ArrowRight: label,
      ArrowLeft: undo,
      Backspace: undo,
      s: skip,
    },
    hotkeysEnabled,
  );

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[1fr_320px]">
      <Card className="flex flex-col gap-6 p-6">
        <Label>Label next</Label>
        {next ? (
          <>
            <div>
              <div className="font-mono text-7xl font-bold tracking-tight sm:text-8xl">
                {next.newId}
              </div>
              <div className="mt-2 text-slate-600">
                Source tube{" "}
                <span className="font-mono font-semibold">
                  {next.originalId}
                </span>{" "}
                · slot{" "}
                <span className="font-mono font-semibold">{next.slot}</span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {destSets.map((set, i) => {
                const color = setColor(i + 1);
                return (
                  <div key={set} className={cx("rounded-2xl p-4", color.solid)}>
                    <div className="font-mono text-3xl font-bold">
                      {labelFor(next.newId, i + 1)}
                    </div>
                    <div className="text-sm opacity-90">
                      {set} box {snapshot.batch.boxNumber}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <SampleFlags sample={next} large />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                size="xl"
                onClick={label}
                disabled={busy}
              >
                Labeled <Kbd>Space</Kbd>
                <ArrowRight className="size-5" />
              </Button>
              <Button size="xl" onClick={skip} disabled={busy}>
                <SkipForward className="size-5" /> Can&apos;t find labels{" "}
                <Kbd>S</Kbd>
              </Button>
            </div>
          </>
        ) : (
          <p className="text-2xl font-semibold text-emerald-700">
            Every sample in this batch is labeled.
          </p>
        )}
        {undoTarget && (
          <button
            type="button"
            onClick={undo}
            className="inline-flex items-center gap-2 self-start text-sm text-slate-600 hover:text-slate-900"
          >
            <Undo2 className="size-4" /> Undo labels of {undoTarget.newId}
            <Kbd>
              <ArrowLeft className="inline size-3" />
            </Kbd>
          </button>
        )}
      </Card>

      <Card>
        <Label>Find these labels next</Label>
        <ol className="mt-3 space-y-2">
          {queue.slice(1, 9).map((s) => (
            <li key={s.id} className="flex items-baseline justify-between">
              <span className="font-mono text-xl font-semibold">{s.newId}</span>
              <span className="text-sm text-slate-500">
                {s.pulledAt ? "pulled" : ""}
                {s.volumeNote ? ` · ${s.volumeNote}` : ""}
              </span>
            </li>
          ))}
          {queue.length <= 1 && (
            <li className="text-sm text-slate-500">Nothing after this.</li>
          )}
        </ol>
      </Card>
    </div>
  );
}
