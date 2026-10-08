import { describe, expect, it } from "vitest";

import {
  applyPlacement,
  applySampleAction,
  decideScan,
  type ScanInput,
} from "@/lib/pipeline/actions";
import { parseLabel } from "@/lib/pipeline/labels";
import type { Sample } from "@/lib/pipeline/types";

import { makeSample, T0, T1 } from "./helpers";

const ctx = { now: T1, actor: "Ana", nextSkipRank: 7 };
const placeCtx = {
  now: T1,
  actor: "Ana",
  destSets: ["Ship", "Keep2", "Keep3"],
  boxNumber: 1,
};

function ok(result: ReturnType<typeof applySampleAction>) {
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

function errorCode(result: ReturnType<typeof applySampleAction>) {
  return result.ok ? null : result.error.code;
}

const placed = (by = "Bo") => ({ status: "placed" as const, at: T0, by });

describe("puller and labeler actions", () => {
  it("pulls once, and logs who", () => {
    const r = ok(
      applySampleAction(makeSample(), { type: "pull", sampleId: "x" }, ctx),
    );
    expect(r.sample.pulledAt).toBe(T1);
    expect(r.sample.pulledBy).toBe("Ana");
    expect(r.events.map((e) => e.type)).toEqual(["sample_pulled"]);
    expect(
      errorCode(
        applySampleAction(r.sample, { type: "pull", sampleId: "x" }, ctx),
      ),
    ).toBe("already_pulled");
  });

  it("undoes a pull or label only before any tube is placed", () => {
    const s = makeSample({
      pulledAt: T0,
      pulledBy: "Bo",
      labeledAt: T0,
      labeledBy: "Cy",
    });
    const undone = ok(
      applySampleAction(s, { type: "undo_pull", sampleId: "x" }, ctx),
    );
    expect(undone.sample.pulledAt).toBeNull();
    expect(undone.events[0]?.data).toEqual({
      previousAt: T0,
      previousBy: "Bo",
    });

    const started = { ...s, tubes: [placed(), ...s.tubes.slice(1)] };
    expect(
      errorCode(
        applySampleAction(started, { type: "undo_pull", sampleId: "x" }, ctx),
      ),
    ).toBe("aliquot_started");
    expect(
      errorCode(
        applySampleAction(started, { type: "undo_label", sampleId: "x" }, ctx),
      ),
    ).toBe("aliquot_started");
  });

  it("skips to the end of the queue with the next rank", () => {
    const r = ok(
      applySampleAction(makeSample(), { type: "skip", sampleId: "x" }, ctx),
    );
    expect(r.sample.skipRank).toBe(7);
  });
});

describe("aliquoter actions", () => {
  it("finishes a sample, marking unscanned tubes not filled, with a note", () => {
    const s = makeSample({ pulledAt: T0, labeledAt: T0 });
    s.tubes[0] = placed();
    const r = ok(
      applySampleAction(
        s,
        { type: "finish", sampleId: "x", note: "  Very low volume  " },
        ctx,
      ),
    );
    expect(r.sample.finishedAt).toBe(T1);
    expect(r.sample.tubes.map((t) => t.status)).toEqual([
      "placed",
      "not_filled",
      "not_filled",
    ]);
    expect(r.sample.notes).toEqual([
      { at: T1, by: "Ana", text: "Very low volume" },
    ]);
    expect(r.events.map((e) => e.type)).toEqual([
      "sample_finished",
      "note_added",
    ]);
    expect(r.events[0]?.data).toEqual({ auto: false, notFilled: [2, 3] });
  });

  it("reopens a finished sample, returning not-filled tubes to pending", () => {
    const s = makeSample({ finishedAt: T0 });
    s.tubes = [placed(), { status: "not_filled", at: T0, by: "Bo" }, placed()];
    const r = ok(applySampleAction(s, { type: "reopen", sampleId: "x" }, ctx));
    expect(r.sample.finishedAt).toBeNull();
    expect(r.sample.tubes.map((t) => t.status)).toEqual([
      "placed",
      "pending",
      "placed",
    ]);
  });

  it("undoing a placed tube reopens a finished sample", () => {
    const s = makeSample({
      finishedAt: T0,
      tubes: [placed(), placed(), placed()],
    });
    const r = ok(
      applySampleAction(s, { type: "undo_tube", sampleId: "x", tube: 2 }, ctx),
    );
    expect(r.sample.tubes[1]?.status).toBe("pending");
    expect(r.sample.finishedAt).toBeNull();
    expect(r.events[0]).toMatchObject({
      type: "tube_undone",
      tube: 2,
      data: { reopened: true },
    });
  });

  it("refuses to change a returned sample until the return is undone", () => {
    const s = makeSample({
      pulledAt: T0,
      finishedAt: T0,
      returnedAt: T0,
      tubes: [placed()],
    });
    expect(
      errorCode(applySampleAction(s, { type: "reopen", sampleId: "x" }, ctx)),
    ).toBe("returned");
    expect(
      errorCode(
        applySampleAction(
          s,
          { type: "undo_tube", sampleId: "x", tube: 1 },
          ctx,
        ),
      ),
    ).toBe("returned");
  });
});

describe("returns", () => {
  it("needs the sample pulled and finished", () => {
    expect(
      errorCode(
        applySampleAction(makeSample(), { type: "return", sampleId: "x" }, ctx),
      ),
    ).toBe("not_pulled");
    expect(
      errorCode(
        applySampleAction(
          makeSample({ pulledAt: T0 }),
          { type: "return", sampleId: "x" },
          ctx,
        ),
      ),
    ).toBe("not_finished");
    const r = ok(
      applySampleAction(
        makeSample({ pulledAt: T0, finishedAt: T0 }),
        { type: "return", sampleId: "x" },
        ctx,
      ),
    );
    expect(r.sample.returnedBy).toBe("Ana");
  });
});

describe("notes", () => {
  it("rejects empty notes", () => {
    expect(
      errorCode(
        applySampleAction(
          makeSample(),
          { type: "note", sampleId: "x", text: "  " },
          ctx,
        ),
      ),
    ).toBe("empty_note");
  });
});

describe("scan decisions", () => {
  const current = makeSample({
    newId: "S0066",
    originalId: "41540",
    pulledAt: T0,
    labeledAt: T0,
  });
  const other = makeSample({ newId: "S0067", pulledAt: T0, labeledAt: T0 });
  const byNewId: Record<string, Sample> = { S0066: current, S0067: other };

  function scan(label: string, overrides: Partial<ScanInput> = {}) {
    const parsed = parseLabel(label);
    return decideScan({
      label,
      parsed,
      labelSample: parsed ? (byNewId[parsed.newId] ?? null) : null,
      currentSample: current,
      batchNumber: 1,
      destCount: 3,
      ...overrides,
    });
  }

  it("places a tube of the current sample", () => {
    expect(scan("S0066-2")).toMatchObject({
      kind: "place",
      tube: 2,
      sample: { newId: "S0066" },
    });
  });

  it("rejects a tube of another sample, naming the current one", () => {
    const d = scan("S0067-1");
    expect(d).toMatchObject({ kind: "reject", reason: "wrong_sample" });
    expect(d.kind === "reject" && d.message).toContain("S0066 (41540)");
  });

  it("accepts any unfinished sample's tube when the aliquoter is waiting", () => {
    expect(scan("S0067-1", { currentSample: null })).toMatchObject({
      kind: "place",
    });
  });

  it("repeats rather than rejects an already placed tube, even of another sample", () => {
    const done = { ...other, tubes: [placed(), ...other.tubes.slice(1)] };
    expect(scan("S0067-1", { labelSample: done })).toMatchObject({
      kind: "repeat",
      tube: 1,
    });
  });

  it("rejects unreadable, unknown, out-of-range and other-batch labels", () => {
    expect(scan("hello")).toMatchObject({
      kind: "reject",
      reason: "unreadable",
    });
    expect(scan("S9999-1")).toMatchObject({
      kind: "reject",
      reason: "unknown",
    });
    expect(scan("S0066-4")).toMatchObject({
      kind: "reject",
      reason: "bad_tube",
    });
    expect(scan("S0066-1", { batchNumber: 2 })).toMatchObject({
      kind: "reject",
      reason: "other_batch",
    });
  });

  it("treats a current sample finished elsewhere as waiting", () => {
    expect(
      scan("S0067-1", { currentSample: { ...current, finishedAt: T0 } }),
    ).toMatchObject({ kind: "place" });
  });
});

describe("placing tubes", () => {
  it("logs the destination and finishes the sample on its last tube", () => {
    let s = makeSample({ slot: "G6", pulledAt: T0, labeledAt: T0 });
    s = applyPlacement(s, 1, placeCtx).sample;
    s = applyPlacement(s, 3, placeCtx).sample;
    const last = applyPlacement(s, 2, placeCtx);
    expect(last.sample.finishedAt).toBe(T1);
    expect(last.events.map((e) => e.type)).toEqual([
      "tube_placed",
      "sample_finished",
    ]);
    expect(last.events[0]?.data).toMatchObject({
      set: "Keep2",
      box: 1,
      slot: "G6",
    });
  });

  it("records a missed pull or label as implied by the scan", () => {
    const r = applyPlacement(makeSample(), 1, placeCtx);
    expect(r.sample.pulledBy).toBe("Ana");
    expect(r.events.map((e) => e.type)).toEqual([
      "sample_pulled",
      "sample_labeled",
      "tube_placed",
    ]);
    expect(r.events[0]?.data).toEqual({ impliedByScan: true });
  });

  it("keeps a finished sample finished when a not-filled tube is scanned after all", () => {
    const s = makeSample({ pulledAt: T0, labeledAt: T0, finishedAt: T0 });
    s.tubes = [placed(), placed(), { status: "not_filled", at: T0, by: "Bo" }];
    const r = applyPlacement(s, 3, placeCtx);
    expect(r.sample.finishedAt).toBe(T0);
    expect(r.events.map((e) => e.type)).toEqual(["tube_placed"]);
    expect(r.events[0]?.data).toMatchObject({ wasNotFilled: true });
  });
});
