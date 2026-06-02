# [MEDIUM] Push automation idempotency trusts an unsigned webhook header

**File:** [`apps/hyperlocalise-web/src/lib/agents/github/github-repository-automation-idempotency.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/github/github-repository-automation-idempotency.ts#L6-L26) (lines 6, 26)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `rate-limit-bypass`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

Push automation uses only `x-github-delivery` as the idempotency key (`push:${deliveryId}`), and skipped jobs hash the same header with the skip reason. GitHub webhook signature verification covers the request body, not this header. If a valid signed webhook body is replayed with a different `x-github-delivery` value, the body still verifies but `claimGithubRepositoryAutomationJob` sees a new idempotency key and can enqueue duplicate automation for the same push. That can repeat expensive translation/agent work and side effects such as check runs or pull-translation PR updates. The route passes the header through from `github-webhook.route.ts` to `handleGithubPushWebhook` and then to this helper.

## Recommendation

Build push idempotency from signed payload fields or a digest of the verified body, such as installation id, repository id, ref, before, after, and workflow/config scope. Treat `x-github-delivery` as metadata only, or include it only in addition to a body-derived key.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
