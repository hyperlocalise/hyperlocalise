# ADR: Route Sync Push and Pull Through Hyperlocalise Jobs

## Status

Accepted

## Context

`hyperlocalise sync push` and `hyperlocalise sync pull` currently use the storage adapter interface. That interface fits direct TMS synchronization, but CI/CD job execution needs a durable Hyperlocalise job record. A CI workflow also needs to pass job state from one GitHub Actions job to another without committing generated metadata or opening a pull request only to store bookkeeping.

We still need provider-specific commands such as `hyperlocalise crowdin ...` and `hyperlocalise phrase ...`. Those commands may keep their TMS-specific config and behavior.

## Decision

`sync push` and `sync pull` will use the Hyperlocalise web API. They will not load a TMS storage adapter.

The i18n config gets a separate `hyperlocalise` block:

```yaml
hyperlocalise:
  project_id: project_123
  api_base_url: https://hyperlocalise.com/api
  api_key_env: HYPERLOCALISE_API_KEY
  manifest_path: .hyperlocalise/jobs.json
```

The existing `storage` block remains available for TMS adapter configuration and provider-specific commands. It is not the execution path for `sync push` or `sync pull`.

`sync push` submits source files to the public Hyperlocalise API and creates translation jobs. It writes a manifest only after submission succeeds. If submission fails after creating some jobs, it writes a partial manifest with `complete: false` and exits non-zero.

`sync pull` consumes a complete manifest, polls job IDs, downloads output files, and writes them to the target paths resolved from `i18n.yml`. It rejects incomplete manifests.

## Flow

```text
                 GitHub Actions workflow

   +----------------------+          +----------------------+
   | job: hyperlocalise   |          | job: hyperlocalise   |
   |      push            |          |      pull            |
   +----------+-----------+          +----------+-----------+
              |                                 ^
              | upload source files             |
              v                                 |
   +----------------------+                     |
   | Hyperlocalise API    |                     |
   | POST /v1/files       |                     |
   +----------+-----------+                     |
              |                                 |
              | create translation jobs         |
              v                                 |
   +----------------------+                     |
   | Hyperlocalise API    |                     |
   | POST /v1/jobs        |                     |
   +----------+-----------+                     |
              |                                 |
              | job IDs                         |
              v                                 |
   +----------------------+    upload/download  |
   | jobs.json manifest   +---------------------+
   | GHA artifact         |
   +----------------------+
                                                |
                                                | poll job IDs
                                                v
                                     +----------------------+
                                     | Hyperlocalise API    |
                                     | GET /v1/jobs/:id     |
                                     +----------+-----------+
                                                |
                                                | download output files
                                                v
                                     +----------------------+
                                     | target translation   |
                                     | files in workspace   |
                                     +----------------------+
```

## Failure Policy

Partial push is recoverable, but never consumable.

If `sync push` fails, CI should upload the partial manifest as a diagnostic artifact and skip `sync pull`. A later rerun can submit the same source paths and hashes again. The server can use job metadata and idempotency keys to reuse existing jobs instead of creating duplicates.

If artifact upload fails after a successful push, the pull job cannot proceed in the same workflow. A later enhancement can allow `sync pull` to discover a submission server-side by repository, commit SHA, workflow run ID, and run attempt.

## Consequences

- CI jobs can pass the manifest through GitHub Actions artifacts without repository writes.
- Job IDs remain the execution handle for polling, retry, audit, and output download.
- File paths remain the write targets and human-readable identity.
- TMS commands keep their own adapter-specific behavior.
- `storage` and `hyperlocalise` have separate responsibilities, which avoids overloading one config block.
