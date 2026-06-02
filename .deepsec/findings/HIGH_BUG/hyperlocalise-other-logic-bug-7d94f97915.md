# [HIGH_BUG] Slack automation notifications are saved with unusable channel IDs

**File:** [`apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/automations/_components/workspace-automation-form.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/automations/_components/workspace-automation-form.tsx#L1002-L1026) (lines 1002, 1008, 1025, 1026)
**Project:** hyperlocalise
**Severity:** HIGH_BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The form stores the raw Slack channel ID selected from /agent-slack/channels into toolConfig.slack.channelId. Static tracing shows the notification sender later passes that value to postSlackChannelMessage, but the installed Slack adapter's postChannelMessage expects canonical channel IDs shaped like slack:C123 and also requires a bot token context in multi-workspace mode. Automations configured through this UI will therefore save channel values the sender cannot use, causing Slack terminal-run notifications to fail.

## Recommendation

Store a sender-compatible channel reference or normalize it at send time, and pass organization/team context so the notification sender retrieves the correct Slack installation bot token. Add an integration test against the real adapter contract.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-06-01)
