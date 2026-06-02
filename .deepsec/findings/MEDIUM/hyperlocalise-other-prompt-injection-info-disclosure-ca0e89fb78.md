# [MEDIUM] Untrusted diffs can steer an LLM with repository read tools

**File:** [`apps/hyperlocalise-web/src/lib/agents/github/github-repository-automation-agent.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/github/github-repository-automation-agent.ts#L48-L78) (lines 48, 52, 70, 74, 78)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-prompt-injection-info-disclosure`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The automated validation agent gives a ToolLoopAgent repository workspace tools, then places the commit diff excerpt directly into the user prompt. Repository diffs are attacker-controlled for anyone who can push to an automation-triggering branch. There is no hard tool policy limiting reads to changed localization files, and the shared instructions do not mark the diff as untrusted data. A prompt-injected localization change can ask the model to inspect arbitrary repository paths such as .env or unrelated source files; tool output is sent to the model and the final summary is persisted as agentSummary. Pattern redaction helps for common tokens but is not a complete data boundary.

## Recommendation

Treat diff content as untrusted data. Scope read/grep/glob tools to the changed localization paths or an explicit allowlist, block hidden files and symlinks, add a tool-level path policy independent of model instructions, and avoid returning raw file contents to the model when a deterministic localization check can answer the question.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
