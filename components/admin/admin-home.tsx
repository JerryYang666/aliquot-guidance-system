"use client";

import {
  Archive,
  ArchiveRestore,
  Copy,
  Eye,
  LogOut,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type {
  AdminInviteResponse,
  AdminJob,
  AdminOverviewResponse,
  AdminPasskey,
} from "@/lib/api-types";
import { signOut } from "@/lib/client/admin-passkeys";
import { api, ApiFailure } from "@/lib/client/api";
import { formatJobCode } from "@/lib/job-code";

import { ProgressBar } from "../station/common";
import { Badge, Button, Card, cx, Label } from "../ui";

const REFRESH_MS = 15_000;

interface Me {
  id: string;
  name: string;
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

const failure = (e: unknown, fallback: string) =>
  e instanceof ApiFailure ? e.message : fallback;

/** "just now", "5 min ago", "3 h ago", then the date. */
function ago(iso: string, now: number): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return day(iso);
}

function JobRow({
  job,
  now,
  onChange,
}: {
  job: AdminJob;
  now: number;
  onChange: () => Promise<void>;
}) {
  const archived = job.archivedAt !== null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Archiving stops new people joining; those already on the job carry on.
  const setArchived = async (to: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/jobs/${job.code}/archive`, {
        method: to ? "POST" : "DELETE",
        retry: false,
      });
      await onChange();
    } catch (e) {
      setError(failure(e, "Could not change the job."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="grid gap-x-6 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cx(
              "truncate font-semibold",
              archived && "text-slate-500",
            )}
          >
            {job.name}
          </span>
          {archived && <Badge>Archived</Badge>}
        </div>
        <div className="text-sm text-slate-500">
          <span className="font-mono">{formatJobCode(job.code)}</span> ·{" "}
          {job.createdBy} · {day(job.createdAt)}
        </div>
      </div>
      <div>
        <ProgressBar
          label={`Aliquoted · ${job.batches} ${job.batches === 1 ? "batch" : "batches"}`}
          value={job.finished}
          total={job.samples}
        />
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <span
            className={cx(
              "size-2 rounded-full",
              job.online ? "bg-emerald-500" : "bg-slate-300",
            )}
          />
          {job.online} online
          {job.lastActivityAt &&
            ` · last activity ${ago(job.lastActivityAt, now)}`}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/jobs/${job.code}`}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Eye className="size-4" /> Watch
        </Link>
        {!archived && (
          <Link
            href={`/j/${job.code}`}
            className="inline-flex h-8 items-center justify-center rounded-lg bg-white px-3 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50"
          >
            Join
          </Link>
        )}
        <Button
          size="sm"
          disabled={busy}
          onClick={() => void setArchived(!archived)}
        >
          {archived ? (
            <>
              <ArchiveRestore className="size-4" /> Unarchive
            </>
          ) : (
            <>
              <Archive className="size-4" /> Archive
            </>
          )}
        </Button>
      </div>
      {error && <p className="text-sm text-red-700 sm:col-span-3">{error}</p>}
    </li>
  );
}

/** Makes an invite link and shows it, counting down, until it expires. */
function Invite() {
  const [invite, setInvite] = useState<{ url: string; until: number } | null>(
    null,
  );
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const left = (until: number) =>
    Math.max(0, Math.ceil((until - Date.now()) / 1000));

  const create = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const made = await api<AdminInviteResponse>("/api/admin/invites", {
        method: "POST",
        retry: false,
      });
      const until = new Date(made.expiresAt).getTime();
      setInvite({ url: `${window.location.origin}${made.path}`, until });
      setSecondsLeft(left(until));
    } catch (e) {
      setError(failure(e, "Could not make a link."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!invite) return;
    const id = setInterval(() => setSecondsLeft(left(invite.until)), 1000);
    return () => clearInterval(id);
  }, [invite]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        An invite link lets one person add a passkey and become an admin. It
        works once and expires after 10 minutes. Send it only to someone who
        should see every job.
      </p>
      {invite && secondsLeft > 0 && (
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="font-mono text-sm break-all">{invite.url}</div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-slate-600">
              Expires in {Math.floor(secondsLeft / 60)}:
              {String(secondsLeft % 60).padStart(2, "0")}
            </span>
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(invite.url)
                  .then(() => setCopied(true));
              }}
            >
              <Copy className="size-4" /> {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
      )}
      {invite && secondsLeft === 0 && (
        <p className="text-sm text-slate-600">That link has expired.</p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div>
        <Button disabled={busy} onClick={() => void create()}>
          <UserPlus className="size-4" />
          {invite ? "Make another link" : "Make an invite link"}
        </Button>
      </div>
    </div>
  );
}

function Passkeys({
  me,
  passkeys,
  onChange,
}: {
  me: Me;
  passkeys: AdminPasskey[];
  onChange: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/passkeys/${id}`, {
        method: "DELETE",
        retry: false,
      });
      setConfirming(null);
      await onChange();
    } catch (e) {
      setError(failure(e, "Could not remove the passkey."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {passkeys.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 py-2"
          >
            <div>
              <div className="flex items-center gap-2 font-medium">
                {p.name}
                {p.id === me.id && <Badge>This passkey</Badge>}
              </div>
              <div className="text-sm text-slate-500">
                Added {day(p.createdAt)}
                {p.invitedBy
                  ? `, invited by ${p.invitedBy}`
                  : ", from a seeded link"}
                {p.lastUsedAt && ` · last signed in ${day(p.lastUsedAt)}`}
              </div>
            </div>
            {p.id !== me.id &&
              (confirming === p.id ? (
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    onClick={() => void remove(p.id)}
                  >
                    Remove {p.name}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirming(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button size="sm" onClick={() => setConfirming(p.id)}>
                  Remove
                </Button>
              ))}
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </>
  );
}

/** The admin page for a signed-in admin: every job, and who the admins are. */
export function AdminHome({ me }: { me: Me }) {
  const router = useRouter();
  const [data, setData] = useState<
    (AdminOverviewResponse & { at: number }) | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<AdminOverviewResponse>("/api/admin/overview", { retry: false }).then(
        (overview) => {
          setData({ ...overview, at: Date.now() });
          setError(null);
        },
        (e: unknown) => {
          // Signed out, or this passkey was removed: back to the sign-in screen.
          if (e instanceof ApiFailure && e.status === 401) router.refresh();
          else setError(failure(e, "Could not load the jobs."));
        },
      ),
    [router],
  );

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-slate-600 underline">
            ← Aliquot Guide
          </Link>
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="text-sm text-slate-600">Signed in as {me.name}</p>
        </div>
        <Button
          onClick={() => {
            void signOut().then(() => router.refresh());
          }}
        >
          <LogOut className="size-4" /> Sign out
        </Button>
      </header>

      {error && <p className="text-red-700">{error}</p>}
      {!data && !error && <p className="text-slate-500">Loading…</p>}

      {data && (
        <>
          <Card>
            <Label>Jobs ({data.jobs.length})</Label>
            {data.jobs.length ? (
              <ul className="divide-y divide-slate-100">
                {data.jobs.map((job) => (
                  <JobRow
                    key={job.code}
                    job={job}
                    now={data.at}
                    onChange={load}
                  />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No jobs yet.</p>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <Label>Admins ({data.passkeys.length})</Label>
            <Passkeys me={me} passkeys={data.passkeys} onChange={load} />
            <Invite />
          </Card>
        </>
      )}
    </main>
  );
}
