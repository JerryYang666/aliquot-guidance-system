import "server-only";

import { asc, eq } from "drizzle-orm";
import writeExcelFile, {
  type Row,
  type Sheet,
} from "write-excel-file/universal";

import type { Db } from "@/lib/db";
import { events, samples, type JobRow } from "@/lib/db/schema";
import { labelFor } from "@/lib/pipeline/labels";
import type { LogEvent, Sample } from "@/lib/pipeline/types";

import { listBatches } from "./jobs";
import { toIso, toLogEvent, toSample } from "./rows";

async function allEvents(db: Db, jobId: string): Promise<LogEvent[]> {
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.jobId, jobId))
    .orderBy(asc(events.id));
  return rows.map(toLogEvent);
}

const LOG_COLUMNS = [
  "Event #",
  "Server time (UTC)",
  "Device time (UTC)",
  "Who",
  "Role",
  "Event",
  "Batch",
  "New ID",
  "Tube",
  "Details",
] as const;

function logRow(e: LogEvent): (string | number | null)[] {
  return [
    e.id,
    e.at,
    e.clientAt,
    e.actorName,
    e.actorRole,
    e.type,
    e.batchNumber,
    e.newId,
    e.newId && e.tube ? labelFor(e.newId, e.tube) : e.tube,
    Object.keys(e.data).length ? JSON.stringify(e.data) : null,
  ];
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  // A leading =, +, - or @ would be run as a formula by spreadsheet apps.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function exportLogCsv(db: Db, job: JobRow): Promise<string> {
  const rows = (await allEvents(db, job.id)).map(logRow);
  return (
    [LOG_COLUMNS, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}

const header = (titles: readonly string[]): Row =>
  titles.map((value) => ({ value, fontWeight: "bold" }));

export interface WorkbookContent {
  destSets: string[];
  batchNumbers: number[];
  /** Every sample of the job, in pull order within each batch. */
  samples: Sample[];
  events: LogEvent[];
}

/** Lays out the export: one sheet per batch, then the full event log. */
export async function renderWorkbook(
  content: WorkbookContent,
): Promise<ArrayBuffer> {
  const tubeColumns = content.destSets.flatMap((set, i) => [
    `${set} (-${i + 1})`,
    `${set} at`,
    `${set} by`,
  ]);
  const batchHeader = header([
    "Pull order",
    "Source box",
    "Shelf / freezer",
    "Source position",
    "Original ID",
    "New ID",
    "Slot",
    "Volume note",
    "Pulled at",
    "Pulled by",
    "Labeled at",
    "Labeled by",
    ...tubeColumns,
    "Finished at",
    "Finished by",
    "Returned at",
    "Returned by",
    "Skipped",
    "Notes",
  ]);

  const sheets: Sheet<Blob>[] = content.batchNumbers.map((number) => ({
    sheet: `Batch ${number}`,
    stickyRowsCount: 1,
    data: [
      batchHeader,
      ...content.samples
        .filter((s) => s.batchNumber === number)
        .map((s): Row => [
          s.pullOrder,
          s.sourceBox,
          s.sourceLocation,
          s.sourcePosition,
          s.originalId,
          s.newId,
          s.slot,
          s.volumeNote,
          s.pulledAt,
          s.pulledBy,
          s.labeledAt,
          s.labeledBy,
          ...s.tubes.flatMap((t) => [t.status, toIso(t.at), t.by]),
          s.finishedAt,
          s.finishedBy,
          s.returnedAt,
          s.returnedBy,
          s.skipRank === null ? null : "yes",
          s.notes.map((n) => `${n.by}: ${n.text}`).join("\n") || null,
        ]),
    ],
  }));
  sheets.push({
    sheet: "Event log",
    stickyRowsCount: 1,
    data: [header(LOG_COLUMNS), ...content.events.map(logRow)],
  });

  return (await writeExcelFile(sheets).toBlob()).arrayBuffer();
}

/** The pull lists with who did what and when, one sheet per batch, plus the full log. */
export async function exportWorkbook(
  db: Db,
  job: JobRow,
): Promise<ArrayBuffer> {
  const rows = await db
    .select()
    .from(samples)
    .where(eq(samples.jobId, job.id))
    .orderBy(asc(samples.batchNumber), asc(samples.pullOrder));
  return renderWorkbook({
    destSets: job.destSets,
    batchNumbers: (await listBatches(db, job.id)).map((b) => b.number),
    samples: rows.map(toSample),
    events: await allEvents(db, job.id),
  });
}
