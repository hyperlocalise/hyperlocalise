CREATE TABLE translation_config_snapshots (
    id TEXT PRIMARY KEY,
    checksum TEXT NOT NULL UNIQUE,
    provider_profile TEXT NOT NULL,
    provider_family TEXT NOT NULL,
    model_id TEXT NOT NULL,
    prompt_template_version TEXT NOT NULL,
    glossary_resolved_version TEXT NOT NULL DEFAULT '',
    style_guide_resolved_version TEXT NOT NULL DEFAULT '',
    segmentation_strategy_version TEXT NOT NULL,
    validation_policy_version TEXT NOT NULL,
    generation_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE translation_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    source_locale TEXT NOT NULL,
    target_locale TEXT NOT NULL,
    item_count INTEGER NOT NULL DEFAULT 0,
    config_snapshot_id TEXT NOT NULL REFERENCES translation_config_snapshots(id),
    idempotency_key TEXT NOT NULL DEFAULT '',
    dedupe_checksum TEXT NOT NULL,
    error_code TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX translation_jobs_dedupe_idx
    ON translation_jobs (project_id, target_locale, idempotency_key, dedupe_checksum)
    WHERE idempotency_key <> '';

CREATE TABLE translation_job_inputs (
    job_id TEXT PRIMARY KEY REFERENCES translation_jobs(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,
    inline_payload_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    artifact_input_uri TEXT NOT NULL DEFAULT '',
    artifact_path TEXT NOT NULL DEFAULT '',
    artifact_content_type TEXT NOT NULL DEFAULT '',
    parser_hint TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE translation_segments (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES translation_jobs(id) ON DELETE CASCADE,
    segment_key TEXT NOT NULL,
    source_text TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL,
    status TEXT NOT NULL,
    output_text TEXT NOT NULL DEFAULT '',
    error_code TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    dispatched_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX translation_segments_job_order_idx
    ON translation_segments (job_id, order_index);

CREATE TABLE translation_segment_attempts (
    id TEXT PRIMARY KEY,
    segment_id TEXT NOT NULL REFERENCES translation_segments(id) ON DELETE CASCADE,
    retry_number INTEGER NOT NULL,
    status TEXT NOT NULL,
    provider_profile TEXT NOT NULL,
    latency_ms BIGINT NOT NULL DEFAULT 0,
    token_usage_input INTEGER NOT NULL DEFAULT 0,
    token_usage_output INTEGER NOT NULL DEFAULT 0,
    error_code TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX translation_segment_attempts_segment_retry_idx
    ON translation_segment_attempts (segment_id, retry_number);

CREATE TABLE translation_job_artifacts (
    job_id TEXT NOT NULL REFERENCES translation_jobs(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    uri TEXT NOT NULL,
    checksum TEXT NOT NULL,
    content_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (job_id, kind, uri)
);
