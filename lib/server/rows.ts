import type { EventRow, SampleRow } from "@/lib/db/schema";
import type { LogEvent, Sample } from "@/lib/pipeline/types";

/** Postgres timestamp text ("2026-10-08 01:30:46.853191+00") → ISO 8601 (ms). */
export function toIso(value: string): string;
export function toIso(value: string | null): string | null;
export function toIso(value: string | null): string | null {
  if (value === null) return null;
  const d = new Date(
    value.includes("T")
      ? value
      : value.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"),
  );
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

export function toSample(row: SampleRow): Sample {
  return {
    id: row.id,
    batchNumber: row.batchNumber,
    pullOrder: row.pullOrder,
    newId: row.newId,
    originalId: row.originalId,
    sourceBox: row.sourceBox,
    sourceLocation: row.sourceLocation,
    sourcePosition: row.sourcePosition,
    slot: row.slot,
    volumeNote: row.volumeNote,
    pulledAt: toIso(row.pulledAt),
    pulledBy: row.pulledBy,
    labeledAt: toIso(row.labeledAt),
    labeledBy: row.labeledBy,
    finishedAt: toIso(row.finishedAt),
    finishedBy: row.finishedBy,
    returnedAt: toIso(row.returnedAt),
    returnedBy: row.returnedBy,
    skipRank: row.skipRank,
    tubes: row.tubes,
    notes: row.notes,
  };
}

/** The columns an action may change. */
export function sampleUpdate(s: Sample) {
  return {
    pulledAt: s.pulledAt,
    pulledBy: s.pulledBy,
    labeledAt: s.labeledAt,
    labeledBy: s.labeledBy,
    finishedAt: s.finishedAt,
    finishedBy: s.finishedBy,
    returnedAt: s.returnedAt,
    returnedBy: s.returnedBy,
    skipRank: s.skipRank,
    tubes: s.tubes,
    notes: s.notes,
  };
}

export function toLogEvent(row: EventRow): LogEvent {
  return {
    id: row.id,
    version: row.version,
    at: toIso(row.at),
    clientAt: toIso(row.clientAt),
    actorName: row.actorName,
    actorRole: row.actorRole,
    type: row.type as LogEvent["type"],
    batchNumber: row.batchNumber,
    sampleId: row.sampleId,
    newId: row.newId,
    tube: row.tube,
    data: row.data,
  };
}
