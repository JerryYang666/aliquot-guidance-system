"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Hourglass,
  SkipForward,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";

import { ScannerPanel } from "@/components/scanner/scanner-panel";
import { signal } from "@/lib/client/feedback";
import { randomId } from "@/lib/client/ids";
import { useHotkeys } from "@/lib/client/use-hotkeys";
import { decideLabelScan } from "@/lib/pipeline/actions";
import { labelFor, parseLabel } from "@/lib/pipeline/labels";
import { hasPlacedTube, toLabel } from "@/lib/pipeline/queue";
import type { Sample } from "@/lib/pipeline/types";

import { Badge, Button, Card, cx, Kbd, Label, setColor } from "../ui";

import { SampleFlags } from "./common";
import type { ViewProps } from "./types";

type LabelResult =
  | {
      id: string;
      kind: "record" | "repeat";
      label: string;
      tube: number;
      newId: string;
      sampleLabeled: boolean;
      pending: boolean;
    }
  | { id: string; kind: "reject"; label: string; message: string }
  | { id: string; kind: "checking"; label: string };

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
  const [result, setResult] = useState<LabelResult | null>(null);

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

  /** A scanned label: show the outcome from local state at once, then the server's answer. */
  const handleLabel = useCallback(
    async (label: string) => {
      const id = randomId();
      const parsed = parseLabel(label);
      const labelSample = parsed
        ? (samples.find((s) => s.newId === parsed.newId) ?? null)
        : null;
      let preview: LabelResult["kind"] = "checking";
      if (!parsed || labelSample) {
        const decision = decideLabelScan({
          label,
          parsed,
          labelSample,
          currentSample: next ?? null,
          batchNumber: snapshot.batch.number,
          destCount: destSets.length,
        });
        preview = decision.kind;
        if (decision.kind === "reject") {
          setResult({ id, kind: "reject", label, message: decision.message });
          signal("error");
        } else {
          const { sample, tube } = decision;
          const sampleLabeled =
            sample.labeledAt !== null ||
            (decision.kind === "record" &&
              sample.tubes.every((t, i) => i === tube - 1 || t.labelScannedAt));
          setResult({
            id,
            kind: decision.kind,
            label: labelFor(sample.newId, tube),
            tube,
            newId: sample.newId,
            sampleLabeled,
            pending: true,
          });
          signal(
            decision.kind === "repeat"
              ? "repeat"
              : sampleLabeled
                ? "done"
                : "ok",
          );
        }
      } else {
        setResult({ id, kind: "checking", label });
      }

      const sent = await perform({
        type: "label_scan",
        label,
        currentSampleId: next?.id ?? null,
      });
      const outcome = sent.ok ? sent.response.labelScan : undefined;
      let settled: LabelResult;
      if (!sent.ok || !outcome || outcome.kind === "reject") {
        const message = !sent.ok
          ? sent.error.message
          : outcome?.kind === "reject"
            ? outcome.message
            : "No answer from the server.";
        settled = { id, kind: "reject", label, message };
        if (preview !== "reject") signal("error");
      } else {
        settled = {
          id,
          kind: outcome.kind,
          label: outcome.label,
          tube: outcome.tube,
          newId: outcome.label.replace(/-\d+$/, ""),
          sampleLabeled: outcome.sampleLabeled,
          pending: false,
        };
        if (preview === "checking" || preview === "reject") {
          signal(
            outcome.kind === "repeat"
              ? "repeat"
              : outcome.sampleLabeled
                ? "done"
                : "ok",
          );
        }
      }
      setResult((r) => (r?.id === id ? settled : r));
    },
    [samples, next, snapshot.batch.number, destSets.length, perform],
  );

  const scanned = next?.tubes.filter((t) => t.labelScannedAt).length ?? 0;

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[1fr_380px]">
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
                const isScanned = Boolean(next.tubes[i]?.labelScannedAt);
                return (
                  <div
                    key={set}
                    className={cx(
                      "rounded-2xl p-4",
                      isScanned
                        ? color.solid
                        : cx("ring-2 ring-inset", color.soft, color.text),
                    )}
                  >
                    <div className="flex items-center justify-between font-mono text-3xl font-bold">
                      {labelFor(next.newId, i + 1)}
                      {isScanned && <Check className="size-7" />}
                    </div>
                    <div className="text-sm opacity-90">
                      {set} box {snapshot.batch.boxNumber}
                      {isScanned ? " · scanned" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <SampleFlags sample={next} large />
              {scanned > 0 && (
                <Badge tone="green" className="text-base">
                  {scanned} of {destSets.length} scanned
                </Badge>
              )}
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
            <p className="text-sm text-slate-500">
              Stick the labels on, then press Space — or scan each tube instead;
              the last scan moves on by itself.
            </p>
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

      <div className="flex flex-col gap-4">
        <ScannerPanel
          onLabel={(l) => void handleLabel(l)}
          idleText="Optional: scan each labeled tube to check it."
          videoClassName="aspect-video max-h-[28dvh] lg:max-h-none"
        >
          <LabelScanResult result={result} />
        </ScannerPanel>

        <Card>
          <Label>Find these labels next</Label>
          <ol className="mt-3 space-y-2">
            {queue.slice(1, 9).map((s) => (
              <li key={s.id} className="flex items-baseline justify-between">
                <span className="font-mono text-xl font-semibold">
                  {s.newId}
                </span>
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
    </div>
  );
}

function LabelScanResult({ result }: { result: LabelResult | null }) {
  if (!result) return null;
  if (result.kind === "checking") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-slate-200 p-3 text-slate-700">
        <Hourglass className="size-5 animate-pulse" />
        <span className="font-mono">Checking {result.label}…</span>
      </div>
    );
  }
  if (result.kind === "reject") {
    return (
      <div role="alert" className="rounded-xl bg-red-600 p-3 text-white">
        <div className="flex items-center gap-2 text-lg font-bold">
          <X className="size-5" /> Wrong label
        </div>
        <p>{result.message}</p>
      </div>
    );
  }
  const color = setColor(result.tube);
  return (
    <div
      role="status"
      className={cx(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl p-3",
        result.kind === "repeat" ? cx(color.soft, color.text) : color.solid,
      )}
    >
      <Check className="size-5" />
      <span className="font-mono text-lg font-bold">{result.label}</span>
      <span>
        {result.kind === "repeat" ? "already scanned" : "label checked"}
      </span>
      <span className="text-sm opacity-80">
        {result.pending ? "saving…" : "saved"}
      </span>
      {result.sampleLabeled && result.kind === "record" && (
        <Badge tone="green" className="ml-auto">
          {result.newId} labeled
        </Badge>
      )}
    </div>
  );
}
