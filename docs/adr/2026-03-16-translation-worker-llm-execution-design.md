# Translation Worker LLM Execution Design

## Context

The async translation worker already loads queued jobs and writes terminal outcomes, but it still returns placeholder string results and fake file URIs. The repo already has a reusable translator package with multiple LLM providers, so the worker should reuse that path instead of creating a second provider system.

This change only covers `string` jobs. `file` jobs remain deferred.

## Decision

The worker will execute `string` jobs through the existing translator registry in `internal/i18n/translator`.

- Add a worker-side executor that maps one source string and one target locale to `translator.Request`.
- Configure the executor from worker runtime environment variables.
- Allow only remote providers in service mode: `openai`, `azure_openai`, `anthropic`, `gemini`, `bedrock`, `groq`, and `mistral`.
- Reject local providers such as `lmstudio` and `ollama` with a clear configuration error.
- Mark `file` jobs as failed with an explicit unsupported error instead of emitting fake `.todo` output.

## Data Flow

For `string` jobs, the worker now:

1. loads the queued job
2. moves it to `RUNNING`
3. decodes the stored string input
4. calls the executor once per target locale
5. writes a real `string_result` payload on success
6. writes an `error` payload and marks the job `FAILED` on error
7. marks the outbox event as processed after the job reaches a terminal state

## Configuration

The worker runtime gets a process-level LLM profile:

- `TRANSLATION_LLM_PROVIDER`
- `TRANSLATION_LLM_MODEL`
- `TRANSLATION_LLM_SYSTEM_PROMPT` (optional)
- `TRANSLATION_LLM_USER_PROMPT` (optional)

Provider credentials continue to come from the existing provider-specific environment variables already used by `internal/i18n/translator`.

## Deferred Work

- Add job-level provider selection instead of process-level worker configuration.
- Add retries, rate-limit backoff, and quota-aware handling.
- Support `file` jobs with real artifact generation and storage.
- Add richer error classification for provider-specific failures.
