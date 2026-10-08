"use client";

import {
  Check,
  CircleSlash,
  Hourglass,
  MessageSquarePlus,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";

import { ScannerPanel } from "@/components/scanner/scanner-panel";
import { signal } from "@/lib/client/feedback";
import { randomId } from "@/lib/client/ids";
import { decideScan, tubesPlacedBy } from "@/lib/pipeline/actions";
import { destinationFor } from "@/lib/pipeline/destination";
import { labelFor, parseLabel } from "@/lib/pipeline/labels";
import {
  isFinished,
  isLabeled,
  isReady,
  queueOrder,
  sourceTubesOut,
} from "@/lib/pipeline/queue";
import type { Sample } from "@/lib/pipeline/types";

import { BoxGrid } from "../box-grid";
import { Modal } from "../modal";
import { Badge, Button, Card, cx, Label, setColor } from "../ui";

import { SampleFlags } from "./common";
import type { ViewProps } from "./types";

type ScanView =
  | {
      id: string;
      kind: "place" | "repeat";
      label: string;
      /** The tubes the scan placed, the scanned one first; for a repeat, the scanned one. */
      tubes: number[];
      box: number;
      slot: string;
      newId: string;
      sampleDone: boolean;
      pending: boolean;
    }
  | {
      id: string;
      kind: "reject";
      label: string;
      message: string;
      pending: boolean;
    }
  | { id: string; kind: "checking"; label: string };

type Dialog =
  { kind: "finish" } | { kind: "note" } | { kind: "undo"; tube: number } | null;

export function AliquoterView({
  snapshot,
  samples,
  perform,
  busy,
  setDialogOpen,
}: ViewProps) {
  const { destSets } = snapshot.job;
  const boxNumber = snapshot.batch.boxNumber;
  // Every source tube out on this bench, labeled or not. The one on the
  // screen (the tapped one, else the first) is what a scan must match.
  const out = sourceTubesOut(samples);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current = out.find((s) => s.id === selectedId) ?? out[0] ?? null;
  const others = out.filter((s) => s.id !== current?.id);
  const [result, setResult] = useState<ScanView | null>(null);
  const [dialog, setDialogState] = useState<Dialog>(null);
  const [note, setNote] = useState("");

  const setDialog = (d: Dialog) => {
    setDialogState(d);
    setDialogOpen(d !== null);
  };

  /** Gets each new label once, already normalized (see ScannerPanel). */
  const handleScan = useCallback(
    async (label: string) => {
      // Show the outcome at once from local state; the server confirms it.
      const id = randomId();
      let preview: ScanView["kind"] = "checking";
      const parsed = parseLabel(label);
      const labelSample = parsed
        ? (samples.find((s) => s.newId === parsed.newId) ?? null)
        : null;
      if (!parsed || labelSample) {
        const decision = decideScan({
          label,
          parsed,
          labelSample,
          currentSample: current,
          batchNumber: snapshot.batch.number,
          destCount: destSets.length,
        });
        preview = decision.kind;
        if (decision.kind === "reject") {
          setResult({
            id,
            kind: "reject",
            label,
            message: decision.message,
            pending: true,
          });
          signal("error");
        } else {
          // A placement takes the sample's other pending tubes with it, so
          // it always leaves the sample finished.
          const place = decision.kind === "place";
          setResult({
            id,
            kind: decision.kind,
            label: labelFor(decision.sample.newId, decision.tube),
            tubes: place
              ? tubesPlacedBy(decision.sample, decision.tube)
              : [decision.tube],
            box: boxNumber,
            slot: decision.sample.slot,
            newId: decision.sample.newId,
            sampleDone: place,
            pending: true,
          });
          signal(place ? "done" : "repeat");
        }
      } else {
        setResult({ id, kind: "checking", label });
      }

      const sent = await perform({
        type: "scan",
        label,
        currentSampleId: current?.id ?? null,
      });
      const outcome = sent.ok ? sent.response.scan : undefined;
      let next: ScanView;
      if (!sent.ok || !outcome || outcome.kind === "reject") {
        const message = !sent.ok
          ? sent.error.message
          : outcome?.kind === "reject"
            ? outcome.message
            : "No answer from the server.";
        next = { id, kind: "reject", label, message, pending: false };
        if (preview !== "reject") signal("error");
      } else {
        next = {
          id,
          kind: outcome.kind,
          label: outcome.label,
          tubes: outcome.tubes,
          box: outcome.destination.box,
          slot: outcome.destination.slot,
          newId: outcome.label.replace(/-\d+$/, ""),
          sampleDone: outcome.kind === "place" && outcome.sampleFinished,
          pending: false,
        };
        if (preview === "checking" || preview === "reject") {
          signal(
            outcome.kind === "repeat"
              ? "repeat"
              : outcome.sampleFinished
                ? "done"
                : "ok",
          );
        }
      }
      setResult((r) => (r?.id === id ? next : r));
    },
    [samples, current, snapshot.batch.number, destSets, boxNumber, perform],
  );

  const finish = async () => {
    if (!current) return;
    const r = await perform({
      type: "finish",
      sampleId: current.id,
      note: note.trim() || undefined,
    });
    if (r.ok) {
      setNote("");
      setDialog(null);
    }
  };

  const addNote = async () => {
    if (!current || !note.trim()) return;
    const r = await perform({ type: "note", sampleId: current.id, text: note });
    if (r.ok) {
      setNote("");
      setDialog(null);
    }
  };

  const undoTube = async (tube: number) => {
    if (!current) return;
    await perform({ type: "undo_tube", sampleId: current.id, tube });
    setDialog(null);
  };

  // The next sample coming this way: first in queue order not yet ready.
  const waitingFor = queueOrder(samples).find(
    (s) => !isFinished(s) && !isReady(s),
  );

  return (
    <div className="mx-auto grid max-w-7xl gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[420px_1fr]">
      <ScannerPanel
        onLabel={(label) => void handleScan(label)}
        idleText="Hold one new tube's label in the frame: one scan places all three. The camera stays on."
      >
        <ScanResult
          result={result}
          destSets={destSets}
          layout={snapshot.layouts.dest}
        />
      </ScannerPanel>

      <div className="flex flex-col gap-3">
        {current?.labeledAt ? (
          <CurrentSample
            sample={current}
            destSets={destSets}
            boxNumber={boxNumber}
            busy={busy}
            onUndoTube={(tube) => setDialog({ kind: "undo", tube })}
            onFinish={() => setDialog({ kind: "finish" })}
            onNote={() => setDialog({ kind: "note" })}
          />
        ) : current ? (
          // A source tube can reach this bench before its labels do.
          <Card className="flex flex-col gap-4 p-5">
            <SourceTube
              label="Pulled, waiting for its labels"
              sample={current}
            />
            <div className="flex flex-wrap gap-2">
              <Badge tone="amber" className="text-base">
                <Hourglass className="size-4" /> Not labeled yet
              </Badge>
              <SampleFlags sample={current} large />
            </div>
            <p className="text-slate-600">
              This source tube is out of the freezer, but its new tubes are not
              labeled yet. Scanning one of them places them all.
            </p>
          </Card>
        ) : (
          <Card className="p-6">
            <Label>Waiting</Label>
            <p className="mt-2 text-2xl font-semibold">
              Waiting for the next tube.
            </p>
            {waitingFor ? (
              <p className="mt-1 text-slate-600">
                Next up:{" "}
                <span className="font-mono font-semibold">
                  {waitingFor.newId}
                </span>{" "}
                — {waitingFor.pulledAt ? "pulled ✓" : "not pulled yet"},{" "}
                {waitingFor.labeledAt ? "labeled ✓" : "not labeled yet"}.
                Scanning one of its tubes places them all.
              </p>
            ) : (
              <p className="mt-1 text-emerald-700">
                Every sample in this batch is finished.
              </p>
            )}
          </Card>
        )}

        <OtherTubes
          title="Also ready"
          samples={others.filter(isLabeled)}
          onSwitch={setSelectedId}
        />
        <OtherTubes
          title="Pulled, not labeled yet"
          samples={others.filter((s) => !isLabeled(s))}
          onSwitch={setSelectedId}
        />
      </div>

      {dialog?.kind === "finish" && current && (
        <Modal
          title={`Finish ${current.newId}`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => void finish()}
                disabled={busy}
              >
                Finish sample
              </Button>
            </>
          }
        >
          <p className="text-slate-700">
            Tubes not placed will be recorded as <strong>not filled</strong>:{" "}
            {current.tubes
              .map((t, i) =>
                t.status === "pending" ? labelFor(current.newId, i + 1) : null,
              )
              .filter(Boolean)
              .join(", ") || "none"}
            .
          </p>
          <label
            className="mt-4 block text-sm font-medium"
            htmlFor="finish-note"
          >
            Note (optional)
          </label>
          <textarea
            id="finish-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Only 150 µL available"
            className="mt-1 w-full rounded-lg p-2 ring-1 ring-slate-300"
          />
        </Modal>
      )}

      {dialog?.kind === "note" && current && (
        <Modal
          title={`Note on ${current.newId}`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => void addNote()}
                disabled={busy || !note.trim()}
              >
                Save note
              </Button>
            </>
          }
        >
          <textarea
            aria-label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            maxLength={500}
            className="w-full rounded-lg p-2 ring-1 ring-slate-300"
          />
        </Modal>
      )}

      {dialog?.kind === "undo" && current && (
        <Modal
          title={`Undo ${labelFor(current.newId, dialog.tube)}?`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => void undoTube(dialog.tube)}
                disabled={busy}
              >
                Undo
              </Button>
            </>
          }
        >
          <p className="text-slate-700">
            The tube goes back to not placed and can be scanned again. The log
            keeps both entries.
          </p>
        </Modal>
      )}
    </div>
  );
}

/** Other source tubes out on the bench; tapping one puts it on the screen. */
function OtherTubes({
  title,
  samples,
  onSwitch,
}: {
  title: string;
  samples: Sample[];
  onSwitch: (sampleId: string) => void;
}) {
  if (samples.length === 0) return null;
  return (
    <Card>
      <Label>
        {title} ({samples.length})
      </Label>
      <ul className="mt-2 divide-y divide-slate-100">
        {samples.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSwitch(s.id)}
              className="flex w-full items-baseline gap-3 py-2 text-left hover:bg-slate-50"
            >
              <span className="font-mono text-lg font-semibold">
                {s.originalId}
              </span>
              <span className="font-mono text-slate-600">{s.newId}</span>
              <span className="ml-auto text-sm text-slate-500">
                Switch to this tube
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * A source tube to look for: its original ID, largest, then the new ID and
 * slot. Those two are checked against the new tubes before pipetting; a
 * scan would only catch the wrong tube after it has been filled.
 */
function SourceTube({ label, sample }: { label: string; sample: Sample }) {
  const value =
    "font-mono text-5xl leading-none font-bold tracking-tight sm:text-6xl";
  return (
    <div>
      <Label>{label}</Label>
      <div className="font-mono text-6xl font-bold tracking-tight sm:text-7xl">
        {sample.originalId}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <div className="text-sm text-slate-500">New ID</div>
          <div className={value}>{sample.newId}</div>
        </div>
        <div>
          <div className="text-sm text-slate-500">Slot</div>
          <div className={value}>{sample.slot}</div>
        </div>
      </div>
    </div>
  );
}

function CurrentSample({
  sample,
  destSets,
  boxNumber,
  busy,
  onUndoTube,
  onFinish,
  onNote,
}: {
  sample: Sample;
  destSets: string[];
  boxNumber: number;
  busy: boolean;
  onUndoTube: (tube: number) => void;
  onFinish: () => void;
  onNote: () => void;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <SourceTube label="Check the source tube" sample={sample} />
      <div className="flex flex-wrap gap-2">
        <SampleFlags sample={sample} large />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {sample.tubes.map((tube, i) => {
          const n = i + 1;
          const color = setColor(n);
          const set = destSets[i] ?? `Set ${n}`;
          return (
            <button
              key={n}
              type="button"
              disabled={tube.status === "pending" || busy}
              onClick={() => onUndoTube(n)}
              className={cx(
                "rounded-xl p-3 text-left",
                tube.status === "placed" && color.solid,
                tube.status === "pending" &&
                  cx("ring-2 ring-inset", color.text, color.soft),
                tube.status === "not_filled" &&
                  "bg-slate-200 text-slate-500 line-through",
              )}
              title={tube.status === "pending" ? undefined : "Tap to undo"}
            >
              <div className="flex items-center justify-between font-mono text-lg font-bold">
                -{n}
                {tube.status === "placed" && <Check className="size-5" />}
                {tube.status === "not_filled" && (
                  <CircleSlash className="size-5" />
                )}
              </div>
              <div className="text-sm">{set}</div>
              <div className="text-xs opacity-80">
                box {boxNumber} · {sample.slot}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onFinish} disabled={busy}>
          Finish sample…
        </Button>
        <Button variant="ghost" onClick={onNote} disabled={busy}>
          <MessageSquarePlus className="size-4" /> Note
        </Button>
      </div>
    </Card>
  );
}

function ScanResult({
  result,
  destSets,
  layout,
}: {
  result: ScanView | null;
  destSets: string[];
  layout: ViewProps["snapshot"]["layouts"]["dest"];
}) {
  if (!result) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-slate-500">
        Scan a tube to see where it goes.
      </div>
    );
  }
  if (result.kind === "checking") {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-slate-200 p-5 text-slate-700">
        <Hourglass className="size-6 animate-pulse" />
        <span className="font-mono text-xl">Checking {result.label}…</span>
      </div>
    );
  }
  if (result.kind === "reject") {
    return (
      <div role="alert" className="rounded-2xl bg-red-600 p-5 text-white">
        <div className="flex items-center gap-2 text-2xl font-bold">
          <X className="size-7" /> Wrong tube — do not place it
        </div>
        <p className="mt-1 text-lg">{result.message}</p>
      </div>
    );
  }
  // In set order, as the boxes stand; the label below names the one scanned.
  const dests = [...result.tubes]
    .sort((a, b) => a - b)
    .map((n) => destinationFor(destSets, result.box, result.slot, n));
  const color = setColor(result.tubes[0] ?? 0);
  const repeat = result.kind === "repeat";
  // One scan placed several tubes: they share the slot, each in its own set's box.
  const several = dests.length > 1;
  return (
    <div
      role="status"
      className={cx(
        "rounded-2xl p-5",
        repeat
          ? cx(color.soft, color.text)
          : several
            ? "bg-slate-800 text-white"
            : color.solid,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold uppercase opacity-90">
            {repeat
              ? "Already placed"
              : several
                ? `${dests.length} tubes go in`
                : "Place in"}
          </div>
          {several ? (
            <div className="my-1 flex flex-wrap gap-1.5">
              {dests.map((d) => (
                <span
                  key={d.tube}
                  className={cx(
                    "rounded-lg px-2 py-0.5 text-xl font-black uppercase",
                    setColor(d.tube).solid,
                  )}
                >
                  {d.set}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-4xl leading-tight font-black uppercase">
              {dests[0]?.set}
            </div>
          )}
          <div className="text-2xl font-bold">Box {result.box}</div>
          <div className="font-mono text-7xl leading-none font-black">
            {result.slot}
          </div>
        </div>
        <div className="w-32 shrink-0 rounded-lg bg-white p-1.5 sm:w-40">
          <BoxGrid
            layout={layout}
            highlight={result.slot}
            highlightClass={several ? undefined : color.solid}
            size="sm"
            label={`${dests.map((d) => d.set).join(", ")} box ${result.box}, ${result.slot}`}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono font-semibold">{result.label}</span>
        {result.pending ? (
          <span className="opacity-80">saving…</span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Check className="size-4" /> saved
          </span>
        )}
        {result.sampleDone && (
          <Badge tone="green" className="ml-auto">
            {result.newId} complete
          </Badge>
        )}
      </div>
    </div>
  );
}
