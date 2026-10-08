/**
 * Runs the actions layer against a real Postgres with the real migrations.
 * Needs TEST_DATABASE_URL (a database this suite may wipe); skipped without it.
 */
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, resetDatabase } from "./database";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("pipeline against Postgres", () => {
  let mod: Awaited<ReturnType<typeof load>>;
  let code: string;
  const tokens: Record<
    string,
    Awaited<ReturnType<typeof mod.participants.joinJob>>
  > = {};
  let n = 0;
  const actionId = () => `test-action-${++n}-${Date.now()}`;

  async function load() {
    return {
      db: await import("@/lib/db"),
      schema: await import("@/lib/db/schema"),
      actions: await import("@/lib/server/actions"),
      createJob: await import("@/lib/server/create-job"),
      jobs: await import("@/lib/server/jobs"),
      participants: await import("@/lib/server/participants"),
      errors: await import("@/lib/server/errors"),
    };
  }

  beforeAll(async () => {
    await resetDatabase(url!);

    mod = await load();
    const db = mod.db.getDb();
    ({ code } = await mod.createJob.createJob(db, {
      name: "Test job",
      createdBy: "Setup",
      sourceFilename: "test.xlsx",
      workbook: {
        destSets: ["Ship", "Keep2", "Keep3"],
        batches: [
          {
            number: 1,
            boxNumber: 1,
            samples: ["S0001", "S0002", "S0003"].map((newId, i) => ({
              pullOrder: i + 1,
              newId,
              originalId: String(41540 + i),
              sourceBox: "case_box 1",
              sourceLocation: "case box",
              sourcePosition: `1-C-${i + 1}`,
              slot: `A${i + 1}`,
              volumeNote: i === 2 ? "Very low" : null,
            })),
          },
          {
            number: 2,
            boxNumber: 2,
            samples: [
              {
                pullOrder: 1,
                newId: "S0101",
                originalId: "50000",
                sourceBox: "AIP Box 4",
                sourceLocation: "2nd shelf",
                sourcePosition: "4-B-15",
                slot: "A1",
                volumeNote: null,
              },
            ],
          },
        ],
      },
    }));
    const job = await mod.jobs.getJobByCode(db, code);
    for (const [name, role] of [
      ["Pat", "puller"],
      ["Lee", "labeler"],
      ["Ali", "aliquoter"],
    ] as const) {
      tokens[role] = await mod.participants.joinJob(
        db,
        job.id,
        { name, role, batchNumber: 1 },
        "vitest",
      );
    }
  });

  afterAll(closeDatabase);

  const as = (role: string) => tokens[role]!.participant;

  async function act(
    role: string,
    action: Record<string, unknown>,
    clientActionId = actionId(),
  ) {
    return mod.actions.performAction(mod.db.getDb(), as(role), {
      clientActionId,
      clientAt: new Date().toISOString(),
      action: action as never,
    });
  }

  async function sample(newId: string) {
    const db = mod.db.getDb();
    const [row] = await db
      .select()
      .from(mod.schema.samples)
      .where(eq(mod.schema.samples.newId, newId));
    return row!;
  }

  it("runs one sample through the whole pipeline and logs every step", async () => {
    const s1 = await sample("S0001");
    await act("puller", { type: "pull", sampleId: s1.id });
    await act("labeler", { type: "label", sampleId: s1.id });

    const wrong = await act("aliquoter", {
      type: "scan",
      label: "S0002-1",
      currentSampleId: s1.id,
    });
    expect(wrong.ok).toBe(false);
    expect(wrong.scan).toMatchObject({
      kind: "reject",
      reason: "wrong_sample",
    });

    for (const label of ["S0001-2", "S0001-1"]) {
      const r = await act("aliquoter", {
        type: "scan",
        label,
        currentSampleId: s1.id,
      });
      expect(r.scan).toMatchObject({ kind: "place", sampleFinished: false });
    }
    const last = await act("aliquoter", {
      type: "scan",
      label: "s0001-3",
      currentSampleId: s1.id,
    });
    expect(last.scan).toMatchObject({
      kind: "place",
      label: "S0001-3",
      destination: { set: "Keep3", box: 1, slot: "A1" },
      sampleFinished: true,
    });

    const again = await act("aliquoter", {
      type: "scan",
      label: "S0001-1",
      currentSampleId: null,
    });
    expect(again.scan).toMatchObject({ kind: "repeat" });

    await act("puller", { type: "return", sampleId: s1.id });
    const done = await sample("S0001");
    expect(done.returnedBy).toBe("Pat");
    expect(done.tubes.map((t) => t.status)).toEqual([
      "placed",
      "placed",
      "placed",
    ]);

    const db = mod.db.getDb();
    const log = await db
      .select()
      .from(mod.schema.events)
      .where(eq(mod.schema.events.sampleId, s1.id))
      .orderBy(asc(mod.schema.events.id));
    expect(log.map((e) => [e.type, e.actorName])).toEqual([
      ["sample_pulled", "Pat"],
      ["sample_labeled", "Lee"],
      ["tube_placed", "Ali"],
      ["tube_placed", "Ali"],
      ["tube_placed", "Ali"],
      ["sample_finished", "Ali"],
      ["scan_repeated", "Ali"],
      ["sample_returned", "Pat"],
    ]);
    expect(log.every((e) => e.clientAt !== null)).toBe(true);
  });

  it("logs rejected scans, including ones from another batch", async () => {
    const r = await act("aliquoter", {
      type: "scan",
      label: "S0101-1",
      currentSampleId: null,
    });
    expect(r.scan).toMatchObject({ kind: "reject", reason: "other_batch" });
    const [event] = r.events;
    expect(event).toMatchObject({
      type: "scan_rejected",
      newId: "S0101",
      actorName: "Ali",
    });
  });

  it("refuses invalid actions without logging them", async () => {
    const s2 = await sample("S0002");
    const before = await mod.jobs.getJobByCode(mod.db.getDb(), code);
    await expect(
      act("puller", { type: "return", sampleId: s2.id }),
    ).rejects.toMatchObject({
      status: 409,
      code: "not_pulled",
    });
    const after = await mod.jobs.getJobByCode(mod.db.getDb(), code);
    expect(after.version).toBe(before.version);
  });

  it("applies a retried action once", async () => {
    const s3 = await sample("S0003");
    const id = actionId();
    const first = await act("labeler", { type: "label", sampleId: s3.id }, id);
    const retry = await act("labeler", { type: "label", sampleId: s3.id }, id);
    expect(first.duplicate).toBeUndefined();
    expect(retry).toMatchObject({
      ok: true,
      duplicate: true,
      version: first.version,
    });
  });

  it("lets only one of several simultaneous pulls of a tube through", async () => {
    const s2 = await sample("S0002");
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        act("puller", { type: "pull", sampleId: s2.id }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      results
        .filter((r) => r.status === "rejected")
        .map((r) => (r.reason as { code: string }).code),
    ).toEqual(Array(5).fill("already_pulled"));
  });

  it("marks a sample labeled when the labeler has scanned all its labels", async () => {
    const s2 = await sample("S0002");
    const scan = (label: string) =>
      act("labeler", { type: "label_scan", label, currentSampleId: s2.id });

    expect((await scan("S0002-1")).labelScan).toMatchObject({
      kind: "record",
      set: "Ship",
      sampleLabeled: false,
    });
    const wrong = await scan("S0003-1");
    expect(wrong.ok).toBe(false);
    expect(wrong.events[0]).toMatchObject({
      type: "label_scan_rejected",
      actorName: "Lee",
      data: { reason: "wrong_sample" },
    });
    expect((await scan("S0002-1")).labelScan).toMatchObject({ kind: "repeat" });
    await scan("S0002-3");
    const last = await scan("s0002-2");
    expect(last.labelScan).toMatchObject({
      kind: "record",
      label: "S0002-2",
      sampleLabeled: true,
    });
    expect(last.events.map((e) => e.type)).toEqual([
      "label_scanned",
      "sample_labeled",
    ]);

    const row = await sample("S0002");
    expect(row.labeledBy).toBe("Lee");
    expect(row.tubes.map((t) => t.labelScannedBy)).toEqual([
      "Lee",
      "Lee",
      "Lee",
    ]);
  });

  it("gives each working role on a batch to one person at a time", async () => {
    const db = mod.db.getDb();
    const job = await mod.jobs.getJobByCode(db, code);
    const join = (
      name: string,
      role: "puller" | "labeler" | "aliquoter" | "overview",
      batchNumber = 1,
      more: { attempt?: string; current?: typeof tokens.puller } = {},
    ) =>
      mod.participants.joinJob(
        db,
        job.id,
        { name, role, batchNumber, attempt: more.attempt },
        "vitest",
        more.current?.participant ?? null,
      );
    const count = async () =>
      (await db.select().from(mod.schema.participants)).length;

    // Pat is the Puller on batch 1; a second Puller is turned away, and
    // nothing is recorded of the attempt.
    const before = { people: await count(), version: job.version };
    await expect(join("Sam", "puller")).rejects.toMatchObject({
      status: 409,
      code: "role_taken",
      message: expect.stringContaining("Pat is already the Puller on batch 1"),
    });
    expect(await count()).toBe(before.people);
    expect((await mod.jobs.getJobByCode(db, code)).version).toBe(
      before.version,
    );

    // Another batch is another set of stations, and Overview is open to all.
    const sam = await join("Sam", "puller", 2);
    await join("Olive", "overview");
    await join("Omar", "overview");

    // Leaving frees the role at once.
    await expect(join("Kim", "puller", 2)).rejects.toMatchObject({
      code: "role_taken",
    });
    await mod.participants.leaveJob(db, sam.participant);
    const kim = await join("Kim", "puller", 2);

    // So does going quiet for longer than the online window.
    await expect(join("Lou", "labeler")).rejects.toMatchObject({
      code: "role_taken",
    });
    await db
      .update(mod.schema.participants)
      .set({ lastSeenAt: sql`clock_timestamp() - interval '2 minutes'` })
      .where(eq(mod.schema.participants.id, as("labeler").participantId));
    await join("Lou", "labeler");

    // A tab that already holds the station can join again in its place.
    await expect(join("Kim", "puller", 2)).rejects.toMatchObject({
      code: "role_taken",
    });
    const again = await join("Kim K.", "puller", 2, { current: kim });
    expect(again.participant.participantId).not.toBe(
      kim.participant.participantId,
    );
    await mod.participants.leaveJob(db, kim.participant);

    // A join that is sent twice is one join: same station, logged once.
    await mod.participants.leaveJob(db, again.participant);
    const attempt = crypto.randomUUID();
    const first = await join("Ray", "puller", 2, { attempt });
    const people = await count();
    const retried = await join("Ray", "puller", 2, { attempt });
    expect(retried.participant).toEqual(first.participant);
    expect(retried.events).toEqual([]);
    expect(await count()).toBe(people);
  });

  it("keeps versions gapless and the log append-only", async () => {
    const db = mod.db.getDb();
    const job = await mod.jobs.getJobByCode(db, code);
    const log = await db
      .select({
        version: mod.schema.events.version,
        ord: mod.schema.events.ord,
      })
      .from(mod.schema.events)
      .where(eq(mod.schema.events.jobId, job.id))
      .orderBy(asc(mod.schema.events.id));
    const versions = [...new Set(log.map((e) => e.version))];
    expect(versions).toEqual(
      Array.from({ length: job.version }, (_, i) => i + 1),
    );

    await expect(
      db.update(mod.schema.events).set({ type: "edited" }),
    ).rejects.toThrow();
    await expect(db.delete(mod.schema.events)).rejects.toThrow();
  });
});
