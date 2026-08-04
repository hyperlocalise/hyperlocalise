# Agent Glossary Search Guardrails Design

## Date

2026-08-03

## Context

Users reported that Hyperlocalise chat advised keeping product or feature names such as "Talk to Heidi" in English. That default is wrong for teams that localize UI for a native feel. Glossary entries should decide terminology; when a term is missing, the agent should still translate and flag the gap.

Today the conversational agent has Crowdin progress tools but no glossary search tools. Glossary influence on machine translation is passive (context injection). Native glossary FTS tools exist but are unwired. Crowdin also exposes org-level glossary concordance (`POST /glossaries/concordance`) in addition to project-scoped concordance (`POST /projects/{id}/glossaries/concordance`); Hyperlocalise only used the project endpoint.

## Decision

### Scope

- Conversational Hyperlocalise agent only (web chat / chat dock).
- Search-only tools (no glossary CRUD).
- Out of scope: CAT AI recommendation prompts, `translate_string`, and file-job binding prompts.

### Terminology policy

1. Before advising on product, feature, or UI terms, search the appropriate glossary tool.
2. Follow preferred and forbidden glossary hits exactly.
3. If a term is missing, translate for native-like UX and explicitly flag that it is not in the glossary.
4. Do not invent a "keep official names in English" default unless glossary or project context says so.

### Feature flag

Roll out behind WorkOS workspace flag `workspace-glossary-search` (default off). When disabled:

- `glossary-tools` does not activate
- `search_crowdin_glossary` is filtered out of `tms-tools`
- project dynamic instructions omit glossary tool routing

### Tools and skills

| Tool | Skill | Behavior |
|------|-------|----------|
| `search_crowdin_glossary` | `tms-tools` + shared `crowdin` | Default: org-level `POST /glossaries/concordance`. Optional Hyperlocalise `projectId` → project concordance. Gated by `workspace-glossary-search`. |
| `search_native_glossary` | `glossary-tools` (`requiresGlossarySearch`) | Postgres FTS over native (`source = native`) glossaries; prefer project-attached when `projectId` is set. |

### CAT → chat context

Extend chat-dock `cat-segment` page context with project id/name, `projectSource` (`native` \| `external_tms`), and `externalProviderKind`. When chatting from CAT, auto-attach that project to the conversation when unset, and inject dynamic instructions so the agent prefers Crowdin vs native glossary search.

### Routing

| Context | Preferred tool |
|---------|----------------|
| Crowdin-linked project (CAT or conversation) | `search_crowdin_glossary` with `projectId` |
| Crowdin connected, no project | `search_crowdin_glossary` org-level |
| Native project | `search_native_glossary` |
| Unclear | Search both when available; prefer hits over guesses |

### Search result completeness

- Build native FTS candidates with token alternatives so a glossary term can match within a longer source sentence. Require the stored source term to occur in the input, with the term's case-sensitivity setting, before applying the result limit.
- Preserve every Crowdin source and target term for the requested locales. Return each source-target combination with the target term's status and description, falling back to source metadata when needed.

## Consequences

- Chat advice about terminology becomes glossary-backed instead of model heuristics.
- Crowdin glossary lookup works without a Hyperlocalise project via org-level concordance.
- CAT chat sessions carry project and TMS-kind context for better tool choice.
- CAT AI recommend and binding MT paths remain unchanged until a follow-up.