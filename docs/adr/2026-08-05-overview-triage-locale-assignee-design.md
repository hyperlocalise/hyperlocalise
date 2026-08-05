# Overview triage: locale and assignee meta

## Problem

Project Overview **Needs you now** job rows show title, status, and CTA only.
Locale and assignee sit in empty horizontal space, so triage needs a click into
the job for context the Jobs list already surfaces.

## Decision

Add a third muted meta line under status on job triage rows, using the existing
`taskDetailSummary` helper from the Jobs module (`locales · assignees`).

- Show the line only when the summary has real data (omit “No locales or assignees”).
- Leave guidance rows unchanged (no job payload).
- Do not change triage queries, caps, or CTA layout.

## Row shape

1. Job title  
2. Status (`Waiting for review` / `Job failed` / `In progress`)  
3. Meta (`fr-FR · Mina`) when present  
4. CTA (`Review` / `Open job`)

## Data

Reuse `ApiJob` fields already loaded for Overview triage:

- Locales: `externalTargetLocales`, else `reviewTargetLocale`
- Assignees: `externalAssignedUsers`

No API or query changes.

## Out of scope

- Middle-column layout for locale/assignee
- Expanding `taskDetailSummary` for native `inputPayload.targetLocales` or owner
- Jobs list UI changes
