"use client";

import {
  Camera,
  Check,
  CircleSlash,
  Flashlight,
  Hourglass,
  Keyboard,
  MessageSquarePlus,
  ScanLine,
  X,
} from "lucide-react";
import { useCallback, useRef, useState, type FormEvent } from "react";

import { useCameraScanner } from "@/components/scanner/use-camera-scanner";
import { useKeyboardScanner } from "@/components/scanner/use-keyboard-scanner";
import { signal } from "@/lib/client/feedback";
import { randomId } from "@/lib/client/ids";
import { decideScan } from "@/lib/pipeline/actions";
import { destinationFor } from "@/lib/pipeline/destination";
import { labelFor, normalizeLabel, parseLabel } from "@/lib/pipeline/labels";
import {
  isFinished,
  isReady,
  queueOrder,
  readyToAliquot,
} from "@/lib/pipeline/queue";
import type { Sample } from "@/lib/pipeline/types";

import { BoxGrid } from "../box-grid";
import { Modal } from "../modal";
import { Badge, Button, Card, cx, Label, setColor } from "../ui";

import { SampleFlags } from "./common";
import type { ViewProps } from "./types";

const REPEAT_WINDOW_MS = 2_500;

type ScanView =
  | {
      id: string;
      kind: "place" | "repeat";
      label: string;
      tube: number;
      set: string;
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
  const ready = readyToAliquot(samples);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current = ready.find((s) => s.id === selectedId) ?? ready[0] ?? null;
  const [result, setResult] = useState<ScanView | null>(null);
  const [dialog, setDialogState] = useState<Dialog>(null);
  const [note, setNote] = useState("");
  const [manual, setManual] = useState("");
  const lastScan = useRef<{ label: string; at: number } | null>(null);

  const setDialog = (d: Dialog) => {
    setDialogState(d);
    setDialogOpen(d !== null);
  };

  const handleScan = useCallback(
    async (raw: string) => {
      const label = normalizeLabel(raw);
      if (!label) return;
      const now = Date.now();
      if (
        lastScan.current?.label === label &&
        now - lastScan.current.at < REPEAT_WINDOW_MS
      )
        return;
      lastScan.current = { label, at: now };

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
          const d = destinationFor(
            destSets,
            boxNumber,
            decision.sample.slot,
            decision.tube,
          );
          const sampleDone =
            decision.kind === "place" &&
            decision.sample.tubes.every(
              (t, i) => i === decision.tube - 1 || t.status !== "pending",
            );
          setResult({
            id,
            kind: decision.kind,
            label: labelFor(decision.sample.newId, decision.tube),
            tube: decision.tube,
            set: d.set,
            box: d.box,
            slot: d.slot,
            newId: decision.sample.newId,
            sampleDone,
            pending: true,
          });
          signal(
            decision.kind === "repeat" ? "repeat" : sampleDone ? "done" : "ok",
          );
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
          tube: outcome.destination.tube,
          set: outcome.destination.set,
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
        // A scan while waiting starts that sample: stay on it until it is done.
        const placed = sent.response.samples[0];
        if (outcome.kind === "place" && placed && !outcome.sampleFinished)
          setSelectedId(placed.id);
      }
      setResult((r) => (r?.id === id ? next : r));
    },
    [samples, current, snapshot.batch.number, destSets, boxNumber, perform],
  );

  const {
    videoRef,
    state: cameraState,
    start: startCamera,
    extras: cameraExtras,
    torchOn,
    toggleTorch,
    zoom,
    setZoom,
  } = useCameraScanner(handleScan);
  useKeyboardScanner(handleScan);

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    lastScan.current = null;
    void handleScan(manual);
    setManual("");
  };

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
  const scanning = cameraState === "scanning";

  return (
    <div className="mx-auto grid max-w-7xl gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[420px_1fr]">
      <div className="flex flex-col gap-3">
        <div className="relative overflow-hidden rounded-2xl bg-slate-950">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className={cx(
              "aspect-[4/3] max-h-[34dvh] w-full object-cover lg:max-h-none",
              !scanning && "opacity-0",
            )}
          />
          {scanning && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="aspect-square h-[70%] rounded-xl border-2 border-dashed border-white/70" />
            </div>
          )}
          {!scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-white">
              {cameraState === "starting" ? (
                <p>Starting camera…</p>
              ) : (
                <>
                  <p className="text-sm text-slate-300">
                    {cameraState === "denied"
                      ? "Camera access was refused. Allow it in the browser's site settings, then try again."
                      : cameraState === "unavailable"
                        ? "No camera found. Type labels below, or use a USB scanner."
                        : cameraState === "error"
                          ? "The camera could not start."
                          : "Hold each new tube's label in the frame. The camera stays on."}
                  </p>
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => void startCamera()}
                  >
                    <Camera className="size-5" /> Start camera
                  </Button>
                </>
              )}
            </div>
          )}
          {scanning && (
            <div className="absolute right-2 bottom-2 flex gap-2">
              {cameraExtras.zoom && cameraExtras.zoom.max >= 2 && (
                <button
                  type="button"
                  className="rounded-full bg-black/60 px-3 py-1.5 text-sm font-semibold text-white"
                  onClick={() => {
                    const max = cameraExtras.zoom?.max ?? 1;
                    const next = zoom >= Math.min(3, max) ? 1 : zoom + 1;
                    void setZoom(Math.min(next, max));
                  }}
                >
                  {zoom}×
                </button>
              )}
              {cameraExtras.torch && (
                <button
                  type="button"
                  aria-label="Torch"
                  aria-pressed={torchOn}
                  className={cx(
                    "rounded-full p-2",
                    torchOn
                      ? "bg-yellow-300 text-black"
                      : "bg-black/60 text-white",
                  )}
                  onClick={() => void toggleTorch()}
                >
                  <Flashlight className="size-4" />
                </button>
              )}
            </div>
          )}
          {scanning && (
            <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs text-white">
              <ScanLine className="size-3.5" /> Scanning
            </div>
          )}
        </div>

        <ScanResult result={result} layout={snapshot.layouts.dest} />

        <form onSubmit={submitManual} className="flex gap-2">
          <label className="sr-only" htmlFor="manual-label">
            Type a label
          </label>
          <div className="relative flex-1">
            <Keyboard className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="manual-label"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Type a label, e.g. S0066-1"
              autoCapitalize="characters"
              autoComplete="off"
              className="h-10 w-full rounded-lg bg-white pr-3 pl-9 font-mono ring-1 ring-slate-300"
            />
          </div>
          <Button type="submit" disabled={!manual.trim()}>
            Enter
          </Button>
        </form>
      </div>

      <div className="flex flex-col gap-3">
        {current ? (
          <CurrentSample
            sample={current}
            destSets={destSets}
            boxNumber={boxNumber}
            busy={busy}
            onUndoTube={(tube) => setDialog({ kind: "undo", tube })}
            onFinish={() => setDialog({ kind: "finish" })}
            onNote={() => setDialog({ kind: "note" })}
          />
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
                Scanning one of its tubes starts it.
              </p>
            ) : (
              <p className="mt-1 text-emerald-700">
                Every sample in this batch is finished.
              </p>
            )}
          </Card>
        )}

        {ready.length > 1 && (
          <Card>
            <Label>Also ready ({ready.length - 1})</Label>
            <ul className="mt-2 divide-y divide-slate-100">
              {ready
                .filter((s) => s.id !== current?.id)
                .map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className="flex w-full items-baseline gap-3 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="font-mono text-lg font-semibold">
                        {s.originalId}
                      </span>
                      <span className="font-mono text-slate-600">
                        {s.newId}
                      </span>
                      <span className="ml-auto text-sm text-slate-500">
                        Switch to this tube
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </Card>
        )}
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
            Tubes not scanned will be recorded as <strong>not filled</strong>:{" "}
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
      <div>
        <Label>Check the source tube</Label>
        <div className="font-mono text-6xl font-bold tracking-tight sm:text-7xl">
          {sample.originalId}
        </div>
        <div className="mt-1 text-slate-600">
          New ID <span className="font-mono font-semibold">{sample.newId}</span>{" "}
          · slot <span className="font-mono font-semibold">{sample.slot}</span>
        </div>
      </div>
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
  layout,
}: {
  result: ScanView | null;
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
  const color = setColor(result.tube);
  const repeat = result.kind === "repeat";
  return (
    <div
      role="status"
      className={cx(
        "rounded-2xl p-5",
        repeat ? cx(color.soft, color.text) : color.solid,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold uppercase opacity-90">
            {repeat ? "Already placed" : "Place in"}
          </div>
          <div className="text-4xl leading-tight font-black uppercase">
            {result.set}
          </div>
          <div className="text-2xl font-bold">Box {result.box}</div>
          <div className="font-mono text-7xl leading-none font-black">
            {result.slot}
          </div>
        </div>
        <div className="w-32 shrink-0 rounded-lg bg-white p-1.5 sm:w-40">
          <BoxGrid
            layout={layout}
            highlight={result.slot}
            highlightClass={color.solid}
            size="sm"
            label={`${result.set} box ${result.box}, ${result.slot}`}
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
