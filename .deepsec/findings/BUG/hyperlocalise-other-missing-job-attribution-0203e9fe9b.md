# [BUG] Agent-created jobs are inserted without user attribution

**File:** [`apps/hyperlocalise-web/src/lib/agent-runtime/tools/translation-tools.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agent-runtime/tools/translation-tools.ts#L165-L365) (lines 165, 173, 174, 175, 176, 177, 178, 179, 180, 181, 357, 358, 359, 360, 361, 362, 363, 364, 365)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-missing-job-attribution`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

queuedJobValues does not set createdByUserId, and createTranslationJobTool inserts jobs using that helper. The regular REST job route records the authenticated user, but agent-created jobs are left unowned even though ToolContext includes localUserId. This breaks 'mine' job filters and weakens auditability for jobs created through chat or Slack agents.

## Recommendation

Include createdByUserId: ctx.localUserId when building job insert values, and add tests that agent-created jobs preserve the triggering user identity.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-28)
