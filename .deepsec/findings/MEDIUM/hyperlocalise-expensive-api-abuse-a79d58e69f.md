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

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
- Muen Yu <22992947+MuenYu@users.noreply.github.com> (2026-05-19)
