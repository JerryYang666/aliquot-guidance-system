/**
 * The ordering rules a screen follows to stay identical to the server:
 * changes are applied strictly in version order; an early one waits in a
 * buffer for the one before it; a snapshot replaces everything up to its
 * version. A buffer that does not drain means a message was lost, and the
 * screen refetches (see useJobSync).
 *
 * A station's snapshot is one batch, and changes to other batches pass it
 * by. An admin watching a job holds every batch, and that snapshot brings
 * the latest events with it, since the admin was not there to see them.
 */
import type { ChangeMessage, StateResponse } from "@/lib/api-types";
import type { LogEvent, Sample } from "@/lib/pipeline/types";

export const FEED_LIMIT = 150;

/** What changes are applied on top of. */
export interface Snapshot {
  version: number;
  samples: Sample[];
  /** The one batch this screen holds; absent when it holds the whole job. */
  batch?: { number: number };
  /** Events from before this screen was watching, newest first. */
  feed?: LogEvent[];
}

export interface SyncState<S extends Snapshot = StateResponse> {
  snapshot: S | null;
  version: number;
  samples: Sample[];
  /** Recent events from every batch, newest first. */
  feed: LogEvent[];
  /** Changes that arrived ahead of a missing one. */
  pending: ChangeMessage[];
}

export const initialSyncState: SyncState<never> = {
  snapshot: null,
  version: 0,
  samples: [],
  feed: [],
  pending: [],
};

function apply<S extends Snapshot>(
  state: SyncState<S>,
  change: ChangeMessage,
): SyncState<S> {
  const batch = state.snapshot?.batch?.number;
  const updates = new Map(
    change.samples
      .filter((s) => batch === undefined || s.batchNumber === batch)
      .map((s) => [s.id, s]),
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

/** Both lists as one, newest first, each event once. */
function mergeFeeds(a: LogEvent[], b: LogEvent[]): LogEvent[] {
  const byId = new Map([...a, ...b].map((e) => [e.id, e]));
  return [...byId.values()].sort((x, y) => y.id - x.id).slice(0, FEED_LIMIT);
}

function drain<S extends Snapshot>(state: SyncState<S>): SyncState<S> {
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

export type SyncAction<S extends Snapshot = StateResponse> =
  | { type: "snapshot"; snapshot: S }
  | { type: "change"; change: ChangeMessage }
  | { type: "reset" };

export function syncReducer<S extends Snapshot = StateResponse>(
  state: SyncState<S>,
  action: SyncAction<S>,
): SyncState<S> {
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
        feed: snapshot.feed
          ? mergeFeeds(state.feed, snapshot.feed)
          : state.feed,
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
