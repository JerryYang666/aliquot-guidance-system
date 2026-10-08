"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
} from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import type { CreateJobResponse, ParseResponse } from "@/lib/api-types";
import { api, ApiFailure } from "@/lib/client/api";
import { rememberedName } from "@/lib/client/session";
import { formatJobCode } from "@/lib/job-code";

import { JoinQr } from "../join-qr";
import { Button, Card, cx, Label, setColor } from "../ui";

function Created({ code }: { code: string }) {
  const url = `${window.location.origin}/j/${code}`;
  const [copied, setCopied] = useState(false);
  return (
    <Card className="flex flex-col items-center gap-4 p-8 text-center">
      <CheckCircle2 className="size-10 text-emerald-600" />
      <div>
        <Label>Job code</Label>
        <div className="font-mono text-5xl font-bold tracking-widest">
          {formatJobCode(code)}
        </div>
      </div>
      <JoinQr url={url} />
      <p className="max-w-sm text-sm text-slate-600">
        Operators enter this code on the home page, or scan the QR code with
        their phone camera. Anyone with the code can join, so share it only with
        the team.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          onClick={() => {
            void navigator.clipboard
              ?.writeText(url)
              .then(() => setCopied(true));
          }}
        >
          <Copy className="size-4" />{" "}
          {copied ? "Link copied" : "Copy join link"}
        </Button>
        <Link
          href={`/j/${code}`}
          className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
        >
          Join this job
        </Link>
      </div>
    </Card>
  );
}

export function CreateJob() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParseResponse | null>(null);
  const [name, setName] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [destSets, setDestSets] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const upload = async (f: File) => {
    setFile(f);
    setPreview(null);
    setError(null);
    setWorking(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const r = await api<ParseResponse>("/api/workbook/parse", { body: form });
      setPreview(r);
      setDestSets(r.workbook?.destSets ?? []);
      setName(
        (n) => n || f.name.replace(/\.xlsx?$/i, "").replace(/[_-]+/g, " "),
      );
      setCreatedBy((c) => c || rememberedName());
    } catch (e) {
      setError(
        e instanceof ApiFailure ? e.message : "Could not read the file.",
      );
    } finally {
      setWorking(false);
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!preview?.workbook) return;
    setWorking(true);
    setError(null);
    try {
      const r = await api<CreateJobResponse>("/api/jobs", {
        body: {
          name: name.trim(),
          createdBy: createdBy.trim(),
          sourceFilename: file?.name ?? null,
          workbook: {
            ...preview.workbook,
            destSets: destSets.map((d) => d.trim()),
          },
        },
      });
      setCode(r.code);
    } catch (e) {
      setError(
        e instanceof ApiFailure ? e.message : "Could not create the job.",
      );
    } finally {
      setWorking(false);
    }
  };

  if (code) return <Created code={code} />;

  const totals = preview?.summary.reduce(
    (t, b) => ({ samples: t.samples + b.samples, low: t.low + b.lowVolume }),
    { samples: 0, low: 0 },
  );

  return (
    <form onSubmit={create} className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Create a job</h1>

      <Card className="flex flex-col gap-3">
        <Label>1 · Workbook</Label>
        <p className="text-sm text-slate-600">
          An .xlsx with one pull-list sheet per batch (columns Source box, Shelf
          / freezer, Source position, Original ID, Put in slot, New ID, Volume
          note), sheets named like &ldquo;B01_pull&rdquo;. An overview sheet
          with a &ldquo;Boxes to fill&rdquo; column sets the box names and
          numbers.
        </p>
        <label
          className={cx(
            "flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-5",
            file
              ? "border-slate-300"
              : "border-slate-400 hover:border-slate-600",
          )}
        >
          <FileSpreadsheet className="size-8 text-slate-500" />
          <span className="flex-1">
            {file ? (
              <span className="font-medium">{file.name}</span>
            ) : (
              <span className="text-slate-600">Choose a workbook…</span>
            )}
          </span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </label>
        {working && !preview && (
          <p className="text-sm text-slate-500">Reading…</p>
        )}
      </Card>

      {preview && (
        <Card className="flex flex-col gap-3">
          <Label>2 · Check what was read</Label>
          {preview.errors.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {preview.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {preview.warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {preview.warnings.map((w) => (
                <li key={w} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {w}
                </li>
              ))}
            </ul>
          )}
          {preview.summary.length > 0 && totals && (
            <>
              <p className="text-sm">
                {preview.summary.length} batches, {totals.samples} samples,{" "}
                {totals.low} with a volume note.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-1 pr-4 font-medium">Batch</th>
                      <th className="py-1 pr-4 font-medium">New IDs</th>
                      <th className="py-1 pr-4 font-medium">Samples</th>
                      <th className="py-1 pr-4 font-medium">Box no.</th>
                      <th className="py-1 pr-4 font-medium">Source boxes</th>
                      <th className="py-1 font-medium">Volume notes</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {preview.summary.map((b) => (
                      <tr key={b.number} className="border-t border-slate-100">
                        <td className="py-1 pr-4">{b.number}</td>
                        <td className="py-1 pr-4">
                          {b.firstNewId}–{b.lastNewId}
                        </td>
                        <td className="py-1 pr-4">{b.samples}</td>
                        <td className="py-1 pr-4">{b.boxNumber}</td>
                        <td className="py-1 pr-4">{b.sourceBoxes}</td>
                        <td className="py-1">{b.lowVolume || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      {preview?.workbook && (
        <Card className="flex flex-col gap-4">
          <Label>3 · Name it</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Job name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
                className="h-10 rounded-lg px-3 ring-1 ring-slate-300"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Your name
              <input
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                required
                maxLength={60}
                className="h-10 rounded-lg px-3 ring-1 ring-slate-300"
              />
            </label>
          </div>
          <div>
            <div className="text-sm">
              Destination box sets (tube -1, -2, -3 go to)
            </div>
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              {destSets.map((d, i) => (
                <label key={i} className="flex items-center gap-2">
                  <span
                    className={cx(
                      "rounded-md px-2 py-1 font-mono text-sm font-bold",
                      setColor(i + 1).solid,
                    )}
                  >
                    -{i + 1}
                  </span>
                  <input
                    aria-label={`Set for tube -${i + 1}`}
                    value={d}
                    onChange={(e) =>
                      setDestSets((all) =>
                        all.map((x, j) => (j === i ? e.target.value : x)),
                      )
                    }
                    required
                    maxLength={40}
                    className="h-10 min-w-0 flex-1 rounded-lg px-3 ring-1 ring-slate-300"
                  />
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-red-700">{error}</p>}
          <Button
            type="submit"
            variant="primary"
            size="xl"
            disabled={working || !name.trim() || !createdBy.trim()}
          >
            {working ? "Creating…" : "Create job"}
          </Button>
        </Card>
      )}
      {!preview?.workbook && error && <p className="text-red-700">{error}</p>}
    </form>
  );
}
