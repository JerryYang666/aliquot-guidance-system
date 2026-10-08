"use client";

import {
  AlertTriangle,
  Download,
  FileText,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  QrCode,
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

import { JoinQrDialog } from "../join-qr";
import { ROLE_ICONS } from "../role-icons";
import { Badge, cx } from "../ui";

export function ConnectionPill({ connection }: { connection: Connection }) {
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

function JoinQrButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium whitespace-nowrap ring-1 ring-white/40 hover:bg-white/10",
        className,
      )}
    >
      <QrCode className="size-4" /> QR code to join
    </button>
  );
}

export function StationHeader({
  snapshot,
  online,
  connection,
  wake,
  onLeave,
  onRefresh,
  onDialogChange,
  token,
}: {
  snapshot: StateResponse;
  online: OnlineParticipant[];
  connection: Connection;
  wake: WakeLockState;
  onLeave: () => void;
  onRefresh: () => void;
  /** Told while the QR dialog is open, so the station's shortcuts pause. */
  onDialogChange: (open: boolean) => void;
  token: string;
}) {
  const [qrOpen, setQrOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const { job, batch, me } = snapshot;
  const exportUrl = (format: string) =>
    `/api/jobs/${job.code}/export?format=${format}&t=${encodeURIComponent(token)}`;

  const RoleIcon = ROLE_ICONS[me.role];
  const station = `Batch ${batch.number} · Box ${batch.boxNumber}`;
  const showQr = (open: boolean) => {
    setQrOpen(open);
    onDialogChange(open);
  };

  // What tells one station's screen from another's is largest: the role,
  // then the batch and its box. A wide screen has it all on one line, with
  // the name and job beneath. A narrower one puts the batch and box on the
  // second line, with the QR button at its end.
  return (
    <>
      <header className="sticky top-0 z-30 bg-slate-900 text-white">
        <div className="mx-auto grid max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white text-slate-900 lg:row-span-2 lg:size-12 lg:rounded-xl">
            <RoleIcon className="size-5 lg:size-7" />
          </span>
          <div className="flex min-w-0 items-baseline gap-x-4 leading-tight font-bold tracking-tight">
            <span className="truncate text-2xl lg:text-3xl">
              {ROLE_LABELS[me.role]}
            </span>
            <span className="hidden shrink-0 text-2xl text-slate-200 lg:inline">
              {station}
            </span>
          </div>
          <div className="col-span-3 row-start-2 mt-1 flex min-w-0 items-center gap-x-2 lg:col-span-1 lg:col-start-2 lg:mt-0">
            <span className="shrink-0 text-xl leading-tight font-bold tracking-tight sm:text-2xl lg:hidden">
              {station}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-300">
              {me.name}
              {" · "}
              {job.name}
              <span className="ml-2 hidden font-mono text-xs text-slate-400 sm:inline">
                {formatJobCode(job.code)}
              </span>
            </span>
            <JoinQrButton
              className="inline-flex lg:hidden"
              onClick={() => showQr(true)}
            />
          </div>
          <div className="col-start-3 row-start-1 flex items-center gap-3 lg:row-span-2">
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
            <JoinQrButton
              className="hidden lg:inline-flex"
              onClick={() => showQr(true)}
            />
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
      {qrOpen && <JoinQrDialog code={job.code} onClose={() => showQr(false)} />}
    </>
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
