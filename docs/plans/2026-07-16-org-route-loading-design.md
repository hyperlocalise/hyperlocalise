# Org route loading UI

## Problem

Authenticated org routes have no route-level loading state. Navigating between
pages under `org/[organizationSlug]` can leave the shell content area blank
until the next page streams in.

## Decision

Add a single org-segment loading boundary with a Suspense reveal animation.

- Place `loading.tsx` at `org/[organizationSlug]/` so every org page shares one
  skeleton while the AppShell stays mounted.
- Exit the skeleton with `slide-down`; enter page content with `slide-up` via
  `template.tsx` (remounts on navigation).
- Do not add directional nav transitions in this change.

## Behavior

1. Client navigations within an org show the shared skeleton immediately.
2. Skeleton exits down; content enters up when the route resolves.
3. Unsupported browsers skip the animation and still show the skeleton.

## Out of scope

Per-page skeletons, cold-start AppShell auth loading, and `nav-forward` /
`nav-back` route transitions.
