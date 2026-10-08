/**
 * The ordering rules a screen follows to stay identical to the server:
 * changes are applied strictly in version order; an early one waits in a
 * buffer for the one before it; a snapshot replaces everything up to its
 * version. A buffer that does not drain means a message was lost, and the
 * screen refetches (see useJobSync).
 */
import type { ChangeMessage, StateResponse } from "@/lib/api-types";
import type { LogEvent, Sample } from "@/lib/pipeline/types";

export const FEED_LIMIT = 150;

export interface SyncState {
  snapshot: StateResponse | null;
  version: number;
  samples: Sample[];
  /** Recent events from every batch, newest first. */
  feed: LogEvent[];
  /** Changes that arrived ahead of a missing one. */
  pending: ChangeMessage[];
}

export const initialSyncState: SyncState = {
  snapshot: null,
  version: 0,
  samples: [],
  feed: [],
  pending: [],
};

function apply(state: SyncState, change: ChangeMessage): SyncState {
  const batch = state.snapshot?.batch.number;
  const updates = new Map(
    change.samples.filter((s) => s.batchNumber === batch).map((s) => [s.id, s]),
  );
  const seen = new Set(state.feed.map((e) => e.id));
  const fresh = change.events.filter((e) => !seen.has(e.id)).reverse();
  return {
    ...state,
    version: change.version,
    samples: updates.size
      ? state.samples.map((s) => updates.get(s.id) ?? s)
      : state.samples,
    feed: fresh.length
      ? [...fresh, ...state.feed].slice(0, FEED_LIMIT)
      : state.feed,
  };
}

function drain(state: SyncState): SyncState {
  let next = state;
  for (;;) {
    const following = next.pending.find((c) => c.version === next.version + 1);
    if (!following) break;
    next = apply(next, following);
  }
  return {
    ...next,
    pending: next.pending.filter((c) => c.version > next.version),
  };
}

export type SyncAction =
  | { type: "snapshot"; snapshot: StateResponse }
  | { type: "change"; change: ChangeMessage }
  | { type: "reset" };

export function syncReducer(state: SyncState, action: SyncAction): SyncState {
  switch (action.type) {
    case "reset":
      return initialSyncState;
    case "snapshot": {
      const { snapshot } = action;
      if (state.snapshot && snapshot.version < state.version) {
        // An older snapshot raced a newer change; keep the newer state.
        return state;
      }
      return drain({
        ...state,
        snapshot,
        version: snapshot.version,
        samples: snapshot.samples,
      });
    }
    case "change": {
      const { change } = action;
      if (!state.snapshot || change.version <= state.version) return state;
      if (state.pending.some((c) => c.version === change.version)) return state;
      return drain({ ...state, pending: [...state.pending, change] });
    }
  }
}
