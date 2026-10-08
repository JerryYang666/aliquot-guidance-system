/**
 * The job data a workbook yields, validated the same way whether it comes
 * from the upload parser or from a client posting it to create a job.
 */
import { z } from "zod";

const text = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(200).nullable();

export const parsedSampleSchema = z.object({
  pullOrder: z.number().int().min(1),
  newId: text,
  originalId: text,
  sourceBox: text,
  sourceLocation: optionalText,
  sourcePosition: optionalText,
  slot: text,
  volumeNote: optionalText,
});

export const parsedBatchSchema = z.object({
  number: z.number().int().min(1).max(10_000),
  boxNumber: z.number().int().min(1).max(10_000),
  samples: z.array(parsedSampleSchema).min(1).max(1_000),
});

export const parsedWorkbookSchema = z.object({
  destSets: z.array(z.string().trim().min(1).max(40)).min(1).max(9),
  batches: z.array(parsedBatchSchema).min(1).max(500),
});

export type ParsedSample = z.infer<typeof parsedSampleSchema>;
export type ParsedBatch = z.infer<typeof parsedBatchSchema>;
export type ParsedWorkbook = z.infer<typeof parsedWorkbookSchema>;

export const DEFAULT_DEST_SETS = ["Ship", "Keep2", "Keep3"];
export const MAX_SAMPLES_PER_JOB = 20_000;

export interface WorkbookCheck {
  errors: string[];
  warnings: string[];
}

/**
 * Scanned labels are compared uppercased, so new IDs and slots are stored
 * uppercased too.
 */
export function normalizeWorkbook(wb: ParsedWorkbook): ParsedWorkbook {
  return {
    destSets: wb.destSets.map((d) => d.trim()),
    batches: wb.batches.map((b) => ({
      ...b,
      samples: b.samples.map((s) => ({
        ...s,
        newId: s.newId.trim().toUpperCase(),
        slot: s.slot.trim().toUpperCase(),
      })),
    })),
  };
}

/** Rules a job's data must meet beyond its shape. */
export function checkWorkbook(wb: ParsedWorkbook): WorkbookCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  const total = wb.batches.reduce((n, b) => n + b.samples.length, 0);
  if (total > MAX_SAMPLES_PER_JOB) {
    errors.push(
      `The workbook has ${total} samples; a job holds at most ${MAX_SAMPLES_PER_JOB}.`,
    );
  }

  const batchNumbers = new Set<number>();
  const newIds = new Map<string, number>();
  const originalIds = new Map<string, number>();
  const destNames = new Set(wb.destSets.map((d) => d.toLowerCase()));
  if (destNames.size !== wb.destSets.length)
    errors.push("Destination set names must differ.");

  for (const batch of wb.batches) {
    if (batchNumbers.has(batch.number))
      errors.push(`Batch ${batch.number} appears twice.`);
    batchNumbers.add(batch.number);

    const slots = new Set<string>();
    const orders = new Set<number>();
    for (const s of batch.samples) {
      const key = s.newId.toUpperCase();
      const seenIn = newIds.get(key);
      if (seenIn !== undefined) {
        errors.push(
          `New ID ${s.newId} appears twice (batch ${seenIn} and batch ${batch.number}).`,
        );
      }
      newIds.set(key, batch.number);

      const original = originalIds.get(s.originalId);
      if (original !== undefined) {
        warnings.push(
          `Original ID ${s.originalId} appears twice (batch ${original} and batch ${batch.number}).`,
        );
      }
      originalIds.set(s.originalId, batch.number);

      const slot = s.slot.toUpperCase();
      if (slots.has(slot))
        errors.push(`Batch ${batch.number}: slot ${s.slot} is used twice.`);
      slots.add(slot);
      if (!/^[A-Z]\d{1,2}$/.test(slot)) {
        warnings.push(
          `Batch ${batch.number}: slot "${s.slot}" (${s.newId}) is not like "A1".`,
        );
      }
      if (orders.has(s.pullOrder))
        errors.push(`Batch ${batch.number}: duplicate pull order.`);
      orders.add(s.pullOrder);
      if (/\s/.test(s.newId))
        errors.push(`New ID "${s.newId}" contains a space.`);
      // Tube labels are "<new ID>-<n>"; a new ID shaped like that would be ambiguous.
      if (/-\d+$/.test(s.newId)) {
        errors.push(
          `New ID ${s.newId} ends in "-<number>", which tube labels use.`,
        );
      }
    }
  }
  return { errors, warnings };
}

export interface BatchSummary {
  number: number;
  boxNumber: number;
  samples: number;
  firstNewId: string;
  lastNewId: string;
  lowVolume: number;
  sourceBoxes: number;
}

export function summarizeBatch(batch: ParsedBatch): BatchSummary {
  const byNewId = [...batch.samples].sort((a, b) =>
    a.newId.localeCompare(b.newId),
  );
  return {
    number: batch.number,
    boxNumber: batch.boxNumber,
    samples: batch.samples.length,
    firstNewId: byNewId[0]?.newId ?? "",
    lastNewId: byNewId[byNewId.length - 1]?.newId ?? "",
    lowVolume: batch.samples.filter((s) => s.volumeNote).length,
    sourceBoxes: new Set(batch.samples.map((s) => s.sourceBox)).size,
  };
}
