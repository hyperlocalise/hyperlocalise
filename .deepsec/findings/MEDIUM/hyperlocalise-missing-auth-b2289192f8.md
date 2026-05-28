# [MEDIUM] Slack non-members can create tenant interaction records before authorization

**File:** [`apps/hyperlocalise-web/src/lib/agents/slack/bot.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/slack/bot.ts#L231-L530) (lines 231, 238, 524, 530)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `missing-auth`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

handleNewConversation creates or reuses an organization interaction and subscribes to the thread before the Slack user is verified as a Hyperlocalise organization member. processSlackMessage then persists the Slack message text and Slack email before lookupMembership runs and rejects non-members. Slack signature verification proves the request came from Slack, but not that the sender is authorized in the Hyperlocalise tenant. A Slack workspace member who is not a Hyperlocalise member can therefore create interaction/message rows, pollute the tenant inbox/history, and store arbitrary text or PII under the organization.

## Recommendation

Resolve the Slack user and verify organization membership before creating/subscribing interactions or persisting message content. Keep non-member warning state outside tenant interaction records, or store only minimal non-sensitive rate-limit state.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
