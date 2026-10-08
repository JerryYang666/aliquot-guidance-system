"use client";

import {
  AlertTriangle,
  Download,
  FileText,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  RefreshCw,
  Sun,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { OnlineParticipant, StateResponse } from "@/lib/api-types";
import {
  describeEvent,
  formatTime,
  isProblem,
} from "@/lib/client/describe-event";
import type { Connection } from "@/lib/client/use-job-sync";
import type { WakeLockState } from "@/lib/client/use-wake-lock";
import { formatJobCode } from "@/lib/job-code";
import {
  readyToAliquot,
  toLabel,
  toPull,
  toReturn,
} from "@/lib/pipeline/queue";
import { ROLE_LABELS, type LogEvent, type Sample } from "@/lib/pipeline/types";

import { Badge, cx } from "../ui";

function ConnectionPill({ connection }: { connection: Connection }) {
  const label = { live: "Live", polling: "Polling", connecting: "Connecting" }[
    connection
  ];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300"
      title={
        connection === "live"
          ? "Changes arrive instantly."
          : "The live connection is down; checking for changes every 2 seconds."
      }
    >
      <span
        className={cx(
          "size-2 rounded-full",
          connection === "live" && "bg-emerald-400",
          connection === "polling" && "bg-amber-400",
          connection === "connecting" && "animate-pulse bg-slate-400",
        )}
      />
      {label}
    </span>
  );
}

function WakePill({ state }: { state: WakeLockState }) {
  if (state === "unsupported") return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-slate-300"
      title={
        state === "on"
          ? "The screen will stay on."
          : "Tap the screen to keep it on."
      }
    >
      {state === "on" ? (
        <Sun className="size-3.5" />
      ) : (
        <Moon className="size-3.5" />
      )}
      <span className="hidden sm:inline">
        {state === "on" ? "Awake" : "May sleep"}
      </span>
    </span>
  );
}

export function StationHeader({
  snapshot,
  online,
  connection,
  wake,
  onLeave,
  onRefresh,
  token,
}: {
  snapshot: StateResponse;
  online: OnlineParticipant[];
  connection: Connection;
  wake: WakeLockState;
  onLeave: () => void;
  onRefresh: () => void;
  token: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const { job, batch, me } = snapshot;
  const exportUrl = (format: string) =>
    `/api/jobs/${job.code}/export?format=${format}&t=${encodeURIComponent(token)}`;

  return (
    <header className="sticky top-0 z-30 bg-slate-900 text-white">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-semibold">{job.name}</span>
            <span className="hidden font-mono text-xs text-slate-400 sm:inline">
              {formatJobCode(job.code)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-slate-300">
            <span className="font-semibold text-white">
              {ROLE_LABELS[me.role]}
            </span>
            <span>·</span>
            <span>
              Batch {batch.number}
              <span className="text-slate-400"> (box {batch.boxNumber})</span>
            </span>
            <span>·</span>
            <span className="truncate">{me.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionPill connection={connection} />
          <WakePill state={wake} />
          <div className="relative">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-white/10"
              onClick={() => setPeopleOpen((o) => !o)}
              aria-expanded={peopleOpen}
            >
              <Users className="size-4" />
              {online.length}
            </button>
            {peopleOpen && (
              <div className="absolute right-0 mt-1 w-64 rounded-xl bg-white p-2 text-slate-900 shadow-xl ring-1 ring-slate-200">
                <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase">
                  Online now
                </div>
                {online.length === 0 && (
                  <div className="px-2 py-1 text-sm text-slate-500">
                    Nobody else yet.
                  </div>
                )}
                {online.map((p) => (
                  <div
                    key={p.id}
                    className="flex justify-between gap-2 px-2 py-1 text-sm"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 text-slate-500">
                      {ROLE_LABELS[p.role]}
                      {p.batchNumber ? ` · B${p.batchNumber}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              aria-label="Menu"
              aria-expanded={menuOpen}
              className="rounded-md p-1.5 hover:bg-white/10"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <Menu className="size-5" />
            </button>
            {menuOpen && (
              <nav className="absolute right-0 mt-1 w-60 rounded-xl bg-white p-1 text-sm text-slate-900 shadow-xl ring-1 ring-slate-200">
                <Link
                  href={`/j/${job.code}/log`}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-100"
                >
                  <FileText className="size-4" /> Activity log
                </Link>
                <a
                  href={exportUrl("xlsx")}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-100"
                >
                  <Download className="size-4" /> Download Excel
                </a>
                <a
                  href={exportUrl("csv")}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-100"
                >
                  <Download className="size-4" /> Download log (CSV)
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onRefresh();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-100"
                >
                  <RefreshCw className="size-4" /> Reload data
                </button>
                <button
                  type="button"
                  onClick={onLeave}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-red-700 hover:bg-red-50"
                >
                  <LogOut className="size-4" /> Switch role or batch
                </button>
              </nav>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

/** Where every role is in the batch, so each operator sees the others' pace. */
export function PipelineStrip({ samples }: { samples: Sample[] }) {
  const pull = toPull(samples)[0];
  const label = toLabel(samples)[0];
  const aliquot = readyToAliquot(samples)[0];
  const returns = toReturn(samples).length;
  const finished = samples.filter((s) => s.finishedAt).length;
  const item = (title: string, value: string) => (
    <div className="flex items-baseline gap-1.5">
      <span className="text-slate-500">{title}</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap gap-x-6 gap-y-1 px-4 py-1.5 text-sm">
        {item("Pull", pull?.newId ?? "—")}
        {item("Label", label?.newId ?? "—")}
        {item("Aliquot", aliquot?.newId ?? "—")}
        {item("To return", String(returns))}
        {item("Done", `${finished}/${samples.length}`)}
      </div>
    </div>
  );
}

/** A count out of a total, drawn as a bar. */
export function ProgressBar({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-mono font-semibold">
          {value}/{total}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-200">
        <div
          className="h-2 rounded-full bg-slate-900"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SampleFlags({
  sample,
  large,
}: {
  sample: Sample;
  large?: boolean;
}) {
  const size = large ? "text-base" : undefined;
  return (
    <>
      {sample.volumeNote && (
        <Badge tone="amber" className={size}>
          <AlertTriangle className="size-4" /> {sample.volumeNote}
        </Badge>
      )}
      {sample.skipRank !== null && !sample.pulledAt && (
        <Badge tone="slate" className={size}>
          Skipped earlier
        </Badge>
      )}
      {sample.notes.length > 0 && (
        <Badge tone="blue" className={size}>
          <MessageSquare className="size-4" />
          {sample.notes[sample.notes.length - 1]?.text}
        </Badge>
      )}
    </>
  );
}

export function Feed({
  events,
  batchNumber,
  limit = 30,
}: {
  events: LogEvent[];
  batchNumber?: number;
  limit?: number;
}) {
  const shown = events
    .filter(
      (e) =>
        batchNumber === undefined ||
        e.batchNumber === null ||
        e.batchNumber === batchNumber,
    )
    .slice(0, limit);
  if (!shown.length)
    return <p className="text-sm text-slate-500">No activity yet.</p>;
  return (
    <ol className="space-y-1 text-sm">
      {shown.map((e) => (
        <li
          key={e.id}
          className={cx("flex gap-2", isProblem(e) && "text-red-700")}
        >
          <time className="shrink-0 font-mono text-xs leading-5 text-slate-400">
            {formatTime(e.at)}
          </time>
          <span>
            <span className="font-medium">{e.actorName}</span>{" "}
            {describeEvent(e)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A sample in a list: original ID, new ID and where it is. */
export function SampleLine({
  sample,
  detail,
}: {
  sample: Sample;
  detail?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono font-semibold">{sample.originalId}</span>
      <span className="font-mono text-slate-600">{sample.newId}</span>
      <span className="ml-auto truncate text-right text-sm text-slate-500">
        {detail ?? `${sample.sourceBox} · ${sample.sourcePosition ?? ""}`}
      </span>
    </div>
  );
}
