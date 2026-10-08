"use client";

import { useState } from "react";

import type { OnlineParticipant } from "@/lib/api-types";
import { formatTime } from "@/lib/client/describe-event";
import type { Action } from "@/lib/pipeline/actions";
import { labelFor } from "@/lib/pipeline/labels";
import type { BoxLayout } from "@/lib/pipeline/layout";
import { batchProgress, hasPlacedTube } from "@/lib/pipeline/queue";
import {
  ROLE_LABELS,
  type Batch,
  type LogEvent,
  type Sample,
} from "@/lib/pipeline/types";

import { BoxGrid } from "../box-grid";
import { Modal } from "../modal";
import { Button, Card, cx, Label, setColor } from "../ui";

import { Feed, ProgressBar, SampleFlags } from "./common";
import type { ViewProps } from "./types";

type Stage =
  "waiting" | "started" | "ready" | "aliquoting" | "finished" | "returned";

function stageOf(s: Sample): Stage {
  if (s.returnedAt) return "returned";
  if (s.finishedAt) return "finished";
  if (hasPlacedTube(s)) return "aliquoting";
  if (s.pulledAt && s.labeledAt) return "ready";
  if (s.pulledAt || s.labeledAt) return "started";
  return "waiting";
}

const STAGES: Record<Stage, { label: string; className: string }> = {
  waiting: {
    label: "Not started",
    className: "bg-white ring-1 ring-inset ring-slate-200",
  },
  started: {
    label: "Pulled or labeled",
    className: "bg-amber-50 ring-1 ring-inset ring-amber-200",
  },
  ready: { label: "Ready to aliquot", className: "bg-amber-200" },
  aliquoting: { label: "Aliquoting", className: "bg-sky-200" },
  finished: { label: "Done, source out", className: "bg-emerald-200" },
  returned: {
    label: "Done, source returned",
    className: "bg-emerald-600 text-white",
  },
};

const TUBE_DOT: Record<string, string> = {
  pending: "bg-slate-300",
  placed: "bg-slate-900",
  not_filled: "bg-red-500",
};

/** How mistakes are fixed from the overview. */
type Corrections = Pick<ViewProps, "perform" | "busy">;

export function OverviewView({
  snapshot,
  samples,
  feed,
  online,
  perform,
  busy,
  setDialogOpen,
}: ViewProps) {
  return (
    <BatchOverview
      destSets={snapshot.job.destSets}
      batch={snapshot.batch}
      layout={snapshot.layouts.dest}
      samples={samples}
      feed={feed}
      online={online}
      corrections={{ perform, busy }}
      onDialogChange={setDialogOpen}
    />
  );
}

/**
 * One batch at a glance: its destination box with each sample's stage, its
 * progress, who is online and what just happened. The Overview role can fix
 * mistakes from here; an admin watching a job sees the same, read-only.
 */
export function BatchOverview({
  destSets,
  batch,
  layout,
  samples,
  feed,
  online,
  corrections,
  onDialogChange,
}: {
  destSets: string[];
  batch: Batch;
  layout: BoxLayout;
  samples: Sample[];
  feed: LogEvent[];
  online: OnlineParticipant[];
  /** Absent for a viewer who only watches. */
  corrections?: Corrections;
  onDialogChange?: (open: boolean) => void;
}) {
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const bySlot = new Map(samples.map((s) => [s.slot, s]));
  const selected = samples.find((s) => s.id === selectedId) ?? null;
  const progress = batchProgress(samples);
  const select = (id: string | null) => {
    setSelectedIdState(id);
    onDialogChange?.(id !== null);
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[1fr_360px]">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Label>
            Batch {batch.number} · {destSets.join(" / ")} box {batch.boxNumber}
          </Label>
          <span className="text-sm text-slate-500">
            {corrections
              ? "Tap a slot for details and corrections"
              : "Tap a slot for details"}
          </span>
        </div>
        <BoxGrid
          layout={layout}
          size="lg"
          label="Destination box layout with each sample's progress"
          cellClass={(key) => {
            const s = bySlot.get(key);
            return s ? STAGES[stageOf(s)].className : "bg-slate-100";
          }}
          renderCell={(key) => {
            const s = bySlot.get(key);
            if (!s) return null;
            return (
              <div className="flex flex-col items-center gap-0.5 leading-none">
                <span className="font-mono text-[10px] font-semibold sm:text-xs">
                  {s.newId}
                </span>
                <span className="flex gap-0.5">
                  {s.tubes.map((t, i) => (
                    <span
                      key={i}
                      className={cx(
                        "size-1.5 rounded-full",
                        TUBE_DOT[t.status],
                      )}
                    />
                  ))}
                </span>
                {s.volumeNote && (
                  <span className="size-1.5 rounded-full bg-amber-500" />
                )}
              </div>
            );
          }}
          onCellClick={(key) => {
            const s = bySlot.get(key);
            if (s) select(s.id);
          }}
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {(Object.keys(STAGES) as Stage[]).map((stage) => (
            <span key={stage} className="inline-flex items-center gap-1.5">
              <span
                className={cx("size-3 rounded-sm", STAGES[stage].className)}
              />
              {STAGES[stage].label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-slate-900" /> tube placed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-red-500" /> not filled
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-500" /> volume note
          </span>
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <Label>Progress</Label>
          <ProgressBar
            label="Pulled"
            value={progress.pulled}
            total={progress.total}
          />
          <ProgressBar
            label="Labeled"
            value={progress.labeled}
            total={progress.total}
          />
          <ProgressBar
            label="Aliquoted"
            value={progress.finished}
            total={progress.total}
          />
          <ProgressBar
            label="Returned"
            value={progress.returned}
            total={progress.total}
          />
          <p className="text-sm text-slate-600">
            {progress.tubesPlaced} tubes placed · {progress.tubesNotFilled} not
            filled
          </p>
        </Card>
        <Card>
          <Label>Online ({online.length})</Label>
          <ul className="mt-2 space-y-1 text-sm">
            {online.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.name}</span>
                <span className="text-slate-500">
                  {ROLE_LABELS[p.role]}
                  {p.batchNumber ? ` · batch ${p.batchNumber}` : ""}
                  {p.waiting ? " · waiting" : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <Label>Activity</Label>
          <div className="mt-2 max-h-96 overflow-y-auto">
            <Feed events={feed} batchNumber={batch.number} limit={60} />
          </div>
        </Card>
      </div>

      {selected && (
        <SampleDetails
          sample={selected}
          destSets={destSets}
          boxNumber={batch.boxNumber}
          corrections={corrections}
          onClose={() => select(null)}
        />
      )}
    </div>
  );
}

function SampleDetails({
  sample: s,
  destSets,
  boxNumber,
  corrections,
  onClose,
}: {
  sample: Sample;
  destSets: string[];
  boxNumber: number;
  corrections?: Corrections;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const busy = corrections?.busy ?? false;
  const act = (action: Action) => void corrections?.perform(action);
  const step = (label: string, at: string | null, by: string | null) => (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-slate-600">{label}</span>
      <span className={cx("text-right", !at && "text-slate-400")}>
        {at ? `${formatTime(at, true)} · ${by ?? ""}` : "—"}
      </span>
    </div>
  );
  const started = hasPlacedTube(s) || s.finishedAt !== null;

  return (
    <Modal title={`${s.newId} · ${s.originalId}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span className="text-slate-600">Source</span>
          <span>
            {s.sourceBox} · {s.sourcePosition} ({s.sourceLocation})
          </span>
          <span className="text-slate-600">Slot</span>
          <span className="font-mono">{s.slot}</span>
          <span className="text-slate-600">Pull order</span>
          <span>
            {s.pullOrder}
            {s.skipRank !== null ? " (skipped, moved to the end)" : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <SampleFlags sample={s} />
        </div>

        <div className="divide-y divide-slate-100">
          {step("Pulled", s.pulledAt, s.pulledBy)}
          {step("Labeled", s.labeledAt, s.labeledBy)}
          {s.tubes.map((t, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 py-1"
            >
              <span className={cx("font-medium", setColor(i + 1).text)}>
                {labelFor(s.newId, i + 1)} → {destSets[i]} box {boxNumber}
                {t.labelScannedAt && (
                  <span
                    className="ml-2 text-xs font-normal text-slate-500"
                    title={`Label scanned ${formatTime(t.labelScannedAt, true)} by ${t.labelScannedBy ?? ""}`}
                  >
                    label ✓
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={cx(t.status === "not_filled" && "text-red-600")}
                >
                  {t.status === "pending"
                    ? "—"
                    : `${t.status === "placed" ? "placed" : "not filled"} ${t.at ? formatTime(t.at, true) : ""}`}
                </span>
                {corrections && t.status !== "pending" && !s.returnedAt && (
                  <button
                    type="button"
                    disabled={busy}
                    className="text-xs text-slate-500 underline"
                    onClick={() =>
                      act({ type: "undo_tube", sampleId: s.id, tube: i + 1 })
                    }
                  >
                    undo
                  </button>
                )}
              </span>
            </div>
          ))}
          {step("Finished", s.finishedAt, s.finishedBy)}
          {step("Returned", s.returnedAt, s.returnedBy)}
        </div>

        {s.notes.length > 0 && (
          <div>
            <Label>Notes</Label>
            <ul className="mt-1 space-y-1">
              {s.notes.map((n, i) => (
                <li key={i}>
                  <span className="text-slate-500">
                    {formatTime(n.at)} {n.by}:
                  </span>{" "}
                  {n.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {corrections && (
          <>
            <div>
              <Label>Corrections</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {!s.pulledAt && !s.finishedAt && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act({ type: "pull", sampleId: s.id })}
                  >
                    Mark pulled
                  </Button>
                )}
                {s.pulledAt && !started && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act({ type: "undo_pull", sampleId: s.id })}
                  >
                    Undo pull
                  </Button>
                )}
                {!s.labeledAt && !s.finishedAt && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act({ type: "label", sampleId: s.id })}
                  >
                    Mark labeled
                  </Button>
                )}
                {s.labeledAt && !started && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act({ type: "undo_label", sampleId: s.id })}
                  >
                    Undo labels
                  </Button>
                )}
                {!s.finishedAt && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act({ type: "finish", sampleId: s.id })}
                  >
                    Finish (unscanned = not filled)
                  </Button>
                )}
                {s.finishedAt && !s.returnedAt && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act({ type: "reopen", sampleId: s.id })}
                  >
                    Reopen
                  </Button>
                )}
                {s.finishedAt && s.pulledAt && !s.returnedAt && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act({ type: "return", sampleId: s.id })}
                  >
                    Mark returned
                  </Button>
                )}
                {s.returnedAt && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act({ type: "undo_return", sampleId: s.id })}
                  >
                    Undo return
                  </Button>
                )}
                {!s.finishedAt && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act({ type: "skip", sampleId: s.id })}
                  >
                    Move to end of queue
                  </Button>
                )}
              </div>
            </div>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim()) return;
                act({ type: "note", sampleId: s.id, text: note });
                setNote("");
              }}
            >
              <input
                aria-label="Add a note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="Add a note"
                className="h-9 flex-1 rounded-lg px-3 ring-1 ring-slate-300"
              />
              <Button size="sm" type="submit" disabled={busy || !note.trim()}>
                Add
              </Button>
            </form>
          </>
        )}
      </div>
    </Modal>
  );
}
