-- Migration 0001: initial schema.
--
-- A job is one aliquot workbook (~1,000 source samples in batches of up to
-- 100). `samples` holds each pull-list row together with its current state;
-- that state is a projection of `events`, the append-only log of everything
-- anyone did, and both are written in the same transaction by the actions
-- API (see docs/design.md). The log is protected by triggers: no row in it
-- can ever be updated or deleted, and the table cannot be truncated.
--
-- Apply with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0001_init.sql

BEGIN;

CREATE TABLE jobs (
  id uuid PRIMARY KEY,
  -- 8 letters, no I, L or O (lib/job-code.ts).
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-HJKMNP-Z]{8}$'),
  name text NOT NULL,
  -- Destination set per tube suffix: dest_sets[0] receives "-1" tubes.
  dest_sets jsonb NOT NULL,
  source_filename text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- Bumped once per logged action; clients apply changes in this order.
  version bigint NOT NULL DEFAULT 0
);

CREATE TABLE batches (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES jobs (id),
  number integer NOT NULL,
  box_number integer NOT NULL,
  title text,
  UNIQUE (job_id, number)
);

CREATE TABLE samples (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES jobs (id),
  batch_id uuid NOT NULL REFERENCES batches (id),
  batch_number integer NOT NULL,
  pull_order integer NOT NULL,
  new_id text NOT NULL,
  original_id text NOT NULL,
  source_box text NOT NULL,
  source_location text,
  source_position text,
  slot text NOT NULL,
  volume_note text,
  pulled_at timestamptz,
  pulled_by text,
  labeled_at timestamptz,
  labeled_by text,
  finished_at timestamptz,
  finished_by text,
  returned_at timestamptz,
  returned_by text,
  -- NULL unless skipped; skipped samples queue after the rest, in rank order.
  skip_rank integer,
  -- One entry per destination set: {"status","at","by"}.
  tubes jsonb NOT NULL,
  -- [{"at","by","text"}], newest last.
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (job_id, new_id),
  UNIQUE (batch_id, pull_order),
  UNIQUE (batch_id, slot)
);

CREATE INDEX samples_batch_idx ON samples (batch_id);

CREATE TABLE participants (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES jobs (id),
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('puller', 'labeler', 'aliquoter', 'overview')),
  batch_number integer,
  user_agent text,
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  left_at timestamptz
);

CREATE INDEX participants_job_seen_idx ON participants (job_id, last_seen_at);

CREATE TABLE events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES jobs (id),
  version bigint NOT NULL,
  -- Position within the action that produced it (one action, several events).
  ord smallint NOT NULL,
  -- Server time with microseconds; clock_timestamp() advances within a
  -- transaction, unlike now().
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- The device's clock when the person acted, as reported by the device.
  client_at timestamptz,
  participant_id uuid REFERENCES participants (id),
  actor_name text,
  actor_role text,
  type text NOT NULL,
  batch_number integer,
  sample_id uuid REFERENCES samples (id),
  new_id text,
  tube smallint,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Set on the first event of an action; a retried request is recognized by it.
  client_action_id text,
  UNIQUE (job_id, version, ord)
);

CREATE UNIQUE INDEX events_client_action_idx
  ON events (job_id, client_action_id)
  WHERE client_action_id IS NOT NULL;

CREATE INDEX events_job_id_idx ON events (job_id, id);

CREATE FUNCTION events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'events is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER events_no_update_or_delete
  BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION events_append_only();

CREATE TRIGGER events_no_truncate
  BEFORE TRUNCATE ON events
  FOR EACH STATEMENT EXECUTE FUNCTION events_append_only();

COMMIT;
