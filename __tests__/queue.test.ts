import { describe, expect, it } from "vitest";

import {
  batchProgress,
  isLastFromSourceBox,
  pulledAwaitingLabels,
  queueOrder,
  readyToAliquot,
  toLabel,
  toPull,
  toReturn,
} from "@/lib/pipeline/queue";

import { makeSample, T0, T1 } from "./helpers";

describe("queue order", () => {
  it("follows the pull list, with skipped samples last in skip order", () => {
    const a = makeSample({ pullOrder: 1 });
    const b = makeSample({ pullOrder: 2, skipRank: 2 });
    const c = makeSample({ pullOrder: 3, skipRank: 1 });
    const d = makeSample({ pullOrder: 4 });
    expect(queueOrder([d, c, b, a]).map((s) => s.pullOrder)).toEqual([
      1, 4, 3, 2,
    ]);
  });

  it("gives each role its own next sample", () => {
    const a = makeSample({ pullOrder: 1, pulledAt: T0, labeledAt: T0 });
    const b = makeSample({ pullOrder: 2, pulledAt: T0 });
    const c = makeSample({ pullOrder: 3, labeledAt: T0 });
    const d = makeSample({ pullOrder: 4 });
    const all = [a, b, c, d];
    expect(toPull(all).map((s) => s.pullOrder)).toEqual([3, 4]);
    expect(toLabel(all).map((s) => s.pullOrder)).toEqual([2, 4]);
    expect(readyToAliquot(all).map((s) => s.pullOrder)).toEqual([1]);
  });

  it("lists pulled samples whose labels are not on yet, in queue order", () => {
    const ready = makeSample({ pullOrder: 1, pulledAt: T0, labeledAt: T0 });
    const skipped = makeSample({ pullOrder: 2, pulledAt: T1, skipRank: 1 });
    const pulled = makeSample({ pullOrder: 3, pulledAt: T0 });
    const labeled = makeSample({ pullOrder: 4, labeledAt: T0 });
    const untouched = makeSample({ pullOrder: 5 });
    const done = makeSample({ pullOrder: 6, pulledAt: T0, finishedAt: T1 });
    expect(
      pulledAwaitingLabels([
        done,
        untouched,
        labeled,
        skipped,
        pulled,
        ready,
      ]).map((s) => s.pullOrder),
    ).toEqual([3, 2]);
  });

  it("drops finished samples from every work list", () => {
    const done = makeSample({ finishedAt: T0 });
    expect(toPull([done])).toEqual([]);
    expect(toLabel([done])).toEqual([]);
    expect(readyToAliquot([done])).toEqual([]);
  });

  it("lists finished, pulled, unreturned source tubes oldest first", () => {
    const late = makeSample({ pulledAt: T0, finishedAt: T1 });
    const early = makeSample({ pulledAt: T0, finishedAt: T0 });
    const neverPulled = makeSample({ finishedAt: T0 });
    const returned = makeSample({
      pulledAt: T0,
      finishedAt: T0,
      returnedAt: T1,
    });
    expect(toReturn([late, early, neverPulled, returned])).toEqual([
      early,
      late,
    ]);
  });

  it("knows when a source box has nothing left to pull", () => {
    const a = makeSample({ sourceBox: "AIP Box 4", pulledAt: T0 });
    const b = makeSample({ sourceBox: "AIP Box 4" });
    const c = makeSample({ sourceBox: "NIP Box 1" });
    expect(isLastFromSourceBox(b, [a, b, c])).toBe(true);
    expect(isLastFromSourceBox(a, [a, b, c])).toBe(false);
  });

  it("counts progress", () => {
    const a = makeSample({
      pulledAt: T0,
      labeledAt: T0,
      finishedAt: T0,
      tubes: [
        { status: "placed", at: T0, by: "x" },
        { status: "placed", at: T0, by: "x" },
        { status: "not_filled", at: T0, by: "x" },
      ],
    });
    expect(batchProgress([a, makeSample()])).toEqual({
      total: 2,
      pulled: 1,
      labeled: 1,
      finished: 1,
      returned: 0,
      tubesPlaced: 2,
      tubesNotFilled: 1,
    });
  });
});
