# [MEDIUM] File translation uses the platform OpenAI key without per-tenant cost controls

**File:** [`apps/hyperlocalise-web/src/lib/translation/sandbox-translation.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/translation/sandbox-translation.ts#L119-L163) (lines 119, 136, 157, 163)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

getSandboxTranslationEnv injects the global OPENAI_API_KEY into sandbox file translations, and runTranslationCommand invokes the CLI for each requested target locale. Unlike string jobs, this path does not load the organization's encrypted provider credential, and upstream schemas do not cap the number of target locales. A jobs:write API key or admin in any organization can trigger many file translations against the platform key, causing paid API abuse and cross-tenant billing/noise. Shell quoting mitigates command injection here; the issue is the provider credential and cost boundary.

## Recommendation

Use organization-scoped provider credentials for file translation as string jobs do, enforce per-tenant quotas/rate limits, cap targetLocales, and pass timeouts/abort controls through the sandbox workflow.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
