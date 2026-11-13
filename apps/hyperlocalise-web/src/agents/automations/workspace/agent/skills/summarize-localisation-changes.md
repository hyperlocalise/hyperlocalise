---
id: summarize-localisation-changes
name: Summarise localisation changes
---

## Summarise localisation changes

Write a concise digest of localisation-related changes in the repository so the team can stay aligned without reading every commit.

- Read the commits, diffs and surrounding files for the changes in scope.
- If `i18n.yml` exists, run Hyperlocalise validation (`hl check`) against the translation files it maps.
- Keep the digest scoped to localisation, i18n, and translation work.
- Cite commit SHAs and file paths for specific claims.
- Call out coverage gaps, ICU or placeholder risk, and incomplete translation syncs.
- Ignore unrelated feature, infrastructure, and formatting work unless it changes user-facing copy or locale files.

Digest focus:

- New or updated source strings and message catalogs
- Translation file, locale resource, and coverage changes
- ICU, placeholder, glossary, and i18n config updates
- Localisation-related PRs, syncs, and release risks
