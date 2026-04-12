# Dashboard shell design

## Summary

Add a reusable authenticated app shell under `src/app/(authenticated)/layout.tsx` and place the first mock product surface at `src/app/(authenticated)/dashboard/page.tsx`.

## Why this shape

- Marketing and product surfaces have different jobs and should not share the same route group.
- A route-group layout gives the app a reusable sidebar shell before auth and data wiring are implemented.
- The first page should be a realistic dashboard mock so future backend work can replace data sources without redesigning the route tree.

## UX direction

- Use a calm operations workspace rather than a promotional landing page.
- Keep the layout left-biased with a permanent sidebar and a right content panel.
- Make the top of the page answer four questions quickly: what is shipping, what is blocked, which model is active, and whether TMS sync is healthy.

## Information architecture

- Sidebar navigation links to anchored dashboard sections.
- `/dashboard` contains:
  - quick-glance release summary
  - translation run progress
  - model choice stack
  - TMS sync timeline
  - analytics and release-risk signals

## Implementation notes

- The shell lives in `src/components/app/app-shell.tsx` so future authenticated pages can reuse it.
- The dashboard uses mock data arrays colocated with the page for easy replacement later.
- Styling stays within the existing UI primitives and route-local class composition.
