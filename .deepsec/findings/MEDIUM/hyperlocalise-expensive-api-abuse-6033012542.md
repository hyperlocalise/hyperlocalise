# [MEDIUM] String translation LLM calls lack hard output and execution bounds

**File:** [`apps/hyperlocalise-web/src/lib/translation/string-job-executor.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/translation/string-job-executor.ts#L107-L209) (lines 107, 110, 135, 201, 209)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

createStringTranslationGenerator sends the full project/job context, metadata, source text, and all targetLocales to generateText without maxOutputTokens, abortSignal, or a local target locale count cap. The public and project job schemas cap each locale string length but do not cap targetLocales array length, and the API-key job route has no visible rate limiter. A jobs:write API key can enqueue oversized translation jobs that burn provider spend and worker time.

## Recommendation

Set a maximum targetLocales count, add per-API-key/job quotas and rate limits, pass an abortSignal tied to workflow timeout, and configure maxOutputTokens based on bounded input size.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
