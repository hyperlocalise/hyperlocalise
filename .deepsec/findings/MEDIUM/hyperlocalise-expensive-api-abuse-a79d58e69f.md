# [MEDIUM] GitHub mentions can trigger unbounded agent workflows

**File:** [`apps/hyperlocalise-web/src/lib/agents/github/bot.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/github/bot.ts#L89-L279) (lines 89, 114, 207, 249, 279)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

handleMention treats comments containing @hyperlocalise as commands, gates them only on GitHub write permission, and then either enqueues a repository workflow or runs an LLM agent that queues the fix workflow. I did not find a per-requester, per-repository, per-installation, or organization quota/rate-limit check in this path; the idempotency table only deduplicates the same comment/scope. A compromised or malicious write collaborator on an enabled repository can post many distinct comments or instructions to start many Vercel sandbox, LLM, and GitHub workflows and consume paid resources for the linked Hyperlocalise organization.

## Recommendation

Before creating the agent or enqueueing workflows, enforce rate limits and usage quotas keyed by organization, GitHub installation, repository, and requester. Consider an admin-configurable allowlist or requiring Hyperlocalise workspace membership for costly bot-triggered workflows.

## Revalidation

**Verdict:** true-positive

`handleMention` treats comments containing `@hyperlocalise` as commands after parsing, resolving the GitHub App installation, checking PR context, and calling `requesterCanRunFix`. `requesterCanRunFix` only verifies that the GitHub requester has admin, maintain, or write collaborator permission; it does not require Hyperlocalise workspace membership or apply a usage quota. For repository commands, the handler claims an idempotency row keyed by installation, repository, PR, comment ID, and instructions, then calls `createRepositoryAgentTaskQueue().enqueue`, which is a thin `workflow/api` start. For fix commands, it creates a `ToolLoopAgent` that calls the `enqueueGitHubFix` tool, which uses the same idempotency table and then queues `githubFixWorkflow`. The idempotency table suppresses duplicate processing of the same comment/scope, but distinct comments or changed instructions create distinct keys, and the fix workflow deletes its idempotency record in `finally`. The repository workflow can create a repository sandbox and run an LLM agent, while the fix workflow creates a Vercel sandbox and performs GitHub/CLI work. I found billing usage-control code elsewhere, but no calls to it, no rate limiter, and no per-requester/repository/installation/org quota in this bot path or the queues. A malicious or compromised write collaborator on an enabled repository can therefore post many distinct `@hyperlocalise` commands and consume the linked organization’s paid resources.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
