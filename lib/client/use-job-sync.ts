"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import type {
  ActionResponse,
  AdminJobStateResponse,
  ChangeMessage,
  HeartbeatResponse,
  OnlineParticipant,
  PresenceMessage,
  StateResponse,
  TicketResponse,
} from "@/lib/api-types";

import { api, ApiFailure } from "./api";
import type { Session } from "./session";
import {
  initialSyncState,
  syncReducer,
  type Snapshot,
  type SyncAction,
  type SyncState,
} from "./sync-state";

/** live = relay connected; polling = relay unavailable, checking every few seconds. */
export type Connection = "connecting" | "live" | "polling";

const POLL_MS = 2_000;
const HEARTBEAT_MS = 30_000;
const GAP_REFETCH_MS = 1_000;

function backoff(attempt: number): number {
  return Math.min(1_000 * 2 ** attempt, 30_000) * (0.75 + Math.random() * 0.5);
}

// Where each kind of viewer reads a job from. Both roots serve `state`,
// `version` and `realtime-ticket`; they differ in who may call them and in
// how the viewer asks who is online.
const SOURCES = {
  // A station's heartbeat also keeps it on the online list.
  station: { root: "/api/jobs", presence: "heartbeat", method: "POST" },
  // An admin watches without joining, so only reads the list.
  admin: { root: "/api/admin/jobs", presence: "online", method: "GET" },
} as const;

/**
 * Keeps a screen's view of a job identical to the server's: an initial
 * snapshot, then changes pushed by the relay (or found by polling), applied
 * in version order. See lib/client/sync-state.ts.
 */
function useSync<
  S extends Snapshot & { online: OnlineParticipant[]; seenAt?: string },
>(viewer: keyof typeof SOURCES, code: string, token: string | undefined) {
  const [state, dispatch] = useReducer<SyncState<S>, [SyncAction<S>]>(
    syncReducer,
    initialSyncState,
  );
  const [connection, setConnection] = useState<Connection>("connecting");
  const [online, setOnline] = useState<OnlineParticipant[]>([]);
  const [fatal, setFatal] = useState<ApiFailure | null>(null);
  const source = SOURCES[viewer];
  const base = `${source.root}/${code}`;
  // A station has nothing to sync until it has joined; an admin's browser
  // already carries its session cookie.
  const ready = viewer === "admin" || token !== undefined;

  const versionRef = useRef(0);
  useEffect(() => {
    versionRef.current = state.version;
  }, [state.version]);

  // A station that moves to another batch gets a new token. A snapshot
  // fetch queued behind one already running must use it, not the old one.
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const inFlight = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  const fail = useCallback((error: unknown) => {
    if (
      error instanceof ApiFailure &&
      (error.status === 401 || error.status === 403 || error.status === 404)
    ) {
      setFatal(error);
    }
  }, []);

  // When the server last recorded hearing from this station.
  const seenAt = useRef<string | undefined>(undefined);

  /** Fetches a snapshot; calls made while one is running cause exactly one more. */
  const refresh = useCallback((): Promise<void> => {
    if (!ready) return Promise.resolve();
    if (inFlight.current) {
      again.current = true;
      return inFlight.current;
    }
    const run = async () => {
      do {
        again.current = false;
        try {
          const snapshot = await api<S>(`${base}/state`, {
            token: tokenRef.current,
          });
          seenAt.current = snapshot.seenAt ?? seenAt.current;
          dispatch({ type: "snapshot", snapshot });
          setOnline(snapshot.online);
        } catch (error) {
          fail(error);
        }
      } while (again.current);
      inFlight.current = null;
    };
    inFlight.current = run();
    return inFlight.current;
  }, [base, ready, fail]);

  const applyResponse = useCallback((response: ActionResponse) => {
    if (response.duplicate) return;
    dispatch({
      type: "change",
      change: {
        type: "change",
        version: response.version,
        samples: response.samples,
        events: response.events,
      },
    });
  }, []);

  const refreshOnline = useCallback(async () => {
    if (!ready) return;
    try {
      const r = await api<
        Partial<HeartbeatResponse> & { online: OnlineParticipant[] }
      >(`${base}/${source.presence}`, {
        method: source.method,
        token,
        retry: false,
      });
      seenAt.current = r.seenAt ?? seenAt.current;
      setOnline(r.online);
    } catch (error) {
      fail(error);
    }
  }, [base, source, token, ready, fail]);

  // Initial load, and again whenever the tab comes back (phones sleep) or
  // the station moves to another batch (a new token).
  useEffect(() => {
    if (!ready) return;
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [ready, refresh, token]);

  // A station says goodbye as its page goes (tab closed, reload, another
  // site), so its role is free at once and not after a silence. A beacon
  // outlives the page; a request started now might not. If the page is kept
  // and shown again (the back button), it reports in again.
  useEffect(() => {
    if (viewer !== "station" || !token) return;
    const onHide = () => {
      if (!seenAt.current) return;
      navigator.sendBeacon(
        `${base}/away`,
        JSON.stringify({ token, seenAt: seenAt.current }),
      );
    };
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) void refresh();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
    };
  }, [viewer, base, token, refresh]);

  // The relay socket, reconnecting with backoff.
  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const retry = () => {
      if (stopped) return;
      setConnection("polling");
      timer = setTimeout(() => void connect(), backoff(attempt++));
    };

    const connect = async () => {
      let ticket: TicketResponse;
      try {
        ticket = await api<TicketResponse>(`${base}/realtime-ticket`, {
          method: "POST",
          token,
          retry: false,
        });
      } catch (error) {
        fail(error);
        return retry();
      }
      if (stopped) return;
      if (!ticket.url || !ticket.ticket) {
        setConnection("polling"); // No relay configured: poll for good.
        return;
      }
      socket = new WebSocket(
        `${ticket.url.replace(/\/$/, "")}/ws?ticket=${encodeURIComponent(ticket.ticket)}`,
      );
      socket.onmessage = (e) => {
        let message: { type?: unknown };
        try {
          message = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (message.type === "hello") {
          attempt = 0;
          setConnection("live");
          // Subscribed now; a snapshot taken from here on misses nothing.
          void refresh();
        } else if (message.type === "presence") {
          const { inMs } = message as PresenceMessage;
          setTimeout(() => void refreshOnline(), inMs);
        } else if (message.type === "change") {
          const change = message as ChangeMessage;
          dispatch({ type: "change", change });
          if (change.events.some((ev) => ev.type.startsWith("participant_"))) {
            void refreshOnline();
          }
          // Archiving changes the job itself, which only a snapshot carries.
          if (change.events.some((ev) => ev.type.startsWith("job_"))) {
            void refresh();
          }
        }
      };
      socket.onclose = () => {
        socket = null;
        retry();
      };
    };

    void connect();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !socket && !stopped) {
        clearTimeout(timer);
        attempt = 0;
        void connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      socket?.close();
    };
  }, [base, token, ready, refresh, refreshOnline, fail]);

  // Without the relay, look for new versions every few seconds.
  useEffect(() => {
    if (!ready || connection === "live") return;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { version } = await api<{ version: number }>(`${base}/version`, {
          token,
          retry: false,
        });
        if (version > versionRef.current) void refresh();
      } catch (error) {
        fail(error);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [base, token, ready, connection, refresh, fail]);

  // A change that waits for a missing one too long means a message was lost.
  const hasGap = state.pending.length > 0;
  useEffect(() => {
    if (!hasGap) return;
    const id = setTimeout(() => void refresh(), GAP_REFETCH_MS);
    return () => clearTimeout(id);
  }, [hasGap, refresh]);

  // Stay on the online list, and see who has dropped off it.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => void refreshOnline(), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [ready, refreshOnline]);

  return {
    snapshot: state.snapshot,
    samples: state.samples,
    feed: state.feed,
    version: state.version,
    online,
    connection,
    fatal,
    refresh,
    refreshOnline,
    applyResponse,
  };
}

/** One station's view of its batch. */
export function useJobSync(code: string, session: Session | null) {
  return useSync<StateResponse>("station", code, session?.token);
}

/** An admin's view of a whole job, read without joining it. */
export function useAdminJobSync(code: string) {
  return useSync<AdminJobStateResponse>("admin", code, undefined);
}

export type JobSync = ReturnType<typeof useJobSync>;
