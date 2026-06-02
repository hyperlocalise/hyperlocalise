# [BUG] Manual run idempotency keys collide across automations

**File:** [`apps/hyperlocalise-web/src/api/routes/workspace-automation/workspace-automation.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/workspace-automation/workspace-automation.route.ts#L418-L423) (lines 418, 423)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-idempotency-scope-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The manual run endpoint accepts a caller-supplied idempotencyKey and passes it unchanged into createWorkspaceAutomationRun. That helper looks up existing runs by organizationId, automationId, and idempotencyKey, but the database conflict target is organizationId plus idempotencyKey only. Reusing the same idempotency key for a different automation in the same organization causes the insert to be ignored, the fallback lookup to miss because it is scoped to the current automation, and the helper to throw failed_to_create_workspace_automation_run. This is not a cross-tenant issue, but it makes idempotent run creation fail unpredictably across automations.

## Recommendation

Scope idempotency consistently. Either include automationId in the unique index/conflict target, or namespace the route-provided key with the automationId before insertion and lookup.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-06-01)
