/**
 * Drizzle mirror of migrations/*.sql. The SQL files are the source of truth
 * and are applied by hand; keep this file in step with them.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { Note, TubeState } from "@/lib/pipeline/types";

const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "string" });

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  destSets: jsonb("dest_sets").$type<string[]>().notNull(),
  sourceFilename: text("source_filename"),
  createdBy: text("created_by").notNull(),
  createdAt: ts("created_at")
    .notNull()
    .default(sql`clock_timestamp()`),
  version: bigint("version", { mode: "number" }).notNull().default(0),
  archivedAt: ts("archived_at"),
});

export const batches = pgTable(
  "batches",
  {
    id: uuid("id").primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    number: integer("number").notNull(),
    boxNumber: integer("box_number").notNull(),
    title: text("title"),
  },
  (t) => [unique().on(t.jobId, t.number)],
);

export const samples = pgTable(
  "samples",
  {
    id: uuid("id").primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id),
    batchNumber: integer("batch_number").notNull(),
    pullOrder: integer("pull_order").notNull(),
    newId: text("new_id").notNull(),
    originalId: text("original_id").notNull(),
    sourceBox: text("source_box").notNull(),
    sourceLocation: text("source_location"),
    sourcePosition: text("source_position"),
    slot: text("slot").notNull(),
    volumeNote: text("volume_note"),
    pulledAt: ts("pulled_at"),
    pulledBy: text("pulled_by"),
    labeledAt: ts("labeled_at"),
    labeledBy: text("labeled_by"),
    finishedAt: ts("finished_at"),
    finishedBy: text("finished_by"),
    returnedAt: ts("returned_at"),
    returnedBy: text("returned_by"),
    skipRank: integer("skip_rank"),
    tubes: jsonb("tubes").$type<TubeState[]>().notNull(),
    notes: jsonb("notes").$type<Note[]>().notNull().default([]),
  },
  (t) => [
    unique().on(t.jobId, t.newId),
    unique().on(t.batchId, t.pullOrder),
    unique().on(t.batchId, t.slot),
  ],
);

export const participants = pgTable("participants", {
  id: uuid("id").primaryKey(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id),
  name: text("name").notNull(),
  role: text("role").$type<Role>().notNull(),
  batchNumber: integer("batch_number"),
  userAgent: text("user_agent"),
  joinedAt: ts("joined_at")
    .notNull()
    .default(sql`clock_timestamp()`),
  lastSeenAt: ts("last_seen_at")
    .notNull()
    .default(sql`clock_timestamp()`),
  leftAt: ts("left_at"),
  goneAt: ts("gone_at"),
  queuedAt: ts("queued_at")
    .notNull()
    .default(sql`clock_timestamp()`),
});

export const events = pgTable(
  "events",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    version: bigint("version", { mode: "number" }).notNull(),
    ord: smallint("ord").notNull(),
    at: ts("at")
      .notNull()
      .default(sql`clock_timestamp()`),
    clientAt: ts("client_at"),
    participantId: uuid("participant_id").references(() => participants.id),
    actorName: text("actor_name"),
    actorRole: text("actor_role"),
    type: text("type").notNull(),
    batchNumber: integer("batch_number"),
    sampleId: uuid("sample_id").references(() => samples.id),
    newId: text("new_id"),
    tube: smallint("tube"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    clientActionId: text("client_action_id"),
  },
  (t) => [unique().on(t.jobId, t.version, t.ord)],
);

export const adminPasskeys = pgTable("admin_passkeys", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: bigint("counter", { mode: "number" }).notNull().default(0),
  transports: jsonb("transports").$type<string[]>().notNull().default([]),
  createdAt: ts("created_at")
    .notNull()
    .default(sql`clock_timestamp()`),
  lastUsedAt: ts("last_used_at"),
  revokedAt: ts("revoked_at"),
  revokedBy: uuid("revoked_by").references((): AnyPgColumn => adminPasskeys.id),
});

export const adminInvites = pgTable("admin_invites", {
  id: uuid("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  createdBy: uuid("created_by").references(() => adminPasskeys.id),
  createdAt: ts("created_at")
    .notNull()
    .default(sql`clock_timestamp()`),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  usedBy: uuid("used_by").references(() => adminPasskeys.id),
});

export type Role = "puller" | "labeler" | "aliquoter" | "overview";
export type JobRow = typeof jobs.$inferSelect;
export type BatchRow = typeof batches.$inferSelect;
export type SampleRow = typeof samples.$inferSelect;
export type ParticipantRow = typeof participants.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type AdminPasskeyRow = typeof adminPasskeys.$inferSelect;
