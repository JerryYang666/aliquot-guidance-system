"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { EventsResponse } from "@/lib/api-types";
import { api } from "@/lib/client/api";
import {
  describeEvent,
  formatTime,
  isProblem,
} from "@/lib/client/describe-event";
import { parseSession, useStoredSessionRaw } from "@/lib/client/session";
import { useJobSync } from "@/lib/client/use-job-sync";
import { formatJobCode } from "@/lib/job-code";
import { labelFor } from "@/lib/pipeline/labels";
import { ROLE_LABELS, type LogEvent, type Role } from "@/lib/pipeline/types";

import { Button, cx } from "../ui";

/** The job's full event log, live at the top, older pages on demand. */
export function LogView({ code }: { code: string }) {
  const raw = useStoredSessionRaw(code);
  const session = useMemo(() => parseSession(raw), [raw]);
  const sync = useJobSync(code, session);
  const [older, setOlder] = useState<LogEvent[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null | undefined>(
    undefined,
  );
  const [batch, setBatch] = useState<number | "all">("all");
  const [loading, setLoading] = useState(false);

  const fetchPage = useCallback(
    (before: number | null) => {
      const params = new URLSearchParams({ limit: "300" });
      if (before) params.set("before", String(before));
      if (batch !== "all") params.set("batch", String(batch));
      return api<EventsResponse>(`/api/jobs/${code}/events?${params}`, {
        token: session?.token,
      });
    },
    [code, session, batch],
  );

  // The newest page, again whenever the batch filter changes.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetchPage(null)
      .then((r) => {
        if (cancelled) return;
        setOlder(r.events);
        setNextBefore(r.nextBefore);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session, fetchPage]);

  const loadOlder = async (before: number) => {
    setLoading(true);
    try {
      const r = await fetchPage(before);
      setOlder((o) => [...o, ...r.events]);
      setNextBefore(r.nextBefore);
    } finally {
      setLoading(false);
    }
  };

  const events = useMemo(() => {
    const seen = new Set<number>();
    const live = sync.feed.filter(
      (e) => batch === "all" || e.batchNumber === batch,
    );
    return [...live, ...older]
      .filter((e) => !seen.has(e.id) && seen.add(e.id))
      .sort((a, b) => b.id - a.id);
  }, [sync.feed, older, batch]);

  if (raw === null) {
    return (
      <p className="p-6">
        Join the job in this tab to see its log.{" "}
        <Link className="underline" href={`/j/${code}`}>
          Join
        </Link>
      </p>
    );
  }

  const batches = sync.snapshot?.batches ?? [];
  const exportUrl = (format: string) =>
    session
      ? `/api/jobs/${code}/export?format=${format}&t=${encodeURIComponent(session.token)}`
      : "#";

  return (
    <main className="mx-auto max-w-7xl p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href={`/j/${code}/station`}
            className="text-sm text-slate-600 underline"
          >
            ← Back to the station
          </Link>
          <div className="font-mono text-sm text-slate-500">
            {formatJobCode(code)}
          </div>
          <h1 className="text-2xl font-bold">Activity log</h1>
          <p className="text-sm text-slate-600">
            Every action, newest first. Times are this device&apos;s local time,
            to the millisecond; the server recorded each one.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Batch"
            value={batch}
            onChange={(e) =>
              setBatch(
                e.target.value === "all" ? "all" : Number(e.target.value),
              )
            }
            className="h-10 rounded-lg bg-white px-3 ring-1 ring-slate-300"
          >
            <option value="all">All batches</option>
            {batches.map((b) => (
              <option key={b.number} value={b.number}>
                Batch {b.number}
              </option>
            ))}
          </select>
          <a
            href={exportUrl("xlsx")}
            className="inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50"
          >
            Excel
          </a>
          <a
            href={exportUrl("csv")}
            className="inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50"
          >
            CSV
          </a>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">Batch</th>
              <th className="px-3 py-2 font-medium">Tube</th>
              <th className="px-3 py-2 font-medium">What</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr
                key={e.id}
                className={cx(
                  "border-t border-slate-100",
                  isProblem(e) && "bg-red-50 text-red-800",
                )}
              >
                <td
                  className="px-3 py-1.5 font-mono whitespace-nowrap"
                  title={e.at}
                >
                  {new Date(e.at).toLocaleDateString()} {formatTime(e.at, true)}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {e.actorName}
                  {e.actorRole && (
                    <span className="text-slate-400">
                      {" "}
                      · {ROLE_LABELS[e.actorRole as Role]}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5">{e.batchNumber ?? ""}</td>
                <td className="px-3 py-1.5 font-mono whitespace-nowrap">
                  {e.newId
                    ? e.tube
                      ? labelFor(e.newId, e.tube)
                      : e.newId
                    : ""}
                </td>
                <td className="px-3 py-1.5">{describeEvent(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-center">
        {nextBefore ? (
          <Button onClick={() => void loadOlder(nextBefore)} disabled={loading}>
            {loading ? "Loading…" : "Load older"}
          </Button>
        ) : (
          nextBefore === null && (
            <p className="text-sm text-slate-500">Start of the log.</p>
          )
        )}
      </div>
    </main>
  );
}
