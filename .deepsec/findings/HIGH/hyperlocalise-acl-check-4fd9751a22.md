# [HIGH] GitHub fix workflow pushes without authorizing the commenter

**File:** [`apps/hyperlocalise-web/src/workflows/github-fix.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/workflows/github-fix.ts#L57-L339) (lines 57, 61, 307, 308, 316, 337, 339)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The workflow authorizes the write action only by checking that the PR head repo matches the base repo (`canPush`), then creates a sandbox with an installation token and pushes fixes to the PR branch. The event type contains no commenter login or author association, and this file never verifies that the `@hyperlocalise fix` commenter has write/maintain/admin permission or is otherwise allowed to mutate the branch. On an enabled repository, any GitHub user who can comment on a same-repository PR can trigger the app to run the fixer, consume sandbox resources, and push bot commits to that PR branch.

## Recommendation

Carry the triggering sender login/association into the queued event, then verify it before enqueueing and again in the workflow by fetching the comment/review comment and checking repository collaborator permission or an explicit allowlist. Do not rely on `canPush` alone; also add abuse throttling for fix requests.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-04-25)
