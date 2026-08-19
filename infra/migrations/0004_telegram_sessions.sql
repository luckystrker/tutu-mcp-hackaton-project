ALTER TABLE rendezvous.trips
  ADD COLUMN invite_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days');

CREATE TABLE rendezvous.sessions (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES rendezvous.users(id) ON DELETE CASCADE,
  telegram_auth_date timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_active_token_idx ON rendezvous.sessions(token_hash)
  WHERE revoked_at IS NULL;
