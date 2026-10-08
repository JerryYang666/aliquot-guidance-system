"use client";

import {
  ArrowLeft,
  ArrowRight,
  CornerDownLeft,
  PackageCheck,
  SkipForward,
  Undo2,
} from "lucide-react";

import { useHotkeys } from "@/lib/client/use-hotkeys";
import { boxKind, parsePosition } from "@/lib/pipeline/layout";
import {
  hasPlacedTube,
  isLastFromSourceBox,
  toPull,
  toReturn,
} from "@/lib/pipeline/queue";
import type { Sample } from "@/lib/pipeline/types";

import { BoxGrid } from "../box-grid";
import { Badge, Button, Card, Kbd, Label } from "../ui";

import { SampleFlags, SampleLine } from "./common";
import type { ViewProps } from "./types";

/** The most recent pull that can still be undone, preferring this person's own. */
function undoablePull(samples: Sample[], me: string): Sample | undefined {
  return samples
    .filter((s) => s.pulledAt && !s.finishedAt && !hasPlacedTube(s))
    .sort(
      (a, b) =>
        Number(b.pulledBy === me) - Number(a.pulledBy === me) ||
        (b.pulledAt ?? "").localeCompare(a.pulledAt ?? ""),
    )[0];
}

function lastReturn(samples: Sample[], me: string): Sample | undefined {
  return samples
    .filter((s) => s.returnedAt && s.returnedBy === me)
    .sort((a, b) => (b.returnedAt ?? "").localeCompare(a.returnedAt ?? ""))[0];
}

export function PullerView({
  snapshot,
  samples,
  perform,
  busy,
  hotkeysEnabled,
}: ViewProps) {
  const queue = toPull(samples);
  const next = queue[0];
  const returns = toReturn(samples);
  const me = snapshot.me.name;
  const undoTarget = undoablePull(samples, me);
  const undoReturnTarget = lastReturn(samples, me);
  const position = next ? parsePosition(next.sourcePosition) : null;
  const layout = next
    ? snapshot.layouts.sources[boxKind(next.sourceBox)]
    : undefined;

  const pull = () =>
    next && !busy && perform({ type: "pull", sampleId: next.id });
  const skip = () =>
    next && !busy && perform({ type: "skip", sampleId: next.id });
  const undo = () =>
    undoTarget &&
    !busy &&
    perform({ type: "undo_pull", sampleId: undoTarget.id });
  const returnFirst = () =>
    returns[0] && !busy && perform({ type: "return", sampleId: returns[0].id });

  useHotkeys(
    {
      " ": pull,
      ArrowRight: pull,
      ArrowLeft: undo,
      Backspace: undo,
      s: skip,
      Enter: returnFirst,
    },
    hotkeysEnabled,
  );

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[1fr_380px]">
      <Card className="flex flex-col gap-5 p-6">
        <Label>Pull next</Label>
        {next ? (
          <>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <div className="text-lg text-slate-500">
                    {next.sourceLocation ?? "—"}
                  </div>
                  <div className="text-4xl font-bold tracking-tight sm:text-5xl">
                    {next.sourceBox}
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                  <div>
                    <div className="text-sm text-slate-500">Position</div>
                    <div className="font-mono text-5xl font-bold sm:text-6xl">
                      {position
                        ? `${position.row}${position.col}`
                        : (next.sourcePosition ?? "—")}
                    </div>
                    {position && (
                      <div className="font-mono text-sm text-slate-500">
                        {next.sourcePosition}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">Original ID</div>
                    <div className="font-mono text-5xl font-bold sm:text-6xl">
                      {next.originalId}
                    </div>
                  </div>
                </div>
                <div className="text-slate-600">
                  Becomes{" "}
                  <span className="font-mono font-semibold">{next.newId}</span>{" "}
                  · slot{" "}
                  <span className="font-mono font-semibold">{next.slot}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <SampleFlags sample={next} large />
                  {isLastFromSourceBox(next, samples) && (
                    <Badge tone="green" className="text-base">
                      <PackageCheck className="size-4" /> Last tube from this
                      box
                    </Badge>
                  )}
                </div>
              </div>
              {layout && position && (
                <div>
                  <BoxGrid
                    layout={layout}
                    highlight={`${position.row}${position.col}`}
                    label={`${next.sourceBox} with ${next.sourcePosition} highlighted`}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                size="xl"
                onClick={pull}
                disabled={busy}
              >
                Pulled <Kbd>Space</Kbd>
                <ArrowRight className="size-5" />
              </Button>
              <Button size="xl" onClick={skip} disabled={busy}>
                <SkipForward className="size-5" /> Can&apos;t find it{" "}
                <Kbd>S</Kbd>
              </Button>
            </div>
          </>
        ) : (
          <p className="text-2xl font-semibold text-emerald-700">
            Every tube in this batch has been pulled.
          </p>
        )}

        {undoTarget && (
          <button
            type="button"
            onClick={undo}
            className="inline-flex items-center gap-2 self-start text-sm text-slate-600 hover:text-slate-900"
          >
            <Undo2 className="size-4" /> Undo pull of {undoTarget.newId} (
            {undoTarget.originalId})
            <Kbd>
              <ArrowLeft className="inline size-3" />
            </Kbd>
          </button>
        )}

        {queue.length > 1 && (
          <div className="border-t border-slate-200 pt-4">
            <Label>Then</Label>
            <ul className="mt-2 space-y-1">
              {queue.slice(1, 6).map((s) => (
                <li key={s.id}>
                  <SampleLine sample={s} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label>Return to freezer ({returns.length})</Label>
          {undoReturnTarget && (
            <button
              type="button"
              onClick={() =>
                !busy &&
                perform({ type: "undo_return", sampleId: undoReturnTarget.id })
              }
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Undo return of {undoReturnTarget.newId}
            </button>
          )}
        </div>
        {returns.length === 0 && (
          <p className="text-sm text-slate-500">
            Aliquoted source tubes show up here.
          </p>
        )}
        <ul className="space-y-2">
          {returns.map((s, i) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {s.sourceBox}{" "}
                  <span className="font-mono">{s.sourcePosition}</span>
                </div>
                <div className="font-mono text-sm text-slate-600">
                  {s.originalId} · {s.newId}
                </div>
              </div>
              <Button
                variant={i === 0 ? "primary" : "secondary"}
                size="sm"
                disabled={busy}
                onClick={() => perform({ type: "return", sampleId: s.id })}
              >
                Returned
                {i === 0 && (
                  <Kbd>
                    <CornerDownLeft className="inline size-3" />
                  </Kbd>
                )}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
