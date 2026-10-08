import type { Sample } from "@/lib/pipeline/types";

let counter = 0;

export function makeSample(overrides: Partial<Sample> = {}): Sample {
  counter++;
  const n = String(counter).padStart(4, "0");
  return {
    id: `id-${n}`,
    batchNumber: 1,
    pullOrder: counter,
    newId: `S${n}`,
    originalId: String(40000 + counter),
    sourceBox: "case_box 1",
    sourceLocation: "case box",
    sourcePosition: "1-A-1",
    slot: "A1",
    volumeNote: null,
    pulledAt: null,
    pulledBy: null,
    labeledAt: null,
    labeledBy: null,
    finishedAt: null,
    finishedBy: null,
    returnedAt: null,
    returnedBy: null,
    skipRank: null,
    tubes: [1, 2, 3].map(() => ({
      status: "pending" as const,
      at: null,
      by: null,
    })),
    notes: [],
    ...overrides,
  };
}

export const T0 = "2026-10-08T10:00:00.000Z";
export const T1 = "2026-10-08T10:01:00.000Z";
