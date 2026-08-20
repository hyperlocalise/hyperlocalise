# Localisation audit re-run company profile backfill

## Goal

When a public localisation audit is re-run, fetch a missing company cover (logo, product summary, brand voice, industry) and write it onto the stored teaser and report.

## Why

Daily re-runs keep the prior public report until the new analysis completes. Scoring can fail after a successful crawl. Legacy rows created before company profiles existed then stay on a domain-only cover even though the crawl had the evidence.

## Behaviour

1. After crawl, infer a company profile from homepage signals (same path as a first run).
2. Merge with any stored profile: use new values when present, keep stored values for gaps.
3. If the stored profile is missing or incomplete, patch `teaser` and `report` JSON before scoring. Status does not change.
4. If scoring later fails, restore-succeeded still has the patched cover.
5. If scoring succeeds, the new teaser and report include the merged profile.

Do not start a full re-run only to fill a cover. This runs as part of an already claimed re-run.

## Testing

- Merge and incomplete-profile helpers.
- Store patch is attempt-guarded and survives fail-restore.
- Analyze patches before scoring, including when scoring throws.
