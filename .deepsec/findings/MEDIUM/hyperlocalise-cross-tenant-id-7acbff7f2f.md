# [MEDIUM] Slack webhook routing can select the wrong organization for duplicate Slack team IDs

**File:** [`apps/hyperlocalise-web/src/api/routes/slack-webhook/slack-webhook.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/slack-webhook/slack-webhook.route.ts#L112-L125) (lines 112, 118, 125)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `cross-tenant-id`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

After validating Slack's HMAC, the route resolves the tenant only from the signed Slack team_id by calling findSlackConnector(teamId, { enabledOnly: false }) and then dispatches the event to the Slack bot. The helper searches connectors globally by config->>'teamId' with limit(1), while the connectors schema only enforces uniqueness on (organizationId, kind), not on Slack teamId. The Slack OAuth/install flow can therefore store the same Slack workspace teamId for multiple Hyperlocalise organizations. In that state, a valid Slack event can be ignored because a disabled duplicate connector is returned, or processed under the wrong organization by the Slack bot, causing interactions, uploaded files, repository context, or translation jobs to be associated with the wrong tenant. Signature verification authenticates Slack's payload but does not disambiguate the Hyperlocalise organization.

## Recommendation

Enforce a global partial unique constraint for Slack connector team IDs, reject or explicitly transfer an existing Slack workspace during OAuth install, and make webhook lookup fail closed unless exactly one enabled connector matches. Avoid enabledOnly: false for routing decisions so disabled duplicates cannot shadow an enabled connector.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
