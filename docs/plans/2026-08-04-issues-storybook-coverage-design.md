# Issues Storybook coverage — Design

**Status:** Approved  
**Date:** 2026-08-04

## Summary

Add focused Storybook coverage for Issue Detail and Create Issue. Fix issue-row dates so localized values remain visible at narrow widths.

## Scope

- Add Issue Detail stories for populated, loading, and unavailable states.
- Add Create Issue stories for project-scoped and organization-scoped flows.
- Add grouped-list loading, error, and narrow-row regression stories.
- Reuse the existing Issue Sheet fixtures and MSW handlers.
- Let the date column use its intrinsic width while the issue title truncates.

## Non-goals

- Comprehensive comment, import, custom-column, or validation interaction stories.
- Product behavior or API changes.
- Compact date formatting.

## Implementation

1. Extend Issue Sheet MSW handlers for detail dependencies: assignable members and the issue feed.
2. Add stories for the full detail page and open create dialog.
3. Add missing grouped-list state stories and a narrow viewport regression.
4. Replace the fixed date width with non-wrapping intrinsic sizing.
5. Run `vp test` and `vp check --fix` in `apps/hyperlocalise-web`.

## Success criteria

- Storybook renders Issue Detail without unhandled requests.
- Storybook shows Create Issue in both supported project-selection modes.
- Loading and unavailable detail states have explicit stories.
- Dates remain fully visible in narrow issue rows.
