# ADR: Simplify Native Sync CLI — No Manifest, API-Reconstructed Pull

## Status

Accepted

## Context

Native sync (`hyperlocalise sync push` / `sync pull`) currently couples three concerns in the CLI:

1. Upload source files
2. Create translation jobs (AI work)
3. Pass job IDs through a local `jobs.json` manifest for pull

That design made early CI prototyping possible, but it creates poor product behavior:

- Engineers must manage GitHub Actions artifacts between push and pull jobs.
- `sync push` burns translation credits even when the workspace only needs source ingestion (free plan, PM-led workflows).
- The mental model conflicts with Crowdin-style TMS flows: upload content first, dispatch work later.
- GitHub repository automation already implements the desired split: `pushSource` uploads only; `pullTranslations` reconstructs files from API state.

The public API already separates `POST /v1/files` and `POST /v1/jobs`, and pull-without-manifest already exists as a fallback path using `GET /v1/jobs/latest` and `GET /v1/projects/:id/translations/download`.

## Decision

### 1. `sync push` uploads sources only

`sync push` becomes a **content sync** command. It:

- Reads source paths from `i18n.yml`
- Uploads changed files via `POST /v1/files`
- Sends repository metadata (`sourcePath`, `sourceHash`, `commitSha`, `workflowRunId`, etc.)
- Does **not** create translation jobs
- Does **not** write `jobs.json` or any manifest

Exit non-zero only when one or more uploads fail. Partial failure reports list failed paths; successful uploads remain on the server.

### 2. `sync pull` reconstructs local files from API state

`sync pull` becomes a **delivery** command. It:

- Reads target path mappings from `i18n.yml` (same planner used today)
- For each `(sourcePath, locale)` pair, asks the API for the canonical export
- Writes files to resolved local target paths

**Primary export path (only CLI path):**

`GET /v1/projects/:projectId/translations/download?sourcePath=&locale=`

This reconstructs translated content from Hyperlocalise's segment store (AI job output, CAT edits, approved strings). The CLI never reads job IDs.

The server is responsible for resolving the canonical export for each `(sourcePath, locale)` pair, including materialized job outputs when those are newer than segment state.

### 3. Job creation moves to automation

AI translation on sync is **not** a CLI concern. It is configured in the product:

| Surface | Control |
|---------|---------|
| **GitHub repository automation** | Extend workflows with `createTranslationJobs` (or `translateOnUpload`) |
| **Project / workspace automation** | Rule: when source version changes → queue file translation jobs for target locales |
| **Web UI** | PM creates jobs from Files (manual or AI) |

Recommended automation default by plan:

| Plan | On source upload |
|------|------------------|
| Free | Upload only (no auto jobs) |
| Team | Optional automation: create AI jobs for changed files |

CLI users who want fully automated translate-on-merge enable automation in Hyperlocalise settings. CI stays two commands with no manifest plumbing.

### 4. Optional `--wait` on pull (not a manifest)

For CI that must block until work completes:

```bash
hyperlocalise sync push
hyperlocalise sync pull --wait 20m
```

`--wait` polls a server endpoint (new) keyed by `projectId` + `commitSha` (from `GITHUB_SHA` or `--commit-sha`), for example:

`GET /v1/projects/:projectId/sync/status?commitSha=`

Response:

```json
{
  "sync": {
    "sourcesUploaded": 12,
    "jobsQueued": 2,
    "jobsRunning": 1,
    "jobsFailed": 0,
    "exportsReady": 10,
    "state": "ready"
  }
}
```

States: `pending` → `ready` | `failed` | `timeout`. When `ready`, pull proceeds. When `failed`, exit non-zero with job error summary.

This replaces manifest-based job polling without reintroducing local bookkeeping.

## CLI surface (target)

```bash
# Content in
hyperlocalise sync push [--config path] [--locale fr-FR] [--dry-run] [--output text|json|markdown]

# Content out
hyperlocalise sync pull [--config path] [--locale fr-FR] [--wait duration] [--dry-run] [--output ...]
```

Removed:

- `--manifest`
- `hyperlocalise.manifest_path` in `i18n.yml`
- Job creation inside `sync push`
- `complete: false` manifest semantics

`i18n.yml` `hyperlocalise` block retains:

```yaml
hyperlocalise:
  project_id: project_123
  api_base_url: https://hyperlocalise.com/api
  api_key_env: HYPERLOCALISE_API_KEY
  timeout_seconds: 1200   # used by --wait only
```

## CI examples

### Minimal (recommended)

```yaml
on:
  push:
    branches: [main]

jobs:
  localize:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hyperlocalise/hyperlocalise/install@v1
      - run: hyperlocalise sync push
        env:
          HYPERLOCALISE_API_KEY: ${{ secrets.HYPERLOCALISE_API_KEY }}
      - run: hyperlocalise sync pull --wait 30m
        env:
          HYPERLOCALISE_API_KEY: ${{ secrets.HYPERLOCALISE_API_KEY }}
```

No artifacts. No multi-job workflow split.

### Ingest-only (free / PM-led)

```yaml
- run: hyperlocalise sync push
```

PM creates jobs in the web app or via automation schedule. Pull runs on a later schedule or manual dispatch.

### GitHub-native automation (no CLI in repo)

Enable repository automation: push source on merge, create translation jobs via automation rule, pull translations via PR. CLI optional for local dev only.

## API work required

1. **Format-aware export** — `translations/download` today returns JSON from prefilled entries. Extend to emit the source file format (YAML, XLIFF, PO, etc.) using the same serializers as file jobs.
2. **Export resolution** — Server picks newest materialized output: approved segment export vs succeeded job `outputFiles`, keyed by `(projectId, sourcePath, locale, sourceHash)`.
3. **Sync status endpoint** — For `--wait`, aggregate upload + job state for a commit SHA.
4. **Upload idempotency** — Skip/no-op when `sourceHash` unchanged (reduces noise on rerun).

## Web / automation work required

1. **Automation rule: translate on upload** — Project or repo setting triggered after `pushSource` or public file upload.
2. **Files UI** — "Awaiting translation" state for uploaded sources without jobs.
3. **Docs** — Replace manifest-based CI guides.

## Migration

| Old behavior | New behavior |
|--------------|--------------|
| `sync push` creates jobs + writes manifest | `sync push` uploads only |
| `sync pull --manifest jobs.json` | `sync pull` (manifest ignored, then removed) |
| `sync pull` without manifest (fallback) | `sync pull` (primary path) |
| AI on every push | Enable automation in Hyperlocalise settings |

Deprecation:

1. Release with manifest ignored on pull; push still creates jobs behind `--create-jobs` flag for one release.
2. Next release: remove `--create-jobs`; push uploads only.
3. Remove manifest config and ADR `2026-05-10` manifest sections.

## Consequences

**Positive**

- CI workflows match mental model: push sources, pull translations.
- Free tier can sync content without triggering AI.
- Aligns CLI with GitHub repository automation already in production.
- PM controls when translation spend happens.

**Negative**

- Teams relying on manifest-based two-job GHA patterns must simplify workflows (one job or scheduled pull).
- `--wait` requires new API endpoint; until shipped, CI can use scheduled pull or GitHub automation PR flow.
- Format-aware export must be built before non-JSON repos get correct pull output.

## References

- `docs/adr/2026-05-10-hyperlocalise-sync-jobs.md` (superseded manifest flow)
- `apps/hyperlocalise-web/src/lib/agents/github/github-repository-automation-push-source.ts`
- `apps/hyperlocalise-web/src/lib/agents/github/github-repository-automation-pull-translations-export.ts`
- `apps/hyperlocalise-web/src/api/routes/public-translations/public-translations.route.ts`
