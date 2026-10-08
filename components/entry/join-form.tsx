"use client";

import { Beaker, Eye, PackageOpen, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { JobSummaryResponse, JoinResponse } from "@/lib/api-types";
import { api, ApiFailure } from "@/lib/client/api";
import {
  parseSession,
  rememberedName,
  saveSession,
  useStoredSessionRaw,
} from "@/lib/client/session";
import { formatJobCode } from "@/lib/job-code";
import { ROLE_LABELS, type Role } from "@/lib/pipeline/types";

import { Button, Card, cx, Label } from "../ui";

const ROLE_INFO: { role: Role; icon: typeof Beaker; text: string }[] = [
  {
    role: "puller",
    icon: PackageOpen,
    text: "Takes source tubes from the freezer and returns them.",
  },
  { role: "labeler", icon: Tag, text: "Sticks the three labels on new tubes." },
  {
    role: "aliquoter",
    icon: Beaker,
    text: "Pipettes, then scans each new tube with the camera.",
  },
  { role: "overview", icon: Eye, text: "Watches progress and fixes mistakes." },
];

export function JoinForm({ code }: { code: string }) {
  const router = useRouter();
  const existing = parseSession(useStoredSessionRaw(code));
  const [summary, setSummary] = useState<JobSummaryResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [batch, setBatch] = useState<number | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<JobSummaryResponse>(`/api/jobs/${code}`)
      .then((s) => {
        if (cancelled) return;
        setSummary(s);
        setName((n) => n || rememberedName());
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setLoadError(
            e instanceof ApiFailure ? e.message : "Could not load the job.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const firstOpen = useMemo(
    () =>
      summary?.batches.find((b) => b.finished < b.total)?.number ??
      summary?.batches[0]?.number,
    [summary],
  );
  const chosenBatch = batch ?? firstOpen ?? null;

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (!role || !chosenBatch || !name.trim()) return;
    setJoining(true);
    setError(null);
    try {
      const r = await api<JoinResponse>(`/api/jobs/${code}/join`, {
        body: { name: name.trim(), role, batchNumber: chosenBatch },
      });
      saveSession(code, { token: r.token, me: r.me });
      router.push(`/j/${code}/station`);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Could not join.");
      setJoining(false);
    }
  };

  if (loadError) {
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Job {formatJobCode(code)}</h1>
        <p className="mt-2 text-red-700">{loadError}</p>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          Try another code
        </Link>
      </Card>
    );
  }
  if (!summary) return <p className="text-slate-500">Loading job…</p>;

  return (
    <form onSubmit={join} className="flex flex-col gap-5">
      <div>
        <div className="font-mono text-sm text-slate-500">
          {formatJobCode(summary.job.code)}
        </div>
        <h1 className="text-2xl font-bold">{summary.job.name}</h1>
      </div>

      {existing && (
        <Card className="flex items-center justify-between gap-3 bg-emerald-50 ring-emerald-200">
          <span className="text-sm">
            This tab is already {existing.me.name},{" "}
            {ROLE_LABELS[existing.me.role]} on batch {existing.me.batchNumber}.
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push(`/j/${code}/station`)}
          >
            Continue
          </Button>
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <label htmlFor="name">
          <Label>Your name</Label>
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          required
          autoComplete="name"
          className="h-12 rounded-lg px-3 text-lg ring-1 ring-slate-300"
        />
      </Card>

      <Card className="flex flex-col gap-2">
        <Label>Batch</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {summary.batches.map((b) => (
            <button
              key={b.number}
              type="button"
              onClick={() => setBatch(b.number)}
              aria-pressed={chosenBatch === b.number}
              className={cx(
                "rounded-xl p-3 text-left ring-1",
                chosenBatch === b.number
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white ring-slate-200 hover:ring-slate-400",
              )}
            >
              <div className="font-semibold">Batch {b.number}</div>
              <div className="font-mono text-xs opacity-80">
                {b.firstNewId}–{b.lastNewId}
              </div>
              <div className="text-xs opacity-80">
                {b.finished}/{b.total} done
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <Label>Your role</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLE_INFO.map(({ role: r, icon: Icon, text }) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              aria-pressed={role === r}
              className={cx(
                "flex items-start gap-3 rounded-xl p-4 text-left ring-1",
                role === r
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white ring-slate-200 hover:ring-slate-400",
              )}
            >
              <Icon className="mt-0.5 size-6 shrink-0" />
              <span>
                <span className="block font-semibold">{ROLE_LABELS[r]}</span>
                <span className="text-sm opacity-80">{text}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      {error && <p className="text-red-700">{error}</p>}
      <Button
        type="submit"
        variant="primary"
        size="xl"
        disabled={joining || !role || !name.trim() || !chosenBatch}
      >
        {joining ? "Joining…" : "Start"}
      </Button>
    </form>
  );
}
