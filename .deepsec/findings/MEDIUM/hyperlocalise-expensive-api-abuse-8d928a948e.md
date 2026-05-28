# [MEDIUM] Slack repository requests can trigger sandboxes and LLM work without abuse controls

**File:** [`apps/hyperlocalise-web/src/lib/agents/slack/bot.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/slack/bot.ts#L336-L477) (lines 336, 433, 477)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

After a Slack user maps to any organization membership, repository-looking messages can resolve GitHub context, mint an installation token, create a Vercel repository sandbox, and run the ToolLoopAgent. I did not find per-user or per-organization rate limits, quota reservation, or concurrency guards around this Slack path. A low-privileged member in a connected Slack workspace can repeatedly trigger paid LLM calls, GitHub token minting, and sandbox creation.

## Recommendation

Add per-user and per-organization rate limits, quota checks, and sandbox concurrency limits before repository context resolution, sandbox creation, and agent.generate.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
