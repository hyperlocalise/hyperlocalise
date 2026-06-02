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

## Revalidation

**Verdict:** true-positive

After lookupMembership succeeds, the Slack path accepts any local organization membership role and does not check an AI, developer, or provider capability before expensive work. Repository-looking text reaches resolveSlackRepositoryGitHubContext, which queries enabled repositories for the organization and may resolve a repository or PR context. If resolved, createRepositorySandbox mints a GitHub installation token and creates a Vercel sandbox from the repository source, then createConversationToolLoopAgent is run and agent.generate is called. The tool policy currently returns true for every tool name, so low-privileged roles are not blocked at that layer. I found no per-user or per-organization rate limit, quota reservation, concurrency guard, or billing check on this Slack path before GitHub context resolution, sandbox creation, or LLM generation. A connected Slack member can repeatedly send repository-context requests to consume LLM calls, GitHub API work, and Vercel sandbox resources. The path is org-scoped to enabled repositories, so this is not cross-tenant data access, but the expensive API abuse finding is real.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
