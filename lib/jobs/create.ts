/**
 * Turns parsed workbook data into the rows of a new job. The create API runs
 * the inserts in a transaction; scripts/workbook-to-seed-sql.ts renders the
 * very same statements as a standalone SQL file.
 */
import type { Query } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/lib/db/schema";
import type { TubeState } from "@/lib/pipeline/types";
import type { ParsedWorkbook } from "@/lib/workbook/model";

export interface NewJobInput {
  code: string;
  name: string;
  createdBy: string;
  sourceFilename: string | null;
  workbook: ParsedWorkbook;
}

/** An insert that can run (await it) or be rendered (`toSQL`). */
export interface Statement extends PromiseLike<unknown> {
  toSQL(): Query;
}

const SAMPLE_CHUNK = 500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema, any driver
type AnyPgDatabase = PgDatabase<PgQueryResultHKT, any>;

export function buildJobInserts(db: AnyPgDatabase, input: NewJobInput) {
  const jobId = crypto.randomUUID();
  const { workbook } = input;
  const pendingTubes: TubeState[] = workbook.destSets.map(() => ({
    status: "pending",
    at: null,
    by: null,
  }));

  const batchRows: (typeof schema.batches.$inferInsert)[] = [];
  const sampleRows: (typeof schema.samples.$inferInsert)[] = [];
  for (const batch of workbook.batches) {
    const batchId = crypto.randomUUID();
    batchRows.push({
      id: batchId,
      jobId,
      number: batch.number,
      boxNumber: batch.boxNumber,
      title: null,
    });
    for (const s of batch.samples) {
      sampleRows.push({
        id: crypto.randomUUID(),
        jobId,
        batchId,
        batchNumber: batch.number,
        pullOrder: s.pullOrder,
        newId: s.newId,
        originalId: s.originalId,
        sourceBox: s.sourceBox,
        sourceLocation: s.sourceLocation,
        sourcePosition: s.sourcePosition,
        slot: s.slot,
        volumeNote: s.volumeNote,
        tubes: pendingTubes,
        notes: [],
      });
    }
  }

  const statements: Statement[] = [
    db.insert(schema.jobs).values({
      id: jobId,
      code: input.code,
      name: input.name,
      destSets: workbook.destSets,
      sourceFilename: input.sourceFilename,
      createdBy: input.createdBy,
      version: 1,
    }),
    db.insert(schema.batches).values(batchRows),
  ];
  for (let i = 0; i < sampleRows.length; i += SAMPLE_CHUNK) {
    statements.push(
      db.insert(schema.samples).values(sampleRows.slice(i, i + SAMPLE_CHUNK)),
    );
  }
  statements.push(
    db.insert(schema.events).values({
      jobId,
      version: 1,
      ord: 0,
      actorName: input.createdBy,
      type: "job_created",
      data: {
        name: input.name,
        sourceFilename: input.sourceFilename,
        destSets: workbook.destSets,
        batches: workbook.batches.length,
        samples: sampleRows.length,
      },
    }),
  );
  return { jobId, statements };
}
