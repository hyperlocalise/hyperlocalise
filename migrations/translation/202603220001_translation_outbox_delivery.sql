CREATE TABLE IF NOT EXISTS translation_jobs (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  type text NOT NULL,
  status text NOT NULL,
  input_kind text NOT NULL,
  input_payload jsonb NOT NULL,
  checkpoint_payload jsonb NULL,
  outcome_kind text NULL,
  outcome_payload jsonb NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id text PRIMARY KEY,
  topic text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  headers jsonb NOT NULL,
  status text NOT NULL,
  attempt_count integer NOT NULL,
  max_attempts integer NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  last_error text NULL,
  claimed_by text NOT NULL DEFAULT '',
  claimed_at timestamptz NULL,
  claim_expires_at timestamptz NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  processed_at timestamptz NULL,
  dead_lettered_at timestamptz NULL,
  delivery_status text NOT NULL DEFAULT 'pending',
  delivery_attempt_count integer NOT NULL DEFAULT 0,
  delivery_max_attempts integer NOT NULL DEFAULT 5,
  delivery_next_attempt_at timestamptz NOT NULL DEFAULT NOW(),
  delivery_last_error text NOT NULL DEFAULT '',
  delivery_claimed_by text NOT NULL DEFAULT '',
  delivery_claimed_at timestamptz NULL,
  delivery_claim_expires_at timestamptz NULL,
  published_at timestamptz NULL
);

ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending';
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS delivery_attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS delivery_max_attempts integer NOT NULL DEFAULT 5;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS delivery_next_attempt_at timestamptz NOT NULL DEFAULT NOW();
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS delivery_last_error text NOT NULL DEFAULT '';
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS delivery_claimed_by text NOT NULL DEFAULT '';
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS delivery_claimed_at timestamptz NULL;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS delivery_claim_expires_at timestamptz NULL;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS published_at timestamptz NULL;

UPDATE outbox_events
SET delivery_status = 'published',
    published_at = COALESCE(published_at, processed_at)
WHERE delivery_status = 'pending'
  AND status IN ('processing', 'processed', 'dead_lettered');

CREATE INDEX IF NOT EXISTS idx_translation_jobs_project_created_at
  ON translation_jobs (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbox_events_execution_ready
  ON outbox_events (status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_outbox_events_delivery_ready
  ON outbox_events (delivery_status, delivery_next_attempt_at, created_at);
