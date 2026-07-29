# Dashboard overview UX design

## Problem

The dashboard exposes data as its requests settle. Setup progress jumps through
intermediate percentages, connected integrations have weak visual hierarchy,
live TMS projects do not appear in recent projects, and the jobs preview only
shows assigned work.

## Design

- Keep the setup hero in a structural loading state until project and
  integration checks finish. Render one final setup or workspace state.
- Present integrations as one divided surface. Each row shows a recognizable
  brand mark, a specific title and description, a high-contrast status badge,
  and a clear manage affordance.
- Store a versioned, organization-scoped list of recently opened project IDs
  in local storage. Rank known projects by that history, then fall back to
  server activity.
- Show separate **My jobs** and **Latest jobs** panels. My jobs keeps assigned
  relationship semantics; Latest jobs shows recent workspace activity.
- When an active TMS integration exists, fetch live provider resources and add
  dedicated **TMS jobs** and **TMS projects** panels. Do not query or render
  those panels without an active connection.

## Data and error behavior

Local storage contains project IDs and visit timestamps only. Invalid or stale
entries are ignored, and unavailable projects fall out when results are
reconciled. If one project source succeeds, the dashboard shows that partial
result instead of replacing it with a global error.

## Verification

Add focused tests for recent-project persistence and ranking, dashboard model
mapping, stable loading states, integration hierarchy, and both job panels.
Run the dashboard tests, then `vp test` and `vp check --fix` from
`apps/hyperlocalise-web`.
