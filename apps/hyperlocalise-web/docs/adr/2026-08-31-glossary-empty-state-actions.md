# Glossary empty-state actions

## Decision

When a native glossary has no visible concepts, show permission-aware inline actions beneath the empty-state message. Users who can contribute can create a concept, and users who can manage the glossary can import a glossary file. The import action opens the existing upload dialog used by the three-dot actions menu.

## Rationale

An empty glossary needs both supported entry points in the place where users are deciding what to do next. Reusing the existing routes and dialog keeps behavior consistent and avoids a second import flow.

## Constraints

- Keep the existing three-dot menu and its export/import actions unchanged.
- Preserve the current `canContribute` and `canManage` permission checks.
- Do not show actions for provider-backed read-only glossaries.
- Keep provider sync fields internal to provider-backed models. Native glossary UI and
  interchange payloads expose stable concept and term IDs without `external*` fields.
