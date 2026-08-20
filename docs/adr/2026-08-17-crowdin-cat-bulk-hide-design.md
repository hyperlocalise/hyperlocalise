# Crowdin CAT Bulk Hide

## Context

Crowdin source strings expose `isHidden`. Managers hide strings so translators do not see them, then unhide later. Our CAT already shows a Hidden badge for Crowdin segments. The queue bulk menu only offered approve and skip, so managers still had to hide strings in Crowdin.

## Decision

Add Hide selected / Unhide selected as Crowdin CAT bulk actions, and a Hidden queue filter.

1. Call Crowdin `PATCH /projects/{id}/strings` with `replace` on `/{stringId}/isHidden`.
2. Expose `POST .../files/detail/cat/strings/hidden` for Crowdin live CAT. Other TMS providers stay unsupported.
3. Show Hide / Unhide in the CAT bulk menu when the file is Crowdin and the user can edit translations.
4. Keep hidden strings visible in the manager CAT. Add a Hidden filter via Crowdin CROQL `is hidden`.
5. Hidden remains a source-string property, not per locale.

Do not block editing hidden strings. Managers using CAT with Crowdin credentials should still translate them; the badge stays informational.

## Alternatives considered

- Filter hidden strings out of the default CAT queue: wrong for manager workflows that need to see them.
- Per-segment hide in the editor header only: bulk hide is the Crowdin manager workflow we are matching.
- Native TMS hide in this change: originally out of scope. Native keys now live on main (`feat(native-tms): add hidden strings and CAT bulk hide`); this work adds Crowdin live CAT beside that path.

## Testing

- Crowdin API client coverage for batch `isHidden` replace, including chunking.
- Live CAT coverage that hide/unhide PATCHes Crowdin string IDs.
- Route coverage for Crowdin success and unsupported providers/native projects.
- CAT bulk menu and Hidden filter coverage for Crowdin.
