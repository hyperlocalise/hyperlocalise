# Canva org-level connection and in-app project picker

## Status

Accepted.

## Date

2026-10-13

## Context

[Canva project locales](./2026-10-12-canva-project-locales.md) bound a native
project at connection create time. That forced a project choice in
Integrations before a designer opened Canva, and it deleted the workspace
connection when that project was deleted.

The Canva app also stacked collect, per-locale generate, and apply controls
into a long scrolling panel.

## Decision

1. Create a Canva connection from display name and API key only. `project_id`
   is nullable. Deleting a native project unbinds the connection
   (`ON DELETE SET NULL`); it does not delete the connection.
2. The Canva app lists accessible native projects on the session and binds one
   with `POST /api/integrations/canva/project`. Collect, generate, and apply
   still use the bound connection project. They return `canva_project_not_bound`
   until a project is selected.
3. Locales still come from the live project. There is no second locale list on
   the connection form.
4. The Canva app is one page: project, locale, multi-select pages, then
   Collect or Apply. Apply writes existing translations for the selected
   locale onto the selected pages. Generate stays in Hyperlocalise.
5. Connection tokens are a local-development fallback. The published Canva
   app and production Integrations UI use OAuth only.

## Consequences

- Existing connections that already have a project keep it as the default
  selection in the app.
- OAuth consent lists connections that have not bound a project yet.
- A project without a source locale cannot be bound.
