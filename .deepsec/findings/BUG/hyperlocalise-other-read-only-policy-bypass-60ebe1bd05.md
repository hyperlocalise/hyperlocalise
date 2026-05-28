# [BUG] Read-only repository workflow can still mutate its sandbox

**File:** [`apps/hyperlocalise-web/src/workflows/repository-agent.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/workflows/repository-agent.ts#L35-L112) (lines 35, 84, 112)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-read-only-policy-bypass`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The workflow states that repository work is read-only, but it exposes the repository workflow tool set, which includes bash and Hyperlocalise CLI helpers. The imported bash allowlist permits command families such as find and yq without excluding mutating flags like find -delete or yq -i, and the CLI helper can create artifacts. This does not write back to GitHub, but user or repository prompt injection can mutate the sandbox and make the agent's later analysis depend on altered files.

## Recommendation

Remove mutating-capable tools from read-only workflows, or enforce read-only execution at the sandbox/filesystem layer and deny write-capable flags and subcommands before invoking tools.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
