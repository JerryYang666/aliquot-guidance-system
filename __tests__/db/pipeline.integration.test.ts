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
      tokens: await import("@/lib/server/tokens"),
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
          {
            number: 3,
            boxNumber: 3,
            samples: [
              {
                pullOrder: 1,
                newId: "S0201",
                originalId: "60000",
                sourceBox: "AIP Box 5",
                sourceLocation: "2nd shelf",
                sourcePosition: "5-A-1",
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
    // With a source tube of batch 1 out, a tube of batch 2 is the wrong one.
    await act("puller", {
      type: "pull",
      sampleId: (await sample("S0003")).id,
    });
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

  it("lets an Aliquoter work a batch alone, starting each sample with a scan", async () => {
    // Nobody pulls or labels batch 2: its Aliquoter does it all and only
    // scans. With no sample under way, the first scan starts one and
    // records it as pulled and labeled; its other tubes finish it.
    const db = mod.db.getDb();
    const job = await mod.jobs.getJobByCode(db, code);
    const sol = await mod.participants.joinJob(
      db,
      job.id,
      { name: "Sol", role: "aliquoter", batchNumber: 2 },
      "vitest",
    );
    const scan = (label: string, currentSampleId: string | null) =>
      mod.actions.performAction(db, sol.participant, {
        clientActionId: actionId(),
        clientAt: new Date().toISOString(),
        action: { type: "scan", label, currentSampleId },
      });
    const s = await sample("S0101");
    expect(s.pulledAt).toBeNull();
    expect(s.labeledAt).toBeNull();

    const first = await scan("S0101-2", null);
    expect(first.scan).toMatchObject({
      kind: "place",
      destination: { set: "Keep2", box: 2, slot: "A1" },
      sampleFinished: false,
    });
    expect(first.events.map((e) => [e.type, e.data])).toEqual([
      ["sample_pulled", { impliedByScan: true }],
      ["sample_labeled", { impliedByScan: true }],
      ["tube_placed", expect.objectContaining({ label: "S0101-2" })],
    ]);

    // The sample is now the screen's current one, so its other tubes go
    // in, and the last one finishes it.
    expect((await scan("S0101-1", s.id)).scan).toMatchObject({
      kind: "place",
      sampleFinished: false,
    });
    const last = await scan("S0101-3", s.id);
    expect(last.scan).toMatchObject({
      kind: "place",
      destination: { set: "Keep3", box: 2, slot: "A1" },
      sampleFinished: true,
    });

    const done = await sample("S0101");
    expect([done.pulledBy, done.labeledBy, done.finishedBy]).toEqual([
      "Sol",
      "Sol",
      "Sol",
    ]);
    expect(done.tubes.map((t) => t.status)).toEqual([
      "placed",
      "placed",
      "placed",
    ]);
    await mod.participants.leaveJob(db, sol.participant);
  });

  it("moves an Aliquoter with nothing out to the batch of the tube they scan", async () => {
    const db = mod.db.getDb();
    const job = await mod.jobs.getJobByCode(db, code);
    const mo = await mod.participants.joinJob(
      db,
      job.id,
      { name: "Mo", role: "aliquoter", batchNumber: 2 },
      "vitest",
    );
    const scan = (
      who: typeof mo.participant,
      label: string,
      currentSampleId: string | null = null,
      clientActionId = actionId(),
    ) =>
      mod.actions.performAction(db, who, {
        clientActionId,
        clientAt: new Date().toISOString(),
        action: { type: "scan", label, currentSampleId },
      });

    // Batch 2 has nothing out. Ali is the Aliquoter on batch 1, so Mo
    // cannot move there.
    const held = await scan(mo.participant, "S0003-1");
    expect(held.scan).toMatchObject({ kind: "reject", reason: "batch_held" });
    expect(held.moved).toBeUndefined();

    // Nobody is on batch 3: Mo's scan of its tube moves the station there,
    // and places the tube as if it had been on batch 3 all along.
    const id = actionId();
    const first = await scan(mo.participant, "S0201-1", null, id);
    expect(first.scan).toMatchObject({
      kind: "place",
      destination: { set: "Ship", box: 3, slot: "A1" },
    });
    expect(first.events.map((e) => [e.type, e.batchNumber, e.data])).toEqual([
      ["participant_moved", 2, { to: 3, label: "S0201-1" }],
      ["sample_pulled", 3, { impliedByScan: true }],
      ["sample_labeled", 3, { impliedByScan: true }],
      ["tube_placed", 3, expect.objectContaining({ label: "S0201-1" })],
    ]);
    expect(first.moved?.me).toEqual({
      participantId: mo.participant.participantId,
      name: "Mo",
      role: "aliquoter",
      batchNumber: 3,
    });
    const there = await mod.tokens.verifyParticipantToken(first.moved!.token);
    expect(there).toEqual({ ...mo.participant, batchNumber: 3 });
    const online = await mod.jobs.onlineParticipants(db, job.id);
    expect(online.find((p) => p.name === "Mo")).toMatchObject({
      batchNumber: 3,
      waiting: false,
    });

    // A retry that lost its answer moves the station all the same.
    const retry = await scan(mo.participant, "S0201-1", null, id);
    expect(retry).toMatchObject({
      duplicate: true,
      moved: { me: first.moved?.me },
    });
    expect(await mod.tokens.verifyParticipantToken(retry.moved!.token)).toEqual(
      there,
    );

    // On batch 3, S0201 is out: a tube of another batch is wrong again.
    const s = await sample("S0201");
    const wrong = await scan(there, "S0002-1", s.id);
    expect(wrong.scan).toMatchObject({ kind: "reject", reason: "other_batch" });
    expect(wrong.moved).toBeUndefined();
    expect((await scan(there, "S0201-2", s.id)).scan).toMatchObject({
      kind: "place",
    });
    await mod.participants.leaveJob(db, there);
  });

  it("lets one person hold each working role on a batch while others wait", async () => {
    const db = mod.db.getDb();
    const job = await mod.jobs.getJobByCode(db, code);
    const join = (
      name: string,
      role: "puller" | "labeler" | "aliquoter" | "overview",
      batchNumber: number,
      attempt?: string,
    ) =>
      mod.participants.joinJob(
        db,
        job.id,
        { name, role, batchNumber, attempt },
        "vitest",
      );
    /** Each person online in a role on a batch, and whether they are waiting. */
    const line = async (role: string, batchNumber: number) =>
      (await mod.jobs.onlineParticipants(db, job.id))
        .filter((p) => p.role === role && p.batchNumber === batchNumber)
        .map((p) => `${p.name}${p.waiting ? " (waiting)" : ""}`);

    // Pat is the Puller on batch 1. Sam joins the same role: nobody is
    // turned away, but Sam waits.
    await join("Sam", "puller", 1);
    expect(await line("puller", 1)).toEqual(["Pat", "Sam (waiting)"]);

    // Another batch is another set of stations, and Overview is never held.
    const tess = await join("Tess", "puller", 2);
    await join("Olive", "overview", 1);
    await join("Omar", "overview", 1);
    expect(await line("puller", 2)).toEqual(["Tess"]);
    expect(await line("overview", 1)).toEqual(["Olive", "Omar"]);

    // When the holder leaves, the next in line has the role at once.
    await join("Uma", "puller", 2);
    await join("Vic", "puller", 2);
    expect(await line("puller", 2)).toEqual([
      "Tess",
      "Uma (waiting)",
      "Vic (waiting)",
    ]);
    await mod.participants.leaveJob(db, tess.participant);
    expect(await line("puller", 2)).toEqual(["Uma", "Vic (waiting)"]);

    // A join that is sent twice is one join: one station, logged once, and
    // not waiting behind itself.
    const attempt = crypto.randomUUID();
    const first = await join("Ray", "aliquoter", 2, attempt);
    const retried = await join("Ray", "aliquoter", 2, attempt);
    expect(retried.participant).toEqual(first.participant);
    expect(retried.events).toEqual([]);
    expect(await line("aliquoter", 2)).toEqual(["Ray"]);
  });

  it("hands a role on when its holder goes, and leaves it there", async () => {
    const db = mod.db.getDb();
    const job = await mod.jobs.getJobByCode(db, code);
    const join = (name: string) =>
      mod.participants.joinJob(
        db,
        job.id,
        { name, role: "labeler", batchNumber: 2 },
        "vitest",
      );
    const line = async () =>
      (await mod.jobs.onlineParticipants(db, job.id))
        .filter((p) => p.role === "labeler" && p.batchNumber === 2)
        .map((p) => `${p.name}${p.waiting ? " (waiting)" : ""}`);
    const events = async () =>
      (await db.select().from(mod.schema.events)).length;
    const row = (who: typeof gail) =>
      eq(mod.schema.participants.id, who.participant.participantId);
    // The few seconds a goodbye takes to count, passed in one step.
    const graceOver = (who: typeof gail) =>
      db
        .update(mod.schema.participants)
        .set({ goneAt: sql`gone_at - interval '10 seconds'` })
        .where(row(who));

    const gail = await join("Gail");
    const hal = await join("Hal");
    expect(await line()).toEqual(["Gail", "Hal (waiting)"]);

    // Gail closes her tab. For a few seconds nothing changes, in case it
    // was a reload. Then she is off the list and Hal has the role. Nothing
    // is written to the log.
    const { seenAt } = await mod.participants.heartbeat(db, gail.participant);
    const logged = await events();
    expect(await mod.participants.goAway(db, gail.participant, seenAt)).toBe(
      true,
    );
    expect(await line()).toEqual(["Gail", "Hal (waiting)"]);
    await graceOver(gail);
    expect(await line()).toEqual(["Hal"]);
    expect(await events()).toBe(logged);

    // Her page comes back. Hal keeps the role; she waits behind him.
    const back = await mod.participants.heartbeat(db, gail.participant);
    expect(back.cameBack).toBe(true);
    expect(await line()).toEqual(["Hal", "Gail (waiting)"]);

    // A goodbye from before she came back arrives late: it is ignored.
    expect(await mod.participants.goAway(db, gail.participant, seenAt)).toBe(
      false,
    );
    await graceOver(gail);
    expect(await line()).toEqual(["Hal", "Gail (waiting)"]);

    // Hal reloads: a goodbye, and his page is back within the grace. He
    // was never offline, and keeps his place.
    const before = await mod.participants.heartbeat(db, hal.participant);
    await mod.participants.goAway(db, hal.participant, before.seenAt);
    const reloaded = await mod.participants.heartbeat(db, hal.participant);
    expect(reloaded.cameBack).toBe(false);
    expect(await line()).toEqual(["Hal", "Gail (waiting)"]);

    // Hal's device dies without a word. Once it has been quiet for longer
    // than the online window, the role passes to Gail, and stays with her
    // when Hal turns up again.
    await db
      .update(mod.schema.participants)
      .set({ lastSeenAt: sql`clock_timestamp() - interval '2 minutes'` })
      .where(row(hal));
    expect(await line()).toEqual(["Gail"]);
    expect(
      (await mod.participants.heartbeat(db, hal.participant)).cameBack,
    ).toBe(true);
    expect(await line()).toEqual(["Gail", "Hal (waiting)"]);
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
