/**
 * What each action does to a sample, as pure functions. The actions API runs
 * these inside the transaction that holds the job lock; the aliquoter's phone
 * runs `decideScan` locally to show the destination before the server answers.
 */
import { describeDestination, destinationFor } from "./destination";
import { labelFor, normalizeLabel, type ParsedLabel } from "./labels";
import { hasPlacedTube, isFinished } from "./queue";
import type { EventDraft, Sample, TubeState } from "./types";

export type SampleAction =
  | { type: "pull"; sampleId: string }
  | { type: "undo_pull"; sampleId: string }
  | { type: "label"; sampleId: string }
  | { type: "undo_label"; sampleId: string }
  | { type: "skip"; sampleId: string }
  | { type: "finish"; sampleId: string; note?: string }
  | { type: "reopen"; sampleId: string }
  | { type: "undo_tube"; sampleId: string; tube: number }
  | { type: "return"; sampleId: string }
  | { type: "undo_return"; sampleId: string }
  | { type: "note"; sampleId: string; text: string };

export interface ScanAction {
  type: "scan";
  label: string;
  /** The sample the aliquoter's screen shows as current, or null when waiting. */
  currentSampleId: string | null;
  batchNumber: number;
}

export type Action = SampleAction | ScanAction;

export interface ActionError {
  code: string;
  message: string;
}

export interface ActionContext {
  now: string;
  actor: string;
}

export type SampleResult =
  | { ok: true; sample: Sample; events: EventDraft[] }
  | { ok: false; error: ActionError };

export const MAX_NOTE_LENGTH = 500;

function fail(code: string, message: string): SampleResult {
  return { ok: false, error: { code, message } };
}

function sampleEvent(
  sample: Sample,
  type: EventDraft["type"],
  data?: Record<string, unknown>,
  tube?: number,
): EventDraft {
  return {
    type,
    batchNumber: sample.batchNumber,
    sampleId: sample.id,
    newId: sample.newId,
    tube: tube ?? null,
    data: data ?? {},
  };
}

function by(name: string | null, at: string | null): string {
  return name && at ? ` by ${name}` : "";
}

/**
 * Applies a non-scan action. `nextSkipRank` is one more than the highest skip
 * rank in the sample's batch; only `skip` uses it.
 */
export function applySampleAction(
  sample: Sample,
  action: SampleAction,
  ctx: ActionContext & { nextSkipRank: number },
): SampleResult {
  const { now, actor } = ctx;
  const s = { ...sample, tubes: sample.tubes.map((t) => ({ ...t })) };
  const id = sample.newId;

  switch (action.type) {
    case "pull":
      if (s.pulledAt)
        return fail(
          "already_pulled",
          `${id} is already pulled${by(s.pulledBy, s.pulledAt)}.`,
        );
      if (isFinished(s)) return fail("finished", `${id} is already finished.`);
      s.pulledAt = now;
      s.pulledBy = actor;
      return { ok: true, sample: s, events: [sampleEvent(s, "sample_pulled")] };

    case "undo_pull": {
      if (!s.pulledAt) return fail("not_pulled", `${id} is not pulled.`);
      if (isFinished(s) || hasPlacedTube(s))
        return fail(
          "aliquot_started",
          `${id} already has tubes placed; undo those first.`,
        );
      const previous = { previousAt: s.pulledAt, previousBy: s.pulledBy };
      s.pulledAt = null;
      s.pulledBy = null;
      return {
        ok: true,
        sample: s,
        events: [sampleEvent(s, "sample_pull_undone", previous)],
      };
    }

    case "label":
      if (s.labeledAt)
        return fail(
          "already_labeled",
          `${id} is already labeled${by(s.labeledBy, s.labeledAt)}.`,
        );
      if (isFinished(s)) return fail("finished", `${id} is already finished.`);
      s.labeledAt = now;
      s.labeledBy = actor;
      return {
        ok: true,
        sample: s,
        events: [sampleEvent(s, "sample_labeled")],
      };

    case "undo_label": {
      if (!s.labeledAt) return fail("not_labeled", `${id} is not labeled.`);
      if (isFinished(s) || hasPlacedTube(s))
        return fail(
          "aliquot_started",
          `${id} already has tubes placed; undo those first.`,
        );
      const previous = { previousAt: s.labeledAt, previousBy: s.labeledBy };
      s.labeledAt = null;
      s.labeledBy = null;
      return {
        ok: true,
        sample: s,
        events: [sampleEvent(s, "sample_label_undone", previous)],
      };
    }

    case "skip":
      if (isFinished(s)) return fail("finished", `${id} is already finished.`);
      s.skipRank = ctx.nextSkipRank;
      return {
        ok: true,
        sample: s,
        events: [sampleEvent(s, "sample_skipped", { rank: s.skipRank })],
      };

    case "finish": {
      if (isFinished(s)) return fail("finished", `${id} is already finished.`);
      const notFilled: number[] = [];
      s.tubes = s.tubes.map((t, i) => {
        if (t.status !== "pending") return t;
        notFilled.push(i + 1);
        return { status: "not_filled", at: now, by: actor };
      });
      s.finishedAt = now;
      s.finishedBy = actor;
      const events = [
        sampleEvent(s, "sample_finished", { auto: false, notFilled }),
      ];
      const text = action.note?.trim();
      if (text) {
        s.notes = [
          ...s.notes,
          { at: now, by: actor, text: text.slice(0, MAX_NOTE_LENGTH) },
        ];
        events.push(
          sampleEvent(s, "note_added", {
            text: text.slice(0, MAX_NOTE_LENGTH),
          }),
        );
      }
      return { ok: true, sample: s, events };
    }

    case "reopen": {
      if (!isFinished(s)) return fail("not_finished", `${id} is not finished.`);
      if (s.returnedAt)
        return fail(
          "returned",
          `${id} is already returned; undo the return first.`,
        );
      const refilled: number[] = [];
      s.tubes = s.tubes.map((t, i) => {
        if (t.status !== "not_filled") return t;
        refilled.push(i + 1);
        return { status: "pending", at: null, by: null };
      });
      const previous = {
        previousAt: s.finishedAt,
        previousBy: s.finishedBy,
        refilled,
      };
      s.finishedAt = null;
      s.finishedBy = null;
      return {
        ok: true,
        sample: s,
        events: [sampleEvent(s, "sample_reopened", previous)],
      };
    }

    case "undo_tube": {
      const tube = s.tubes[action.tube - 1];
      if (!tube) return fail("bad_tube", `${id} has no tube ${action.tube}.`);
      if (tube.status === "pending")
        return fail(
          "tube_pending",
          `${labelFor(id, action.tube)} is not placed.`,
        );
      if (s.returnedAt)
        return fail(
          "returned",
          `${id} is already returned; undo the return first.`,
        );
      const previous: Record<string, unknown> = {
        previousStatus: tube.status,
        previousAt: tube.at,
      };
      s.tubes[action.tube - 1] = { status: "pending", at: null, by: null };
      if (s.finishedAt) {
        previous.reopened = true;
        s.finishedAt = null;
        s.finishedBy = null;
      }
      return {
        ok: true,
        sample: s,
        events: [sampleEvent(s, "tube_undone", previous, action.tube)],
      };
    }

    case "return":
      if (!s.pulledAt) return fail("not_pulled", `${id} was never pulled.`);
      if (!isFinished(s))
        return fail("not_finished", `${id} is not finished yet.`);
      if (s.returnedAt)
        return fail(
          "already_returned",
          `${id} is already returned${by(s.returnedBy, s.returnedAt)}.`,
        );
      s.returnedAt = now;
      s.returnedBy = actor;
      return {
        ok: true,
        sample: s,
        events: [
          sampleEvent(s, "sample_returned", {
            sourceBox: s.sourceBox,
            position: s.sourcePosition,
          }),
        ],
      };

    case "undo_return": {
      if (!s.returnedAt) return fail("not_returned", `${id} is not returned.`);
      const previous = { previousAt: s.returnedAt, previousBy: s.returnedBy };
      s.returnedAt = null;
      s.returnedBy = null;
      return {
        ok: true,
        sample: s,
        events: [sampleEvent(s, "sample_return_undone", previous)],
      };
    }

    case "note": {
      const text = action.text.trim().slice(0, MAX_NOTE_LENGTH);
      if (!text) return fail("empty_note", "The note is empty.");
      s.notes = [...s.notes, { at: now, by: actor, text }];
      return {
        ok: true,
        sample: s,
        events: [sampleEvent(s, "note_added", { text })],
      };
    }
  }
}

export type ScanRejectReason =
  "unreadable" | "unknown" | "bad_tube" | "other_batch" | "wrong_sample";

export type ScanDecision =
  | { kind: "reject"; reason: ScanRejectReason; message: string }
  | { kind: "repeat"; sample: Sample; tube: number }
  | { kind: "place"; sample: Sample; tube: number };

export interface ScanInput {
  label: string;
  parsed: ParsedLabel | null;
  /** The sample whose new ID the label carries, or null when the job has none. */
  labelSample: Sample | null;
  /** The aliquoter's current sample, or null when waiting. */
  currentSample: Sample | null;
  batchNumber: number;
  destCount: number;
}

/** The scan rules from docs/design.md ("What a scan does"). */
export function decideScan(input: ScanInput): ScanDecision {
  const { parsed, labelSample, currentSample } = input;
  const text = normalizeLabel(input.label);
  if (!parsed)
    return {
      kind: "reject",
      reason: "unreadable",
      message: `"${text}" is not a tube label.`,
    };
  if (!labelSample)
    return {
      kind: "reject",
      reason: "unknown",
      message: `${parsed.newId} is not in this job.`,
    };
  if (parsed.tube > input.destCount)
    return {
      kind: "reject",
      reason: "bad_tube",
      message: `${text}: samples only have ${input.destCount} tubes.`,
    };
  if (labelSample.batchNumber !== input.batchNumber)
    return {
      kind: "reject",
      reason: "other_batch",
      message: `${text} belongs to batch ${labelSample.batchNumber}; this screen is on batch ${input.batchNumber}.`,
    };
  if (labelSample.tubes[parsed.tube - 1]?.status === "placed")
    return { kind: "repeat", sample: labelSample, tube: parsed.tube };
  if (
    currentSample &&
    !isFinished(currentSample) &&
    currentSample.id !== labelSample.id
  )
    return {
      kind: "reject",
      reason: "wrong_sample",
      message: `${text} is not for the current tube ${currentSample.newId} (${currentSample.originalId}).`,
    };
  return { kind: "place", sample: labelSample, tube: parsed.tube };
}

/** Places a tube; marks pull and label as implied if nobody pressed them, and finishes the sample on its last tube. */
export function applyPlacement(
  sample: Sample,
  tube: number,
  ctx: ActionContext & { destSets: readonly string[]; boxNumber: number },
): { sample: Sample; events: EventDraft[] } {
  const { now, actor } = ctx;
  const s = { ...sample, tubes: sample.tubes.map((t) => ({ ...t })) };
  const events: EventDraft[] = [];
  if (!s.pulledAt) {
    s.pulledAt = now;
    s.pulledBy = actor;
    events.push(sampleEvent(s, "sample_pulled", { impliedByScan: true }));
  }
  if (!s.labeledAt) {
    s.labeledAt = now;
    s.labeledBy = actor;
    events.push(sampleEvent(s, "sample_labeled", { impliedByScan: true }));
  }
  const previousStatus = s.tubes[tube - 1]?.status ?? "pending";
  s.tubes[tube - 1] = {
    status: "placed",
    at: now,
    by: actor,
  } satisfies TubeState;
  const dest = destinationFor(ctx.destSets, ctx.boxNumber, s.slot, tube);
  events.push(
    sampleEvent(
      s,
      "tube_placed",
      {
        label: labelFor(s.newId, tube),
        set: dest.set,
        box: dest.box,
        slot: dest.slot,
        ...(previousStatus === "not_filled" ? { wasNotFilled: true } : {}),
      },
      tube,
    ),
  );
  if (!s.finishedAt && s.tubes.every((t) => t.status !== "pending")) {
    s.finishedAt = now;
    s.finishedBy = actor;
    events.push(
      sampleEvent(s, "sample_finished", { auto: true, notFilled: [] }),
    );
  }
  return { sample: s, events };
}

export function scanRepeatEvent(
  sample: Sample,
  tube: number,
  destSets: readonly string[],
  boxNumber: number,
): EventDraft {
  const dest = destinationFor(destSets, boxNumber, sample.slot, tube);
  return sampleEvent(
    sample,
    "scan_repeated",
    {
      label: labelFor(sample.newId, tube),
      destination: describeDestination(dest),
    },
    tube,
  );
}

export function scanRejectEvent(
  label: string,
  decision: Extract<ScanDecision, { kind: "reject" }>,
  batchNumber: number,
  currentSample: Sample | null,
  labelSample: Sample | null,
): EventDraft {
  return {
    type: "scan_rejected",
    batchNumber,
    sampleId: labelSample?.id ?? null,
    newId: labelSample?.newId ?? null,
    data: {
      label: normalizeLabel(label).slice(0, 100),
      reason: decision.reason,
      message: decision.message,
      currentNewId: currentSample?.newId ?? null,
    },
  };
}
