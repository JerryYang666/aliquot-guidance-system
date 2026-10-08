-- Migration 0004: an admin can archive a job.
--
-- A job's code works for as long as the job exists, so a finished job could
-- still be joined by anyone who kept its code or its QR code. An admin can
-- now archive a job: from then on nobody new can join it, and the people
-- already on it carry on. `archived_at` is when that happened; NULL means
-- the job is open. Reopening sets it back to NULL. Who did either, and
-- when, is in the job's event log.
--
-- Apply with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0004_job_archived.sql

BEGIN;

ALTER TABLE jobs ADD COLUMN archived_at timestamptz;

COMMIT;
