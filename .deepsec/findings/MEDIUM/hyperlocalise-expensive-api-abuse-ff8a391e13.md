# [MEDIUM] File translation uses the platform OpenAI key without per-tenant cost controls

**File:** [`apps/hyperlocalise-web/src/lib/translation/sandbox-translation.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/translation/sandbox-translation.ts#L119-L163) (lines 119, 136, 157, 163)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `29139614+renovate[bot]@users.noreply.github.com` _(via last-committer)_

## Finding

getSandboxTranslationEnv injects the global OPENAI_API_KEY into sandbox file translations, and runTranslationCommand invokes the CLI for each requested target locale. Unlike string jobs, this path does not load the organization's encrypted provider credential, and upstream schemas do not cap the number of target locales. A jobs:write API key or admin in any organization can trigger many file translations against the platform key, causing paid API abuse and cross-tenant billing/noise. Shell quoting mitigates command injection here; the issue is the provider credential and cost boundary.

## Recommendation

Use organization-scoped provider credentials for file translation as string jobs do, enforce per-tenant quotas/rate limits, cap targetLocales, and pass timeouts/abort controls through the sandbox workflow.

## Revalidation

**Verdict:** true-positive

The current sandbox translation config hardcodes provider: openai and model: gpt-5.4-mini in buildTempConfig. getSandboxTranslationEnv still returns env.OPENAI_API_KEY, so file translation jobs use the platform OpenAI key rather than loading the organization's encrypted provider credential. fileTranslationJobWorkflow imports getSandboxTranslationEnv and passes it to the sandbox command for each target locale via runTranslationStep. The public and project job schemas now cap targetLocales at 20, so one part of the original description is mitigated, but the cost boundary is still wrong: each accepted file job can run up to 20 CLI translations against the shared key. The public API path requires jobs:write and validates that the source file belongs to the API key's organization, but that is authorization for creating work, not per-tenant billing isolation. reserveUsageEvent records one translation job and later usage tracking, but it does not prevent repeated file jobs or meter actual provider spend before execution. A jobs:write API key holder can therefore upload a valid source file and enqueue repeated file translation jobs that consume the platform OpenAI account instead of their own organization credential.

## Recent committers (`git log`)

- renovate[bot] <29139614+renovate[bot]@users.noreply.github.com> (2026-05-27)
- Minh Cung <cungminh2710@gmail.com> (2026-05-23)
