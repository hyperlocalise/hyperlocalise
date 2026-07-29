# Automation header project

## Problem

Workspace Automations show a project picker in the header, but that control does
not own a real automation-level project. It writes into tool form fields
(`translationProjectId` / `githubProjectId`), and Contentful keeps a second
Project select under tool settings (`contentfulProjectId`). Saved config stores
separate `toolConfig.*.projectId` values. Users see multiple places to pick a
project; tools should not ask for one.

## Decision

One Hyperlocalise project per automation. Select it only in the header. Every
enabled tool that needs a project uses that same value.

### Storage

Add nullable `project_id` on `workspace_automations`.

Expose top-level `projectId` on create/update/response bodies next to
`triggerConfig`, `repositoryTarget`, and `toolConfig`.

Remove `projectId` from tool schemas:

- `toolConfig.github`
- `toolConfig.contentful`
- `toolConfig.translation`

**Read path.** If `project_id` is null, hoist from legacy tool JSON in this
order: Contentful → translation → GitHub. Return that as `projectId`.

**Write path.** Persist only the top-level column. Strip `projectId` from tool
JSON so old keys do not linger.

### When required

Require `projectId` when any of these need a project:

- Contentful enabled
- Translate enabled
- GitHub sync mode
- Source-upload trigger

GitHub agent-only automations do not require a project (unchanged).

Replace per-tool `*_project_required` validation with one automation-level
check. Route ownership validation checks the single `projectId`.

### UI

- Keep the header project dropdown as the only project control.
- Remove the Contentful tool Project select.
- Form state uses one `projectId` (drop `contentfulProjectId`,
  `translationProjectId`, `githubProjectId`).
- Selecting a project still seeds Contentful source/target locales when those
  are empty or need filtering against the project.
- Show the missing-project validation error under the header, not inside a tool
  row.
- Header visibility stays the same: show when Contentful, Translate, GitHub
  sync, or source-upload needs a project.

### Runtime consumers

- Contentful dispatch and other automation runners read `automation.projectId`.
- GitHub mapping copies the header project into push/pull workflow `projectId`s
  when building repository automation settings.
- Source-upload lookup that filters by translation project queries the new
  column (legacy tool JSON only as a read fallback during transition).

## Alternatives considered

1. **UI-only fan-out** — one header picker that still writes the same id into
   each tool `projectId`. Rejected: tools would still own the field in the
   model, which is what we want to remove.
2. **Keep nested Contentful select, sync from header** — rejected: still looks
   like multiple project pickers.
3. **Collapse form fields without a DB column** — store `projectId` inside
   `tool_config` as a reserved sibling key. Rejected: project is an automation
   concern, not a tool concern; a column matches the header ownership model.

## Out of scope

- GitHub repository automation settings under Integrations (separate push/pull
  project pickers per repo workflow)
- Changing which tools need a project
- Multi-project automations
