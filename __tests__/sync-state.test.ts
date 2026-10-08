import { describe, expect, it } from "vitest";

import type { ChangeMessage, StateResponse } from "@/lib/api-types";
import {
  initialSyncState,
  syncReducer,
  type SyncState,
} from "@/lib/client/sync-state";
import type { LogEvent, Sample } from "@/lib/pipeline/types";

import { makeSample, T0 } from "./helpers";

const a = makeSample({ batchNumber: 1 });
const b = makeSample({ batchNumber: 1 });

function snapshot(version: number, samples: Sample[] = [a, b]): StateResponse {
  return {
    version,
    samples,
    job: {
      id: "j",
      code: "ABCDEFGH",
      name: "J",
      destSets: ["Ship"],
      createdAt: T0,
      createdBy: "x",
    },
    batch: { number: 1, boxNumber: 1, title: null },
    batches: [],
    online: [],
    me: { participantId: "p", name: "Ana", role: "puller", batchNumber: 1 },
    layouts: { dest: { rows: ["A"], cols: 1 }, sources: {} },
  };
}

function event(id: number, version: number): LogEvent {
  return {
    id,
    version,
    at: T0,
    clientAt: null,
    actorName: "Ana",
    actorRole: "puller",
    type: "sample_pulled",
    batchNumber: 1,
    sampleId: a.id,
    newId: a.newId,
    tube: null,
    data: {},
  };
}

function change(version: number, samples: Sample[] = []): ChangeMessage {
  return {
    type: "change",
    version,
    samples,
    events: [event(version, version)],
  };
}

const start = (version = 5) =>
  syncReducer(initialSyncState, {
    type: "snapshot",
    snapshot: snapshot(version),
  });

describe("sync ordering", () => {
  it("applies the next version at once", () => {
    const pulled = { ...a, pulledAt: T0 };
    const s = syncReducer(start(), {
      type: "change",
      change: change(6, [pulled]),
    });
    expect(s.version).toBe(6);
    expect(s.samples[0]?.pulledAt).toBe(T0);
    expect(s.feed.map((e) => e.id)).toEqual([6]);
  });

  it("ignores changes it already has", () => {
    const s = start();
    expect(syncReducer(s, { type: "change", change: change(5) })).toBe(s);
  });

  it("holds an early change until the missing one arrives, then applies both in order", () => {
    let s: SyncState = syncReducer(start(), {
      type: "change",
      change: change(7),
    });
    expect(s.version).toBe(5);
    expect(s.pending).toHaveLength(1);
    s = syncReducer(s, { type: "change", change: change(6) });
    expect(s.version).toBe(7);
    expect(s.pending).toEqual([]);
    expect(s.feed.map((e) => e.version)).toEqual([7, 6]);
  });

  it("lets a snapshot settle a gap and keeps later buffered changes", () => {
    let s = syncReducer(start(), { type: "change", change: change(8) });
    s = syncReducer(s, { type: "change", change: change(9) });
    s = syncReducer(s, { type: "snapshot", snapshot: snapshot(8) });
    expect(s.version).toBe(9);
    expect(s.pending).toEqual([]);
  });

  it("does not let a stale snapshot roll back newer changes", () => {
    const s = syncReducer(start(), { type: "change", change: change(6) });
    expect(syncReducer(s, { type: "snapshot", snapshot: snapshot(5) })).toBe(s);
  });

  it("ignores sample updates from other batches but still advances", () => {
    const other = makeSample({ batchNumber: 2 });
    const s = syncReducer(start(), {
      type: "change",
      change: change(6, [other]),
    });
    expect(s.version).toBe(6);
    expect(s.samples).toEqual([a, b]);
  });
});
