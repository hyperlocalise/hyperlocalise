# Workspace Issues feature flag

## Problem

Issues (org Issues page, project Issue Sheet, CAT “Add to Issue Sheet”) is
always visible. We need a WorkOS workspace flag so orgs can enable the product
when ready.

## Decision

Add `workspace-issues` and gate the product the same way as Knowledge
(Approach A: nav, pages, APIs, and CAT).

## Flag

- Key: `workspace-issues`
- Source: WorkOS Feature Flags via existing `workosAdapter`
- Default: `false` (fail closed)
- No DB migration; toggle in WorkOS (optional Flags Explorer discovery)

## Surfaces

| Surface | When disabled |
|---------|---------------|
| Workspace sidebar **Issues** | Hidden (`featureFlagKey`) |
| Project sidebar **Issue Sheet** | Hidden (filter project nav with stored flags) |
| `/org/.../issues` | Redirect to dashboard `?reason=feature-unavailable` |
| `/org/.../projects/.../issue-sheet` | Same redirect |
| Org issues + project issue-sheet APIs | `403` / `feature_unavailable` |
| CAT **Add to Issue Sheet** | Handler omitted so buttons do not render |

## Implementation notes

1. Extend `WorkspaceFeatureFlagState` with `issues` and evaluate
   `workspaceIssuesFlag` in `evaluateWorkspaceFeatureFlags`.
2. Pass flags from `AppShell` into `AppShellStore` so project nav and CAT can
   read them without a second evaluation.
3. Filter project nav items with the same `featureFlagKey` rules as global nav.
4. Reuse `requireWorkspaceFeatureFlag` on pages; Knowledge-style middleware on
   API routes.

## Out of scope

CAT queue `has_issues`, TMS provider issues, Format & QA issue counts, and
in-app flag admin UI.
