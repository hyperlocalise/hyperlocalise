CREATE TABLE IF NOT EXISTS translation_projects (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  translation_context text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS translation_jobs (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES translation_projects(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS translation_file_uploads (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES translation_projects(id) ON DELETE CASCADE,
  path text NOT NULL,
  file_format text NOT NULL,
  source_locale text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NULL,
  checksum_sha256 text NOT NULL DEFAULT '',
  storage_driver text NOT NULL,
  bucket text NOT NULL,
  object_key text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  finalized_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS translation_files (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES translation_projects(id) ON DELETE CASCADE,
  path text NOT NULL,
  file_format text NOT NULL,
  source_locale text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  checksum_sha256 text NOT NULL DEFAULT '',
  storage_driver text NOT NULL,
  bucket text NOT NULL,
  object_key text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS translation_file_variants (
  id text PRIMARY KEY,
  file_id text NOT NULL REFERENCES translation_files(id) ON DELETE CASCADE,
  locale text NOT NULL,
  path text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  checksum_sha256 text NOT NULL DEFAULT '',
  storage_driver text NOT NULL,
  bucket text NOT NULL,
  object_key text NOT NULL,
  last_job_id text NOT NULL DEFAULT '',
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_translation_projects_created_at
  ON translation_projects (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_translation_jobs_project_created_at
  ON translation_jobs (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbox_events_execution_ready
  ON outbox_events (status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_outbox_events_delivery_ready
  ON outbox_events (delivery_status, delivery_next_attempt_at, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_translation_files_project_path
  ON translation_files (project_id, path);

CREATE INDEX IF NOT EXISTS idx_translation_files_project_path_prefix
  ON translation_files (project_id, path);

CREATE UNIQUE INDEX IF NOT EXISTS idx_translation_file_variants_file_locale
  ON translation_file_variants (file_id, locale);
