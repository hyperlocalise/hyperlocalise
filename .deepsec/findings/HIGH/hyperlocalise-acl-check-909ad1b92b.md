# [HIGH] Chat job creation bypasses project mutation authorization

**File:** [`apps/hyperlocalise-web/src/lib/tools/job-tools.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/tools/job-tools.ts#L181-L305) (lines 181, 205, 281, 296, 304, 305)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The project job HTTP route requires isProjectMutationAllowed before creating or retrying jobs, but createTranslationJobTool is exposed to chat without any membership-role check. A non-admin organization member can prompt the agent to create durable translation jobs for an attached project, enqueue workflow execution, and consume the organization's provider credentials/LLM budget despite being forbidden from the equivalent project mutation API.

## Recommendation

Include membership role in ToolContext and enforce the same isProjectMutationAllowed policy before creating or enqueueing jobs. Consider conditionally building job mutation tools only for authorized roles.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-06)
