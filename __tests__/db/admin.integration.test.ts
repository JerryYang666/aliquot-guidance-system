/**
 * Runs admin sign-in against a real Postgres: invites, adding a passkey,
 * signing in with it, and removing one. A software passkey stands in for
 * the browser. Needs TEST_DATABASE_URL; skipped without it.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, resetDatabase } from "./database";
import { FakePasskey } from "./fake-passkey";

const url = process.env.TEST_DATABASE_URL;

const rp = { origin: "https://aliquot.example.org", id: "aliquot.example.org" };

describe.skipIf(!url)("admins against Postgres", () => {
  let mod: Awaited<ReturnType<typeof load>>;

  async function load() {
    return {
      db: await import("@/lib/db"),
      schema: await import("@/lib/db/schema"),
      seed: await import("@/lib/admin/invites"),
      invites: await import("@/lib/server/admin/invites"),
      passkeys: await import("@/lib/server/admin/passkeys"),
      jobs: await import("@/lib/server/admin/jobs"),
      createJob: await import("@/lib/server/create-job"),
      participants: await import("@/lib/server/participants"),
    };
  }

  const db = () => mod.db.getDb();

  /** An invite as scripts/admin-invite-sql.ts seeds it: made by nobody. */
  async function seedInvite(minutes = 10): Promise<string> {
    const { token, insert } = mod.seed.newInvite(db(), {
      createdBy: null,
      minutes,
    });
    await insert;
    return token;
  }

  /** Follows an invite link the way the browser does. */
  async function addPasskey(token: string, name: string, site = rp) {
    const invite = await mod.invites.findOpenInvite(db(), token);
    if (!invite) throw new Error("the invite is not open");
    const options = await mod.passkeys.addPasskeyOptions(rp, name);
    const passkey = new FakePasskey(site);
    const admin = await mod.passkeys.addPasskey(db(), rp, {
      inviteId: invite.id,
      name,
      challenge: options.challenge,
      response: passkey.create(options),
    });
    return { admin, passkey };
  }

  async function signIn(passkey: FakePasskey) {
    const options = await mod.passkeys.signInOptions(rp);
    return mod.passkeys.signIn(
      db(),
      rp,
      options.challenge,
      passkey.get(options),
    );
  }

  async function inviteAndAdd(by: { id: string }, name: string) {
    const { token } = await mod.invites.createInvite(db(), by.id);
    return addPasskey(token, name);
  }

  const passkeyCount = async () =>
    (await db().select().from(mod.schema.adminPasskeys)).length;

  beforeAll(async () => {
    await resetDatabase(url!);
    mod = await load();
  });

  afterAll(closeDatabase);

  it("adds one passkey per invite link, and signs in with it", async () => {
    const token = await seedInvite();
    const { admin, passkey } = await addPasskey(token, "Ada");

    expect(await signIn(passkey)).toEqual(admin);
    expect(await mod.passkeys.findAdmin(db(), admin.id)).toEqual(admin);
    const [listed] = await mod.passkeys.listPasskeys(db());
    expect(listed).toMatchObject({ name: "Ada", invitedBy: null });
    expect(listed?.lastUsedAt).not.toBeNull();

    // The link is spent: it no longer opens, and cannot add a second passkey.
    expect(await mod.invites.findOpenInvite(db(), token)).toBeNull();
    const [invite] = await db().select().from(mod.schema.adminInvites);
    const options = await mod.passkeys.addPasskeyOptions(rp, "Eve");
    await expect(
      mod.passkeys.addPasskey(db(), rp, {
        inviteId: invite!.id,
        name: "Eve",
        challenge: options.challenge,
        response: new FakePasskey(rp).create(options),
      }),
    ).rejects.toMatchObject({ status: 410, code: "invite_gone" });
    expect(await passkeyCount()).toBe(1);
  });

  it("refuses an expired, unknown or malformed link", async () => {
    const expired = await seedInvite(0);
    expect(await mod.invites.findOpenInvite(db(), expired)).toBeNull();

    const never = mod.seed.newInvite(db(), { createdBy: null, minutes: 10 });
    expect(await mod.invites.findOpenInvite(db(), never.token)).toBeNull();
    expect(await mod.invites.findOpenInvite(db(), "not a token")).toBeNull();
  });

  it("refuses a link that expires before the passkey is saved", async () => {
    const token = await seedInvite();
    const invite = await mod.invites.findOpenInvite(db(), token);
    const options = await mod.passkeys.addPasskeyOptions(rp, "Late");
    await db()
      .update(mod.schema.adminInvites)
      .set({ expiresAt: sql`clock_timestamp()` })
      .where(eq(mod.schema.adminInvites.id, invite!.id));
    const before = await passkeyCount();

    await expect(
      mod.passkeys.addPasskey(db(), rp, {
        inviteId: invite!.id,
        name: "Late",
        challenge: options.challenge,
        response: new FakePasskey(rp).create(options),
      }),
    ).rejects.toMatchObject({ status: 410 });
    expect(await passkeyCount()).toBe(before);
  });

  it("rejects a passkey made for another site or another prompt", async () => {
    const elsewhere = { origin: "https://evil.example", id: "evil.example" };
    await expect(
      addPasskey(await seedInvite(), "Mallory", elsewhere),
    ).rejects.toMatchObject({ status: 400, code: "passkey_rejected" });

    const token = await seedInvite();
    const invite = await mod.invites.findOpenInvite(db(), token);
    const options = await mod.passkeys.addPasskeyOptions(rp, "Mallory");
    const stale = await mod.passkeys.addPasskeyOptions(rp, "Mallory");
    await expect(
      mod.passkeys.addPasskey(db(), rp, {
        inviteId: invite!.id,
        name: "Mallory",
        challenge: options.challenge,
        response: new FakePasskey(rp).create(stale),
      }),
    ).rejects.toMatchObject({ status: 400, code: "passkey_rejected" });
    // A rejected passkey does not spend the link.
    expect(await mod.invites.findOpenInvite(db(), token)).not.toBeNull();
  });

  it("does not sign in a stranger, a stale answer or a forgery", async () => {
    const { passkey } = await addPasskey(await seedInvite(), "Grace");

    await expect(signIn(new FakePasskey(rp))).rejects.toMatchObject({
      status: 401,
      code: "unknown_passkey",
    });

    // An answer to an earlier prompt.
    const earlier = await mod.passkeys.signInOptions(rp);
    const current = await mod.passkeys.signInOptions(rp);
    await expect(
      mod.passkeys.signIn(db(), rp, current.challenge, passkey.get(earlier)),
    ).rejects.toMatchObject({ status: 401, code: "passkey_rejected" });

    // Grace's passkey ID, signed with someone else's key.
    const forged = new FakePasskey(rp).get(current);
    const real = passkey.get(current);
    await expect(
      mod.passkeys.signIn(db(), rp, current.challenge, {
        ...forged,
        id: real.id,
        rawId: real.rawId,
      }),
    ).rejects.toMatchObject({ status: 401, code: "passkey_rejected" });

    expect(await signIn(passkey)).toMatchObject({ name: "Grace" });
  });

  it("lets an admin invite another, and remove them but not themselves", async () => {
    const first = await addPasskey(await seedInvite(), "Root");
    const second = await inviteAndAdd(first.admin, "Guest");

    const listed = await mod.passkeys.listPasskeys(db());
    expect(listed.find((p) => p.id === second.admin.id)).toMatchObject({
      name: "Guest",
      invitedBy: "Root",
    });

    await expect(
      mod.passkeys.revokePasskey(db(), first.admin, first.admin.id),
    ).rejects.toMatchObject({ status: 409, code: "own_passkey" });

    await mod.passkeys.revokePasskey(db(), first.admin, second.admin.id);
    expect(await mod.passkeys.findAdmin(db(), second.admin.id)).toBeNull();
    await expect(signIn(second.passkey)).rejects.toMatchObject({
      status: 401,
      code: "unknown_passkey",
    });
    expect(
      (await mod.passkeys.listPasskeys(db())).map((p) => p.id),
    ).not.toContain(second.admin.id);
    await expect(
      mod.passkeys.revokePasskey(db(), first.admin, second.admin.id),
    ).rejects.toMatchObject({ status: 404 });
    expect(await signIn(first.passkey)).toEqual(first.admin);
  });

  it("lists every job with its progress and who is on it", async () => {
    const { code, jobId } = await mod.createJob.createJob(db(), {
      name: "Listed job",
      createdBy: "Setup",
      sourceFilename: null,
      workbook: {
        destSets: ["Ship", "Keep2", "Keep3"],
        batches: [
          {
            number: 1,
            boxNumber: 1,
            samples: ["S0001", "S0002"].map((newId, i) => ({
              pullOrder: i + 1,
              newId,
              originalId: String(41540 + i),
              sourceBox: "case_box 1",
              sourceLocation: "case box",
              sourcePosition: `1-C-${i + 1}`,
              slot: `A${i + 1}`,
              volumeNote: null,
            })),
          },
        ],
      },
    });
    await mod.participants.joinJob(
      db(),
      jobId,
      { name: "Pat", role: "puller", batchNumber: 1 },
      null,
    );

    const job = (await mod.jobs.listAllJobs(db())).find((j) => j.code === code);
    expect(job).toMatchObject({
      name: "Listed job",
      createdBy: "Setup",
      batches: 1,
      samples: 2,
      finished: 0,
      online: 1,
    });
    expect(new Date(job!.createdAt).toISOString()).toBe(job!.createdAt);
    expect(new Date(job!.lastActivityAt!).toISOString()).toBe(
      job!.lastActivityAt,
    );
  });
});
