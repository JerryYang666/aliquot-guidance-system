/**
 * A station's identity lives in this tab only (sessionStorage), so one
 * person can run two roles in two tabs. The name is remembered across tabs
 * (localStorage) to prefill the next join. Storage can be unavailable
 * (private mode); every access tolerates that.
 */
import type { Me } from "@/lib/api-types";

export interface Session {
  token: string;
  me: Me;
}

const sessionKey = (code: string) => `ags:session:${code}`;
const NAME_KEY = "ags:name";

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
  const raw = read(tab, sessionKey(code));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(code: string, session: Session) {
  write(tab, sessionKey(code), JSON.stringify(session));
  write(device, NAME_KEY, session.me.name);
}

export function clearSession(code: string) {
  write(tab, sessionKey(code), null);
}

export function rememberedName(): string {
  return read(device, NAME_KEY) ?? "";
}
