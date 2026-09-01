# Slack Connect client invite

## Problem

New clients need a shared Slack channel with Hyperlocalise. The existing Slack
integration installs the localization bot in the *client* workspace. It cannot
invite an external company into a Hyperlocalise-hosted channel.

## Decision

Mirror the WorkOS Overview banner: Hyperlocalise hosts a Slack Connect channel
and emails the signed-in user an invite to create the matching channel in their
workspace.

The banner lives on the workspace Overview. It is hidden until
`SLACK_CONNECT_BOT_TOKEN` is set. After an invite, copy matches WorkOS:
the team was invited, check email, dismiss, or request another invite.

## Behavior

1. Create (or reuse) a private channel named `ext-{organization-slug}` in the
   Hyperlocalise Slack workspace.
2. Invite optional host user IDs from `SLACK_CONNECT_HOST_USER_IDS`.
3. Call `conversations.inviteShared` with the current user's email. Slack emails
   them a Slack Connect link. They accept and name the channel on their side.
4. Retry with `external_limited=true` when Slack returns `restricted_action`.
5. Rate-limit requests to once per workspace every two minutes.
6. Dismiss hides the banner for the workspace.

This path is independent of the per-org Slack agent OAuth install.

## Configuration

- `SLACK_CONNECT_BOT_TOKEN` — bot token on the Hyperlocalise workspace with
  `conversations.connect:write`, `channels:manage` / `groups:write`,
  `channels:read` / `groups:read`
- `SLACK_CONNECT_HOST_USER_IDS` — optional comma-separated Slack user IDs
- `SLACK_CONNECT_CHANNEL_PREFIX` — optional, default `ext`

## Out of scope

- Auto-invite on workspace create
- Installing or mentioning the localization bot
- Slack Connect admin approval automation
