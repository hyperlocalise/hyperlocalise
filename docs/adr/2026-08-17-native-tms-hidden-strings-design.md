# Native TMS Hidden Strings

## Context

Crowdin source strings expose `isHidden`. Managers hide strings that should not go to translators, then unhide them later. Our CAT already shows a Hidden badge for Crowdin (and similar) segments. Native TMS keys had no equivalent flag, and the CAT bulk menu only offered approve and skip.

## Decision

Add a persistent `isHidden` flag on native source keys and expose Hide / Unhide as CAT bulk actions, matching Crowdin's manager editor.

1. Store `is_hidden` on `project_translation_keys` (default false). Source re-ingest must not reset it.
2. Map `isHidden` into native CAT segments so the existing Hidden badge appears.
3. Add a native-only CAT bulk action pair: Hide selected and Unhide selected. Hidden remains a source-key property, not per locale.
4. Keep hidden strings visible in the manager CAT queue. Add a Hidden queue filter for native projects.
5. Translation and review jobs skip hidden keys. File-translation prefills copy existing target text or source so the agent does not spend work on them; job persistence does not write new translations for hidden keys.

Do not block editing hidden strings in CAT. Native TMS users are managers; the badge is informational, as with Crowdin credentials.

## Alternatives considered

- Filter hidden strings out of the default CAT queue: wrong for manager workflows that need to see them.
- Store hidden state in CAT overlays or metadata JSON: a first-class column is queryable for jobs and filters.
- Crowdin API bulk hide from this CAT: out of scope. This change is for native TMS; Crowdin already owns hide on its side.

## Testing

- Schema and service coverage that hide/unhide persist across key upsert.
- Native CAT mapping of `isHidden: true`.
- Route coverage for bulk hide/unhide and the Hidden queue filter.
- Job persistence skips hidden keys.
- CAT bulk menu exposes Hide / Unhide for native projects.
