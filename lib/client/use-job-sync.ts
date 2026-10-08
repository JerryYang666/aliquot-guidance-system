"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import type {
  ActionResponse,
  ChangeMessage,
  OnlineParticipant,
  StateResponse,
  TicketResponse,
} from "@/lib/api-types";

import { api, ApiFailure } from "./api";
import type { Session } from "./session";
import { initialSyncState, syncReducer } from "./sync-state";

/** live = relay connected; polling = relay unavailable, checking every few seconds. */
export type Connection = "connecting" | "live" | "polling";

const POLL_MS = 2_000;
const HEARTBEAT_MS = 30_000;
const GAP_REFETCH_MS = 1_000;

function backoff(attempt: number): number {
  return Math.min(1_000 * 2 ** attempt, 30_000) * (0.75 + Math.random() * 0.5);
}

/**
 * Keeps one station's view of its batch identical to the server's: an
 * initial snapshot, then changes pushed by the relay (or found by polling),
 * applied in version order. See lib/client/sync-state.ts.
 */
export function useJobSync(code: string, session: Session | null) {
  const [state, dispatch] = useReducer(syncReducer, initialSyncState);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [online, setOnline] = useState<OnlineParticipant[]>([]);
  const [fatal, setFatal] = useState<ApiFailure | null>(null);
  const token = session?.token ?? null;

  const versionRef = useRef(0);
  useEffect(() => {
    versionRef.current = state.version;
  }, [state.version]);

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

  /** Fetches a snapshot; calls made while one is running cause exactly one more. */
  const refresh = useCallback((): Promise<void> => {
    if (!token) return Promise.resolve();
    if (inFlight.current) {
      again.current = true;
      return inFlight.current;
    }
    const run = async () => {
      do {
        again.current = false;
        try {
          const snapshot = await api<StateResponse>(`/api/jobs/${code}/state`, {
            token,
          });
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
  }, [code, token, fail]);

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
    if (!token) return;
    try {
      const r = await api<{ online: OnlineParticipant[] }>(
        `/api/jobs/${code}/heartbeat`,
        {
          method: "POST",
          token,
          retry: false,
        },
      );
      setOnline(r.online);
    } catch (error) {
      fail(error);
    }
  }, [code, token, fail]);

  // Initial load, and again whenever the tab comes back (phones sleep).
  useEffect(() => {
    if (!token) return;
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [token, refresh]);

  // The relay socket, reconnecting with backoff.
  useEffect(() => {
    if (!token) return;
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
        ticket = await api<TicketResponse>(
          `/api/jobs/${code}/realtime-ticket`,
          {
            method: "POST",
            token,
            retry: false,
          },
        );
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
        } else if (message.type === "change") {
          const change = message as ChangeMessage;
          dispatch({ type: "change", change });
          if (change.events.some((ev) => ev.type.startsWith("participant_"))) {
            void refreshOnline();
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
  }, [code, token, refresh, refreshOnline, fail]);

  // Without the relay, look for new versions every few seconds.
  useEffect(() => {
    if (!token || connection === "live") return;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { version } = await api<{ version: number }>(
          `/api/jobs/${code}/version`,
          {
            token,
            retry: false,
          },
        );
        if (version > versionRef.current) void refresh();
      } catch (error) {
        fail(error);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [code, token, connection, refresh, fail]);

  // A change that waits for a missing one too long means a message was lost.
  const hasGap = state.pending.length > 0;
  useEffect(() => {
    if (!hasGap) return;
    const id = setTimeout(() => void refresh(), GAP_REFETCH_MS);
    return () => clearTimeout(id);
  }, [hasGap, refresh]);

  // Stay on the online list.
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => void refreshOnline(), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [token, refreshOnline]);

  return {
    snapshot: state.snapshot,
    samples: state.samples,
    feed: state.feed,
    version: state.version,
    online,
    connection,
    fatal,
    refresh,
    applyResponse,
  };
}

export type JobSync = ReturnType<typeof useJobSync>;
