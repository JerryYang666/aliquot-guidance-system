import { beforeAll, describe, expect, it } from "vitest";

import { relyingParty } from "@/lib/server/admin/relying-party";
import {
  signAdminSession,
  signCeremony,
  verifyAdminSession,
  verifyCeremony,
} from "@/lib/server/admin/tokens";

beforeAll(() => {
  process.env.APP_SECRET ??= "test-secret-test-secret-test-secret-0123";
});

describe("admin session tokens", () => {
  it("round-trips the passkey a session belongs to", async () => {
    const token = await signAdminSession("passkey-1");
    expect(await verifyAdminSession(token)).toBe("passkey-1");
  });

  it("rejects a token that was tampered with or is not a session", async () => {
    const token = await signAdminSession("passkey-1");
    expect(await verifyAdminSession(`${token.slice(0, -2)}xx`)).toBeNull();
    expect(await verifyAdminSession("")).toBeNull();
    // A passkey prompt's token is signed with the same secret.
    const ceremony = await signCeremony({ kind: "sign_in", challenge: "c" });
    expect(await verifyAdminSession(ceremony)).toBeNull();
  });
});

describe("passkey prompt tokens", () => {
  it("round-trips a prompt of the expected kind only", async () => {
    const add = {
      kind: "add" as const,
      challenge: "c",
      inviteId: "invite-1",
      name: "Ada",
    };
    const token = await signCeremony(add);
    expect(await verifyCeremony(token, "add")).toMatchObject(add);
    expect(await verifyCeremony(token, "sign_in")).toBeNull();
    expect(
      await verifyCeremony(await signAdminSession("p"), "sign_in"),
    ).toBeNull();
  });
});

describe("relyingParty", () => {
  const request = (headers: Record<string, string> = {}) =>
    new Request("http://localhost:3000/api/admin/session", {
      method: "POST",
      headers,
    });

  it("is the configured origin and its hostname", () => {
    process.env.APP_ORIGIN = "https://aliquot.example.org/";
    expect(relyingParty(request())).toEqual({
      origin: "https://aliquot.example.org",
      id: "aliquot.example.org",
    });
    expect(
      relyingParty(request({ origin: "https://aliquot.example.org" })).id,
    ).toBe("aliquot.example.org");
  });

  it("turns away a browser calling from another origin", () => {
    process.env.APP_ORIGIN = "https://aliquot.example.org";
    expect(() =>
      relyingParty(request({ origin: "https://other.example.org" })),
    ).toThrow(/works at https:\/\/aliquot\.example\.org only/);
  });

  it("falls back to the request's own origin in development", () => {
    delete process.env.APP_ORIGIN;
    expect(relyingParty(request())).toEqual({
      origin: "http://localhost:3000",
      id: "localhost",
    });
  });
});
