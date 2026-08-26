# Automatic Identical-String Grouping Setting

## Status

Approved for implementation on 2026-08-24.

## Context

Projects need an explicit policy for grouping CAT rows that share identical source text. Existing
projects must remain ungrouped until a project manager opts in. Changing the policy must never
rewrite source strings, translations, approvals, comments, provider records, or saved separation
exceptions.

HL-618 establishes the setting boundary. HL-619 will implement the grouping algorithm and consume
the contract defined here.

## Decision

Store a non-null `automaticallyGroupIdenticalStrings` boolean on each project. Its database default
is `false`, so both existing and new projects start opted out.

Expose a dedicated project CAT-behavior API instead of adding this policy to the general project
metadata update. The API will:

1. return the current setting;
2. preview how many exact-source duplicate groups and occurrences an enable operation would affect;
3. let authorized project managers enable or disable the setting; and
4. return a revision signal that CAT clients can use to detect a grouping-policy change.

The preview performs read-only aggregation over project source strings. An affected group contains
at least two occurrences with exactly equal source text. `affectedOccurrences` counts every string
in those groups, while `groups` counts the groups themselves.

The update changes only the policy and its revision. It does not alter any string, translation,
approval, comment, exception, key, or provider row.

## Authorization

Project managers may preview and change the policy. Other project members may read the current
setting but cannot preview or update it. API authorization remains the source of truth; the UI also
disables controls for unauthorized members.

## Settings experience

Add a **Translation & CAT behavior** section to project settings with an **Automatically group
identical strings** control.

Enabling the control first loads the impact preview and then opens a confirmation dialog. The dialog
shows the estimated occurrence and group counts and states that existing translations will not
change. Disabling opens a confirmation that explains grouped rows will expand while translations,
approvals, comments, and saved separation exceptions remain intact.

The CAT policy saves independently from general project metadata. This prevents an unrelated Save
action from carrying stale policy state.

## Draft-safe refresh contract

HL-618 does not restructure an open CAT queue. Each policy update increments a grouping revision.
HL-619 will compare the workspace revision with the project revision, wait while the workspace has
unsaved drafts, and reload only after the translator saves or discards them.

Disabling the setting follows the same contract. HL-619 will expand grouped rows after the safe
reload without changing persisted translation data or removing separation exceptions.

## Error handling

API routes return resource-keyed success envelopes and stable error envelopes. The settings control
keeps its previous value when preview or update requests fail and shows a concise error toast. The
confirmation cannot submit while a request is pending.

## Tests

Cover:

- the database default and migration;
- preview counts and read-only behavior;
- manager authorization for previews and updates;
- enable and disable responses, including revision changes;
- invariants protecting string, translation, approval, comment, key, and provider data;
- confirmation copy and preview values in the settings UI;
- disabled controls for unauthorized members; and
- loading, success, and failure UI states.

## Alternatives considered

### Extend the general project PATCH endpoint

This requires fewer routes, but couples a sensitive CAT policy to ordinary metadata saves and does
not model preview-before-confirmation cleanly.

### Store CAT settings in a JSON column

This accommodates future settings but weakens database typing and makes accidental whole-object
overwrites more likely. A first-class column is safer for this policy.
