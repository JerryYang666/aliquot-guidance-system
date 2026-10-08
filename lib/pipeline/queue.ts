import type { Sample } from "./types";

/**
 * Pull-list order, except that skipped samples go to the end in the order
 * they were skipped. Every role's "next" follows this order.
 */
export function queueOrder(samples: readonly Sample[]): Sample[] {
  return [...samples].sort((a, b) => {
    const aSkipped = a.skipRank !== null;
    const bSkipped = b.skipRank !== null;
    if (aSkipped !== bSkipped) return aSkipped ? 1 : -1;
    if (aSkipped && bSkipped) return (a.skipRank ?? 0) - (b.skipRank ?? 0);
    return a.pullOrder - b.pullOrder;
  });
}

export const isFinished = (s: Sample) => s.finishedAt !== null;
export const isPulled = (s: Sample) => s.pulledAt !== null;
export const isLabeled = (s: Sample) => s.labeledAt !== null;
export const isReady = (s: Sample) =>
  isPulled(s) && isLabeled(s) && !isFinished(s);
export const hasPlacedTube = (s: Sample) =>
  s.tubes.some((t) => t.status === "placed");

export function toPull(samples: readonly Sample[]): Sample[] {
  return queueOrder(samples).filter((s) => !isPulled(s) && !isFinished(s));
}

export function toLabel(samples: readonly Sample[]): Sample[] {
  return queueOrder(samples).filter((s) => !isLabeled(s) && !isFinished(s));
}

/** Pulled and labeled, waiting for (or under) the aliquoter. */
export function readyToAliquot(samples: readonly Sample[]): Sample[] {
  return queueOrder(samples).filter(isReady);
}

/**
 * Pulled, but its new tubes are not labeled yet. The source tube may already
 * be on the aliquoter's bench, ahead of the labels.
 */
export function pulledAwaitingLabels(samples: readonly Sample[]): Sample[] {
  return queueOrder(samples).filter(
    (s) => isPulled(s) && !isLabeled(s) && !isFinished(s),
  );
}

/** Finished source tubes still out of the freezer, oldest first. */
export function toReturn(samples: readonly Sample[]): Sample[] {
  return samples
    .filter((s) => isPulled(s) && isFinished(s) && s.returnedAt === null)
    .sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""));
}

/** True when no other tube in this batch still has to come out of the sample's source box. */
export function isLastFromSourceBox(
  sample: Sample,
  samples: readonly Sample[],
): boolean {
  return !samples.some(
    (s) =>
      s.id !== sample.id &&
      s.sourceBox === sample.sourceBox &&
      !isPulled(s) &&
      !isFinished(s),
  );
}

export interface BatchProgress {
  total: number;
  pulled: number;
  labeled: number;
  finished: number;
  returned: number;
  tubesPlaced: number;
  tubesNotFilled: number;
}

export function batchProgress(samples: readonly Sample[]): BatchProgress {
  const p: BatchProgress = {
    total: samples.length,
    pulled: 0,
    labeled: 0,
    finished: 0,
    returned: 0,
    tubesPlaced: 0,
    tubesNotFilled: 0,
  };
  for (const s of samples) {
    if (isPulled(s)) p.pulled++;
    if (isLabeled(s)) p.labeled++;
    if (isFinished(s)) p.finished++;
    if (s.returnedAt) p.returned++;
    for (const t of s.tubes) {
      if (t.status === "placed") p.tubesPlaced++;
      else if (t.status === "not_filled") p.tubesNotFilled++;
    }
  }
  return p;
}
