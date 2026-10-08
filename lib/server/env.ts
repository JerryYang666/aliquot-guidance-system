import "server-only";

function secret(name: string): Uint8Array {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be set to at least 32 characters`);
  }
  return new TextEncoder().encode(value);
}

/** Signs participant tokens. */
export const appSecret = () => secret("APP_SECRET");

/**
 * The realtime relay, or null when it is not configured (screens then poll).
 * `publicUrl` is what browsers connect to (wss://…); `internalUrl` is where
 * this server posts changes; the secret signs tickets and authorizes posts.
 */
export function relayConfig(): {
  publicUrl: string;
  internalUrl: string;
  secret: Uint8Array;
} | null {
  const publicUrl = process.env.RELAY_PUBLIC_URL;
  const internalUrl =
    process.env.RELAY_INTERNAL_URL ?? publicUrl?.replace(/^ws/, "http");
  if (!publicUrl || !internalUrl || !process.env.RELAY_SECRET) return null;
  return { publicUrl, internalUrl, secret: secret("RELAY_SECRET") };
}
