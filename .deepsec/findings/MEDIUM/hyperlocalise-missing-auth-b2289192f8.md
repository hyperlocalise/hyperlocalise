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

## Revalidation

**Verdict:** true-positive

The current code still creates or reuses the tenant interaction in handleNewConversation before resolving the Slack user or checking Hyperlocalise membership. processSlackMessage then calls getSlackUser and immediately persists addInteractionMessage with message.text and senderEmail before lookupMembership is evaluated. If lookupMembership returns null, the function only warns or reacts with x, leaving the interaction and user message in the tenant records. wrapThreadPost is also used for the warning path, and wrapThreadPostForInteraction persists posted agent text as an interaction message, so the warning can also enter the tenant conversation. The Slack webhook route verifies Slack signatures and rejects unknown or disabled workspaces, but that only proves the request came from Slack for a connected team, not that the Slack sender is a Hyperlocalise organization member. A Slack workspace member who is not in the Hyperlocalise org can mention or DM the bot and cause org-scoped interaction, inbox, and message rows to be created under the connector organization. I did not find cleanup or pre-persistence authorization that removes or prevents those rows.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
