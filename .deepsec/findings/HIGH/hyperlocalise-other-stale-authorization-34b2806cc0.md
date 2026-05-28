# [HIGH] Replacing a GitHub installation leaves stale repository access rows

**File:** [`apps/hyperlocalise-web/src/lib/agents/github/install-callback.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/github/install-callback.ts#L301-L369) (lines 301, 309, 360, 369)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** medium  •  **Slug:** `other-stale-authorization`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

When an organization already has a GitHub installation, the callback overwrites the github_installations row with the new installation ID but does not delete github_installation_repositories rows for the old installation. The later repository sync only operates on the new installation ID, and sync failures are explicitly tolerated while the installation remains linked. Downstream repository resolution trusts enabled github_installation_repositories rows scoped only by organization, so stale enabled rows can continue to authorize repository-agent access through an old installation ID. In cross-organization relinking or sync-failure scenarios, this can leave a previous organization with usable access to repositories that should now belong to another linked installation.

## Recommendation

When replacing an existing installation, delete or disable repository rows for the old installation ID in the same transaction as the installation update. Also make repository consumers join against github_installations and require the repository row's installation ID to be the current installation for the same organization.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-26)
