# [BUG] Status-only automation updates can be blocked by stale integration validation

**File:** [`apps/hyperlocalise-web/src/lib/agents/workspace-automations.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/workspace-automations.ts#L437-L540) (lines 437, 447, 456, 525, 540)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

updateWorkspaceAutomation validates the full automation config and current Slack/email integration state for every update, even when the caller only changes status or nextRunAt. pauseWorkspaceAutomation delegates to this path. If an automation references a Slack or email integration that was later disabled, attempts to pause or archive the automation can fail with an integration validation error, leaving an active scheduled automation difficult to stop through the API.

## Recommendation

Skip config and integration validation when only status or scheduling metadata changes. Always allow org-scoped pause/archive operations after the automation ownership check succeeds.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-06-01)
