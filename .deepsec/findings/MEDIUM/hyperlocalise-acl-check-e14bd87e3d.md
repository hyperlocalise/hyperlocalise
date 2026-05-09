# [MEDIUM] Stale GitHub repository rows can authorize webhooks after installation reassignment

**File:** [`apps/hyperlocalise-web/src/lib/agents/github/repositories.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/github/repositories.ts#L77-L150) (lines 77, 82, 150)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

Repository sync resolves conflicts only on githubInstallationId plus githubRepositoryId, and the conflict update refreshes repository metadata without updating organizationId or resetting enabled. The stale-row cleanup is scoped to the incoming organizationId, so rows left behind when an installation is unlinked from one organization can survive if the same GitHub installation is later connected to another organization. The webhook enablement gate checks githubInstallationId, githubRepositoryId, and enabled, not the organization that currently owns the installation, so an enabled stale row can allow repository webhooks and GitHub fix workflows for a newly linked organization before that organization has enabled the repository.

## Recommendation

Delete githubInstallationRepositories rows when unlinking an installation or add a real FK with ON DELETE CASCADE to github_installations. Also scope webhook enablement checks by the current installation organization, and make sync either migrate organizationId safely while resetting enabled to false on ownership changes or include organizationId in the uniqueness model.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
