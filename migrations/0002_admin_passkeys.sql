-- Migration 0002: admins, who sign in with passkeys.
--
-- A job is open to whoever holds its code, and nothing could list the jobs.
-- Admins can: they sign in with a passkey (WebAuthn) and see every job. There
-- are no passwords and no open sign-up. A passkey is added through an invite
-- link that works once and expires minutes after it is made. An admin makes
-- the links; the first one is seeded with scripts/admin-invite-sql.ts
-- (see docs/deploy.md).
--
-- Apply with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0002_admin_passkeys.sql

BEGIN;

CREATE TABLE admin_passkeys (
  id uuid PRIMARY KEY,
  -- Whose passkey this is, as they typed it when adding it.
  name text NOT NULL,
  -- The WebAuthn credential ID and COSE public key, both base64url.
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  -- The authenticator's signature counter; synced passkeys always report 0.
  counter bigint NOT NULL DEFAULT 0,
  transports jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_used_at timestamptz,
  -- Set when an admin removes the passkey; it can no longer sign in.
  revoked_at timestamptz,
  revoked_by uuid REFERENCES admin_passkeys (id)
);

CREATE TABLE admin_invites (
  id uuid PRIMARY KEY,
  -- SHA-256 (hex) of the token in the link. The token itself is not stored.
  token_hash text NOT NULL UNIQUE,
  -- NULL for an invite seeded by hand.
  created_by uuid REFERENCES admin_passkeys (id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  -- Set, with the passkey it added, when the link is used. It works once.
  used_at timestamptz,
  used_by uuid REFERENCES admin_passkeys (id)
);

COMMIT;
