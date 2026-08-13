# Issue Sheet tools for Agent Automation

## Problem

Workspace Agent Automations can run GitHub, Contentful, native TMS, SEO, and
notification tools, but cannot read or file Hyperlocalise Issues. Teams that
already use Issue Sheet need automations to list open work and create issues
from findings.

## Decision

Add two first-class orchestrator tools that call `IssueSheetService`:

| Tool | `toolConfig` key | Plan order |
|------|------------------|------------|
| `list_issues` | `listIssues.enabled` | Before `create_issue` |
| `create_issue` | `createIssue.enabled` | After list / other workflows |

Both require the automation header `projectId` (Issue Sheet is project-scoped).
Both use `automation.authorUserId` as the Issue Sheet actor (reporter / list
viewer). Missing author or project fails the tool with a stable error code.

### `list_issues`

Optional filters (`status`, `issueType`, `priority`, `search`, `limit`,
`offset`). Returns a compact list plus totals so the model can triage without
shipping full column payloads.

### `create_issue`

Accepts `issues: [...]` (max 20). An empty array is a successful no-op so a
forced plan step can skip filing when there is nothing actionable. Each created
issue links to the automation run (`linkKind: agent_run`,
`linkedAgentRunId: run.id`). Persist created IDs in `outputSummary.createIssue`
for idempotent retries.

### UI

Add **List issues** and **Create issue** under Supported tools when the
`workspace-issues` flag is on. Settings rows are enable/remove only; project
comes from the automation header.

## Alternatives considered

1. **Single nested `use_issues` tool** (Semrush-style) — rejected for v1; list
   and create are distinct enablement choices and do not need a nested MCP loop.
2. **Linear / GitHub Issues** — out of scope; Linear remains Coming soon.
3. **Inbound Hyperlocalise MCP tools** — separate surface; not required for
   Agent Automation.

## Out of scope

- Update / comment / assign tools
- Org-wide Issues list (non-project)
- Templates that enable these tools by default
- Changing Linear Coming soon
