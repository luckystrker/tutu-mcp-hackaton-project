CREATE TABLE rendezvous.users (
  id uuid PRIMARY KEY,
  telegram_user_id bigint UNIQUE,
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rendezvous.city_catalog (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  country char(2) NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  tz text NOT NULL,
  hub_score integer NOT NULL CHECK (hub_score BETWEEN 0 AND 100),
  tags text[] NOT NULL,
  catalog_version text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rendezvous.trips (
  id uuid PRIMARY KEY,
  organizer_user_id uuid NOT NULL REFERENCES rendezvous.users(id),
  invite_token_hash text NOT NULL UNIQUE,
  title text NOT NULL,
  expected_participants integer NOT NULL CHECK (expected_participants BETWEEN 2 AND 4),
  status text NOT NULL CHECK (status IN ('CREATED','COLLECTING','LIVE','SHORTLIST','FINALIZED','CANCELLED')),
  compute_status text NOT NULL CHECK (compute_status IN ('idle','running','degraded','failed')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  ranking_version integer NOT NULL DEFAULT 0 CHECK (ranking_version >= 0),
  min_together_minutes integer NOT NULL CHECK (min_together_minutes > 0),
  period_from timestamptz NOT NULL,
  period_to timestamptz NOT NULL,
  allow_international boolean NOT NULL DEFAULT false,
  scoring_config jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_from < period_to)
);

CREATE TABLE rendezvous.participants (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES rendezvous.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES rendezvous.users(id),
  origin_city_id uuid REFERENCES rendezvous.city_catalog(id),
  available_from timestamptz,
  must_return_by timestamptz,
  max_budget_minor bigint,
  currency text CHECK (currency IS NULL OR currency = 'RUB'),
  forbidden_modes text[] NOT NULL DEFAULT '{}',
  soft_preferences jsonb NOT NULL DEFAULT '{}',
  ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id),
  CHECK (max_budget_minor IS NULL OR max_budget_minor > 0),
  CHECK (available_from IS NULL OR must_return_by IS NULL OR available_from < must_return_by)
);

CREATE TABLE rendezvous.recompute_jobs (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES rendezvous.trips(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  status text NOT NULL CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','STALE')),
  attempts integer NOT NULL DEFAULT 0,
  run_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  UNIQUE (trip_id, revision)
);
CREATE INDEX recompute_jobs_claim_idx ON rendezvous.recompute_jobs(status, created_at);

CREATE TABLE rendezvous.trip_results (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES rendezvous.trips(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  ranking_version integer NOT NULL,
  algorithm_version text NOT NULL,
  scoring_algorithm_version text NOT NULL,
  source_fetched_at timestamptz NOT NULL,
  degraded boolean NOT NULL,
  solver_output jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, revision, ranking_version)
);

CREATE TABLE rendezvous.destination_results (
  id uuid PRIMARY KEY,
  trip_result_id uuid NOT NULL REFERENCES rendezvous.trip_results(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES rendezvous.city_catalog(id),
  rank integer NOT NULL CHECK (rank > 0),
  score double precision NOT NULL CHECK (score BETWEEN 0 AND 100),
  component_scores jsonb NOT NULL,
  common_time_minutes integer NOT NULL CHECK (common_time_minutes >= 0),
  valid boolean NOT NULL,
  degraded boolean NOT NULL,
  solution_facts jsonb NOT NULL,
  hotels jsonb NOT NULL DEFAULT '[]',
  UNIQUE (trip_result_id, city_id)
);

CREATE TABLE rendezvous.route_selections (
  destination_result_id uuid NOT NULL REFERENCES rendezvous.destination_results(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES rendezvous.participants(id) ON DELETE CASCADE,
  outbound jsonb NOT NULL,
  return_route jsonb NOT NULL,
  burden jsonb NOT NULL,
  PRIMARY KEY (destination_result_id, participant_id)
);

CREATE TABLE rendezvous.route_cache (
  cache_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  stale_until timestamptz NOT NULL
);

CREATE TABLE rendezvous.reactions (
  trip_id uuid NOT NULL REFERENCES rendezvous.trips(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES rendezvous.city_catalog(id),
  user_id uuid NOT NULL REFERENCES rendezvous.users(id),
  value text NOT NULL CHECK (value IN ('love','ok','no')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, city_id, user_id)
);

CREATE TABLE rendezvous.shortlist (
  trip_id uuid NOT NULL REFERENCES rendezvous.trips(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES rendezvous.city_catalog(id),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 3),
  PRIMARY KEY (trip_id, city_id),
  UNIQUE (trip_id, position)
);

CREATE TABLE rendezvous.final_selections (
  trip_id uuid PRIMARY KEY REFERENCES rendezvous.trips(id) ON DELETE CASCADE,
  destination_result_id uuid NOT NULL REFERENCES rendezvous.destination_results(id),
  snapshot jsonb NOT NULL,
  finalized_by uuid NOT NULL REFERENCES rendezvous.users(id),
  finalized_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rendezvous.event_outbox (
  id bigserial PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES rendezvous.trips(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX event_outbox_unpublished_idx ON rendezvous.event_outbox(id) WHERE published_at IS NULL;

CREATE SCHEMA IF NOT EXISTS mastra_workflow;
