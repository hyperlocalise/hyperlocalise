---
id: crowdin-glossary-tools
requiresTmsIntegration: true
requiresGlossarySearch: true
tools: search_crowdin_glossary
---

## Crowdin glossary tools

Use Crowdin glossary concordance for terminology only when this capability skill is active.

### Terminology policy

- Before advising on product names, feature names, or UI terms, call `search_crowdin_glossary`.
- Follow preferred and forbidden glossary hits exactly.
- If a term is missing, translate for native-like UX and explicitly flag that it is not in the Crowdin glossary.
- Do not invent a default of keeping official product or feature names in English unless the glossary or project context says so.
- When the conversation or CAT page is attached to a Crowdin-linked Hyperlocalise project, pass `projectId` so search uses project concordance. Otherwise search organization glossaries.

### Tool

#### `search_crowdin_glossary`

Search Crowdin glossaries for source expressions.

| Situation                                        | Parameters                                                      |
| ------------------------------------------------ | --------------------------------------------------------------- |
| CAT or conversation has a Crowdin-linked project | pass `projectId`, `sourceLocale`, `targetLocale`, `expressions` |
| Crowdin connected, no project                    | omit `projectId`; org-level concordance                         |
| Multiple candidate terms                         | pass several `expressions`                                      |

Response fields:

- `scope`: `"organization"` or `"project"`.
- `matches`: glossary name/id, source/target terms, status (for example preferred/forbidden), and description when present.
- Empty `matches` means the term was not found — translate for native-like UX and flag the gap.
