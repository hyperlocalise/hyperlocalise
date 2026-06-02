# [MEDIUM] Slack integration state is reachable by users without integration read access

**File:** [`apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/integrations/_components/agent-integrations-section.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/integrations/_components/agent-integrations-section.tsx#L111) (lines 111)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

This section renders the Slack integration row for every authenticated integrations-page viewer and only uses userCanManage to disable controls. The imported Slack row fetches /api/orgs/:organizationSlug/agent-slack on mount; tracing that route shows its GET handlers use WorkOS session auth but no integrations:read or admin gate, returning Slack team ID/name and exposing a sibling channels endpoint. A low-privileged organization member can learn Slack workspace metadata despite not having the integrations:read capability.

## Recommendation

Add integrations:read checks to Slack read endpoints and pass an explicit read-permission prop so rows that fetch integration state are not mounted for unauthorized users.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-06-01)
