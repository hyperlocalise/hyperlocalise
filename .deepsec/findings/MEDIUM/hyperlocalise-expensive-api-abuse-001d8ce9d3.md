# [MEDIUM] Duplicate target locales bypass per-job usage accounting for file translations

**File:** [`apps/hyperlocalise-web/src/lib/i18n/project-job-locales.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/i18n/project-job-locales.ts#L72-L129) (lines 72, 73, 74, 84, 102, 103, 119, 122, 129)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The locale validator checks that target locales are valid and allowed, but it never rejects duplicates and returns only `Result<void>`, so callers persist the original target locale array. In the native branch, canonical targets are pushed into `normalizedTargets` but uniqueness is not checked; in the external TMS branch, allowed targets are checked with `includes` and then accepted directly. The create-job routes reserve one `translationJobs` usage event per job, while the file translation workflow iterates `for (const targetLocale of parsedInput.targetLocales)` and runs the sandbox translation for every array element. A caller with job creation access or a `jobs:write` API key can submit the same locale up to the schema limit and trigger repeated paid file translation work while consuming only one quota/billing event.

## Recommendation

Reject duplicate target locales during validation, or return a normalized unique locale list and persist that list. For native projects, compare by canonical locale key; for external TMS projects, compare exact provider locale IDs. Also consider billing/reserving usage by unique target locale or by the actual number of translation operations.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
