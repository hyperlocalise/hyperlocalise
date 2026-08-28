# Glossary org vs team control

## Date

2026-08-27

## Status

Implemented.

## Context

Translators (the product mapping for “linguist”) need a place to capture new
terms without changing org-wide or external terminology.

Today glossary write is org-wide `glossaries:write` (admin and localization
manager only). Translators have `glossaries:read` only. There is no
org-versus-team policy on a glossary. CAT glossary guidance is read-only.

Control is **org** or **team**. A team glossary is always Hyperlocalise-owned
(`source: native`). External TMS libraries are always org. Product copy should
say org, team, and external — not “native team.”

Linguist maps to the `translator` role. There is no per-glossary ACL and no new
WorkOS capability. Do not grant translators `glossaries:write`.

## User story

As a translator, I want to create team glossaries and add terms there from
native CAT, so that I can capture terminology without changing org-wide or
external glossaries.

### Child stories

1. Translator creates multiple team glossaries from native CAT (no
   one-per-team limit).
2. Translator and teammates add concepts and terms on those team glossaries.
3. Translator adds a term from native CAT to a team glossary attached to the
   project. Live TMS CAT stays read-only for contribution.
4. Localization manager creates org glossaries from `/glossaries` and keeps
   org and external glossaries locked for translators.

## Decision

### Policy

- A glossary is `org` or `team`. Existing Hyperlocalise-owned rows and all
  external rows default to `org`.
- External cannot be `team`. Sync and live list always set `org`.
- Translators may create multiple team glossaries from native CAT, each
  attached to the current native project.
- Teammates may add concepts and terms on any team glossary they can access.
- Workspace **Create glossary** (`/glossaries`) always creates an org
  glossary. Managers with `glossaries:write` use that form. Translators do
  not create glossaries from the list page.
- CAT Add to glossary is native Hyperlocalise projects only. Live TMS CAT
  (Crowdin and other providers) hides Add concept. Native CAT writes only to
  a team glossary attached to the project. If several are attached, the
  translator picks among those team glossaries (default: lowest
  `project_glossaries.priority`). The picker never includes org or external
  libraries.
- If no team glossary is attached, native CAT lets the translator create one
  on the current project. It does not fall back to org or external.
- Translators cannot create, edit, or add terms on org or external glossaries.
- `glossaries:write` still edits org Hyperlocalise-owned glossaries, and
  external glossaries only where the product already allows (live Crowdin
  writable; other providers read-only in-app).
- Control level, archive, import, and org-glossary metadata require
  `glossaries:write`.
- Org and team glossaries stay readable in CAT when attached.

### Out of scope

- Promote team terms into an org glossary
- Per-user ACL
- A new `linguist` role
- Making Phrase, Smartling, or Lokalise writable in-app

### Schema

Add `glossary_control_level` (`org` | `team`) and `control_level` on
`glossaries`, not null, default `org`. Invariant: `control_level = team` only
when `source = native`. Generate the migration with `vp run db:generate`.

Expose `controlLevel` on glossary API records, `toGlossaryRecord`, ephemeral
live Crowdin rows (always `org`), and the glossary list row mapper.

Create payload: optional `controlLevel`. The `/glossaries` form always sends
`org`. Translators may only send `team` (or omit, which means `team`) and
must attach at least one accessible native project. `glossaries:write` may
send `org` or `team` (omit means `org`). Update of `controlLevel` is
`glossaries:write` only.

### Permissions

Replace the single `isGlossaryMutationAllowed` gate with:

- **Manage** — create org glossary; update name, description, source locale,
  control level; archive; delete; import; attach or detach projects.
  Requires `glossaries:write`.
- **Contribute** — create, update, or delete concepts and terms. Requires
  `glossaries:write`, or `translator` on a team glossary the user can access.

Create glossary: `glossaries:write` may create org or team; translator may
create team only (from native CAT, not `/glossaries`). Document the
team-contribute exception in `LOCALIZATION_ROLES.md`. Apply the same helpers
to agent glossary tools.

### Glossary UI

Pass manage vs contribute into the glossary list and detail pages. List live
provider rows as before.

- `/glossaries` Create glossary is org-only. No control-level field. Project
  attach is optional.
- Translators do not see Create glossary on the list page.
- List badges are Org and Team.
- Managers can change control level on Hyperlocalise-owned glossary detail.

Detail: show Add concept / Add term / Save when the user can contribute. Keep
name, import, assigned projects, and control level behind manage. Org and
external glossaries stay read-only for translators.

### CAT Add to glossary

Resolve attached team glossaries on the server (priority order). Pass
`teamGlossaries: { id, name }[]` on CAT workspace context. Prefill source and
target from the active segment. POST `/glossaries/:id/concepts` as a draft
concept. Show Add on native CAT when the user can contribute and translations
are editable. Hide Add on live TMS CAT even if the role can contribute. If
the native project has no team glossary, the translator can create one
attached to that project. Wire the same control in CAT workspace and
side-by-side. Visual editor Add is still unwired.

## Consequences

Translators gain a write path that cannot mutate org or external libraries.
Teammates share team glossaries through existing project-link team scope.
Managers keep full control of org terminology from `/glossaries`. CAT Add
cannot write on live TMS projects or fall back to org or external libraries.

Implementation should cover route tests (translator create/add vs 403 on org),
CAT picker stories, and `vp test` / `vp check --fix` in
`apps/hyperlocalise-web`.
