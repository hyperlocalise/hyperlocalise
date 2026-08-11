# Project Overview as Today queue

## Problem

Project Overview was a soft attention hub that mostly mirrored Files and Jobs.
A coverage-heavy redesign (locale health from file readiness) would force Overview
to load large file lists — expensive for native projects and especially for live
TMS providers that fetch the full provider file set before slicing.

## Decision

**Approach A — Today queue.** Overview is a job-first action surface. It does
**not** load project files or compute locale readiness percentages.

1. **Needs you now** (mesh status stage) — review-first job triage
2. **Project signals** — locale labels (not %), guidance present/missing (native),
   last sync (native)
3. **Deep links** — Files, Jobs, Strings, Settings for heavier work

Coverage stays on **Files**. Workspace Overview stays unchanged.

## Data loaded

| Source | Used for |
|--------|----------|
| Project record | Name, description, locales, guidance, last sync |
| Triage jobs (capped ~5) | Review / failed / in-progress queue |

No files query. No open-job-count query (derive attention from the jobs list).

Native Overview loads jobs with `triage=true` so the API includes `failed` and
orders review → failed → queued/running before applying the cap. TMS lists are
filtered and ranked the same way on the client.

## Triage priority

1. Jobs `waiting_for_review`
2. Jobs `failed`
3. Missing translation guidance (native only)
4. Other open jobs (`queued` / `running`)

Cap ~5 after priority selection. Link to Jobs for the rest.

## Native vs TMS

| Signal | Native | External TMS |
|--------|--------|--------------|
| Job triage | Yes | Yes |
| Translation guidance | Yes (triage if missing; preview if set) | Hidden |
| Last sync / CLI hint | Yes | Hidden |
| Locale labels | Yes (source → targets, not health %) | Yes |

## Mesh

Contained status stage only. Action mesh when triage has items; calm mesh when
clear. Soft scrim for contrast.

## Out of scope

- Locale health chips / file readiness on Overview
- Ready-to-pull file counts (needs Files)
- Overview summary API (Approach B — later if needed)
- Aligning workspace `/dashboard`
