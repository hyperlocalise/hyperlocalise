---
id: glossary-tools
always: true
tools: search_native_glossary
---

## Glossary tools (native)

Use native glossary search before advising on product names, feature names, UI labels, or other terminology for Hyperlocalise-native projects and native glossaries.

### Terminology policy

- Always search before deciding whether a term should stay in English or be translated.
- Follow glossary hits exactly (preferred target form; never use forbidden terms).
- If a term is missing from the glossary, translate for native-like UX and explicitly flag that the term is not in the glossary.
- Do not invent a default of keeping official product or feature names in English unless a glossary entry or project context says so.

### Tool

#### `search_native_glossary`

Search Hyperlocalise-native glossaries (not Crowdin/external TMS).

- Prefer the conversation or CAT project: pass `projectId` when known.
- Provide `sourceLocale` and `targetLocale` for the locale pair under discussion.
- Empty `terms` means the term was not found — translate for native-like UX and flag the gap.
