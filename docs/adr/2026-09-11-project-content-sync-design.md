# Project content sync

## Date

2026-09-11

## Status

Accepted

## Context

Workspace automations wrap GitHub and Contentful sync in an LLM orchestrator and require instructions. Integrations only store credentials. Operators need one click to move content between a connected source and a Hyperlocalise project, without a prompt.

The CLI ADR already split upload from job creation. GitHub repository automation already uploads sources and opens translation PRs. Contentful still translates inside the webhook agent.

## Decision

Add a workspace automation `kind: "content_sync"`. It lives on the Automations page, scoped to one project. Integrations only connect the account.

### Product

- Enable from `/org/{slug}/projects/{projectId}/automations`.
- One click creates a content-sync automation: no instructions, no model, no tool plan.
- **Pull** copies source into that project. **Push** writes translations that are already ready back to the provider.
- Runs do not create translation jobs.
- GitHub and GitLab write back through a pull request. CMS and Intercom write drafts.
- Folder mapping is required for git: provider folder and project folder. CMS and Intercom use a project folder only.
- Unique on `(projectId, provider, resource, providerFolder)`.
- The Content sync block uses the project-overview mesh stage (seafoam when healthy, dusk when the last run failed or a connection is missing).

### Storage

`workspace_automations` gains `kind`, `sync_config`, and `sync_fingerprint`. Agent automations keep `kind: "agent"`. Content-sync rows store empty instructions and unused model defaults.

`sync_config` holds provider, connection id, resource key, provider folder, project folder, and optional Contentful content type ids.

### Runtime

Content-sync runs use the same run table and enqueue path. Execution skips the orchestrator. Pull and push are separate steps in one run. A failed push leaves imported sources in place.

GitHub reuses the sandbox clone, source upload, and translation PR helpers, filtered by the configured folders. Contentful, GitLab, and Intercom share the same config contract; their executors ship after GitHub.

Provider webhooks and **Sync now** trigger a run. If a repo-level GitHub automation targets the same repository and project, the project content-sync automation wins and the repo-level pair is skipped.

### Out of scope

- Auto-creating translation jobs
- Visual workflow sync nodes
- Publishing CMS entries
- Committing to a git default branch
- Changing kind after create

## Consequences

- The Automations list shows two kinds of rows. The agent editor must not require instructions for content sync.
- Repo-level GitHub automation remains the advanced path.
- Existing Contentful translation automations stay as the translate-in-webhook path.
