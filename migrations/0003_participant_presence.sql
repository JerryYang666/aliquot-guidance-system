-- Migration 0003: stations that say goodbye, and a place in line for a role.
--
-- A batch has one Puller, one Labeler and one Aliquoter at work at a time.
-- Someone who joins a role that is taken waits, their screen locked, until
-- the one ahead of them has gone. Two things were missing for that.
--
-- `gone_at`: a station was only known to be gone once the server had not
-- heard from it for over a minute. Its page now says goodbye as it goes
-- (tab closed, reload), and this records when. Unlike `left_at` it is not
-- final and is not logged: a page that comes back is heard from again and
-- the mark is cleared.
--
-- `queued_at`: who holds a role is whoever has been there longest. That is
-- counted from joining, and again from each return after being offline, so
-- a station that drops out and comes back does not push aside the one who
-- took over meanwhile.
--
-- Apply with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0003_participant_presence.sql

BEGIN;

ALTER TABLE participants
  ADD COLUMN gone_at timestamptz,
  ADD COLUMN queued_at timestamptz NOT NULL DEFAULT clock_timestamp();

COMMIT;
