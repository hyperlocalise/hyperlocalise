# Bitbucket Cloud content sync

**Status:** Accepted

Adds Bitbucket Cloud as the third provider behind the content sync interface designed in [self-hosted GitLab content sync](./2026-11-04-self-hosted-gitlab-content-sync-design.md), connected through WorkOS Pipes like the workspace's other sign-in integrations.

## Context

Workspaces on Bitbucket want the same project Sync as GitLab: pull locale files, hide keys the repository dropped, send approved translations back in one pull request. The GitLab ADR checked on paper that Bitbucket's `src`, multi-file commits and `pullrequests` endpoints cover every method of `ContentSyncRepositoryReader` and `ContentSyncRepositoryWriter`.

## Decision

- **WorkOS Pipes, organization-owned.** Bitbucket is a Pipes provider (slug `bitbucket`). An admin (`integrations:write`) signs in once from Integrations and the connection belongs to the workspace (`connectionOwner: "organization"`), not to that person. Syncs run with nobody signed in, so a per-member connection would tie each sync to whoever set it up and break when they disconnect; one shared connection also lets an admin decide what every sync can reach. No token is stored by Hyperlocalise and there is no Bitbucket table.
- **Tokens on behalf of the connecting admin.** WorkOS issues an organization token on behalf of an active member. Runs use the member WorkOS records as having established the connection (`establishedByUserId`). When that member leaves, WorkOS clears the connection (`state_reason: establishing_member_membership_ended`); runs and the Integrations row then say an admin must connect Bitbucket again. The shared Pipes helpers (`lib/pipes/accounts.ts`) gained an optional `connectionOwner` for authorize, token, disconnect, and `getPipesOrganizationAccount` for status.
- **Bitbucket Cloud only.** Every call goes to `https://api.bitbucket.org` with the bearer token, through one request function in `lib/bitbucket/client.ts`. Pagination follows Bitbucket's `next` links only on that origin, so the token never leaves it. Bitbucket Data Center is a separate API and is not covered.
- **Routes:** `GET /bitbucket/connection` (status), `GET /bitbucket/connection/authorize-url` and `DELETE /bitbucket/connection`. The sign-in window returns to Integrations with `?pipesCallback=bitbucket`, which tells the opening page and closes.
- **A sync names the repository by `workspace/repo-slug` (`resourceKey`) and its uuid (`connectionId`)**; a run refuses to start when the path now names another repository.
- **One pipeline.** `executeRepositoryContentSync` (in `execute-gitlab-content-sync.ts`) is the provider-neutral pull and delivery; GitLab and Bitbucket each supply only how the repository is reached and their upload surface (`bitbucket_content_sync`, which keeps missing keys hidden like GitLab's). Delivery is `deliver-gitlab-translations.ts` unchanged except for the review noun.
- **Branch rebuilds.** Bitbucket can't move a branch to another commit, and its `src` endpoint commits on an existing branch only when `parents` is that branch's head. A sync branch that doesn't sit on the current target is deleted and made again as one commit on it. Bitbucket may decline the open pull request when its branch is deleted; the run then opens a new one, and the declined one is not the sync's own close, so it never holds a later one back unless its content matches.
- **No blob ids.** Bitbucket's listings give no git blob ids. To recognise a branch that already holds this run's content (so an hourly sync doesn't rebuild it), delivery reads the files the branch's single commit touches, at most 200, and hashes them (SHA-1, Bitbucket's only object format).
- **Sync on push.** A Bitbucket project sync can set `syncOnPush`. Saving it adds a `repo:push` webhook to the repository (needs admin access there) and keeps its id in the sync's settings (`bitbucketWebhookId`, server-set only); turning it off, changing repository or removing the sync removes it, best effort. Deliveries go to `POST /api/webhooks/bitbucket/content-sync/:projectId`, keyed by project because a project has one sync, so the webhook exists before the sync is saved and a refused webhook saves nothing. Each project's secret is an HMAC of the server key (`PROVIDER_CREDENTIALS_MASTER_KEY`) and the project id, so nothing is stored; `X-Hub-Signature` (`sha256=`) is checked in constant time. A push to the branch the sync reads (else the repository's main branch, looked up since a push doesn't name it) starts a run with the new `push` trigger; one that arrives while a run is going is dropped, since that run reads the branch as it is. Other events, other branches and other repositories are acknowledged and ignored.
- **Hidden marks** in pull request descriptions are Markdown reference definitions (`[//]: # (hyperlocalise-sync:…)`), which Bitbucket doesn't render; GitLab's HTML comments would show. Decline takes no message, so the reason and the close mark are written into the description first.
- **Where it runs.** The project Sync panel (manual and scheduled runs) and the visual workflow **Content sync** step, which keeps one pull request branch per step like GitLab's. The step's repository picker lists the workspace connection's repositories from `GET /bitbucket/repositories`.

## Consequences

- Bitbucket doesn't report per repository what the connected account may write, so the Sync panel can't mark repositories *pull only*; a refused write is reported on the run, as for GitLab.
- One connection per workspace. A project whose repositories the shared account can't see needs that account given access in Bitbucket; several connections per workspace (Pipes supports them) are later work.
- Chat repository context and repository agents don't use Bitbucket.
- Reviewer comments on a declined-and-reopened pull request stay on the declined one.
