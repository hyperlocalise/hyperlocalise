# Crowdin Workspace Automation Tool Design

## Date

2026-08-19

## Context

Workspace Agent Automation already has first-class tools for GitHub review, Semrush, Ahrefs, and web search. Code review automations can inspect repository diffs, but they cannot look up Crowdin translation memory, glossary, or style guidance for the strings in those diffs.

Crowdin already exposes the needed APIs in Hyperlocalise: TM concordance, glossary concordance, project translation context, and AI prompts that carry style-guide instructions. CAT already uses those sources to recommend translations. The missing piece is an automation tool that selects a Crowdin-linked project and queries that evidence during a run.

## Decision

Add a `use_crowdin` workspace orchestrator tool.

### Configuration

The automation stores:

```
toolConfig.crowdin = { enabled: true, projectId }
```

`projectId` is a Hyperlocalise project linked to Crowdin, or an encoded Crowdin project id (`ext:crowdin:{id}`). The editor shows a project picker on the tool card. GitHub-only review automations do not need the header project field.

### Runtime

The orchestrator calls `use_crowdin` with an objective. A nested read-only agent then uses three tools:

1. `search_concordance` — Crowdin glossary and TM matches for source expressions and locales.
2. `get_style_guide` — Hyperlocalise project translation context plus Crowdin AI prompt text that applies to the project.
3. `recommend_translation` — the existing CAT recommendation engine, grounded in concordance and style context.

Place `use_crowdin` after GitHub tools so a code-review digest can supply strings and locales. Combine the Crowdin summary with the GitHub digest when both exist.

### Auth

Reuse the existing Crowdin project credential path, including per-user OAuth when the workspace uses it. Automations pass the automation author as the actor.

## Consequences

- Daily code review can check user-facing strings against approved Crowdin terminology and style.
- The tool stays search-only. It does not write translations back to Crowdin.
- Accounts without Crowdin AI prompts still get project translation context and concordance.
