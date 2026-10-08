/**
 * A station's identity lives in this tab only (sessionStorage), so one
 * person can run two roles in two tabs. The name is remembered across tabs
 * (localStorage) to prefill the next join. Storage can be unavailable
 * (private mode); every access tolerates that.
 */
import { useSyncExternalStore } from "react";

import type { Me } from "@/lib/api-types";

import { LANGUAGES, type Language } from "./instructions";

export interface Session {
  token: string;
  me: Me;
}

const sessionKey = (code: string) => `ags:session:${code}`;
const NAME_KEY = "ags:name";
const LANGUAGE_KEY = "ags:language";

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Storage disabled: the session lasts until the page reloads.
  }
}

const tab = () => window.sessionStorage;
const device = () => window.localStorage;

export function loadSession(code: string): Session | null {
  return parseSession(read(tab, sessionKey(code)));
}

export function saveSession(code: string, session: Session) {
  write(tab, sessionKey(code), JSON.stringify(session));
  write(device, NAME_KEY, session.me.name);
  notify();
}

export function clearSession(code: string) {
  write(tab, sessionKey(code), null);
  notify();
}

export function parseSession(raw: string | null | undefined): Session | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function rememberedName(): string {
  return read(device, NAME_KEY) ?? "";
}

/** The language this device last read the instructions in; English until one is chosen. */
export function rememberedLanguage(): Language {
  const stored = read(device, LANGUAGE_KEY);
  return LANGUAGES.find((l) => l === stored) ?? "en";
}

export function rememberLanguage(language: Language) {
  write(device, LANGUAGE_KEY, language);
}

// Lets components re-read the session when this tab saves or clears it.
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The raw stored session for a job: undefined while rendering on the server
 * (storage is browser-only), null when this tab has not joined.
 */
export function useStoredSessionRaw(code: string): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => read(tab, sessionKey(code)),
    () => undefined,
  );
}
