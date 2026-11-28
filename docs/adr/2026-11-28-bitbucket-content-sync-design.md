# Bitbucket Cloud content sync

**Status:** Accepted

Adds Bitbucket Cloud as the third provider behind the content sync interface designed in [self-hosted GitLab content sync](./2026-11-04-self-hosted-gitlab-content-sync-design.md), with workspace connections modelled on [several named GitLab connections](./2026-11-03-self-hosted-gitlab-connection-design.md#several-named-connections-2026-11-05).

## Context

Workspaces on Bitbucket want the same project Sync as GitLab: pull locale files, hide keys the repository dropped, send approved translations back in one pull request. The GitLab ADR checked on paper that Bitbucket's `src`, multi-file commits and `pullrequests` endpoints cover every method of `ContentSyncRepositoryReader` and `ContentSyncRepositoryWriter`.

## Decision

- **API tokens, no OAuth.** A connection holds one token, encrypted like other provider credentials and never returned: an Atlassian API token sent with its account email (basic auth), or a workspace, project or repository access token sent alone (bearer). No WorkOS Pipes slug and no app registration. OAuth can be added later as another way to fill the same connection.
- **Bitbucket Cloud only.** Every call goes to `https://api.bitbucket.org`, through one request function in `lib/bitbucket/client.ts`. Pagination follows Bitbucket's `next` links only on that origin, so the token never leaves it. Bitbucket Data Center is a separate API and is not covered.
- **Connections** (`bitbucket_connections`) copy GitLab's shape: several per workspace, optional names, at most one marked default (partial unique index), the oldest otherwise. Saving checks the token first (lists one repository; asks who it belongs to where the token may say) and saves nothing on failure. A project sync stores `bitbucketConnectionId`, filled with the default when none is chosen, so moving the default never moves a sync. Routes: `GET/POST /bitbucket/connections`, `PUT/DELETE /bitbucket/connections/:id`, `POST …/:id/default`, `GET …/:id/check`.
- **A sync names the repository by `workspace/repo-slug` (`resourceKey`) and its uuid (`connectionId`)**; a run refuses to start when the path now names another repository.
- **One pipeline.** `executeRepositoryContentSync` (in `execute-gitlab-content-sync.ts`) is the provider-neutral pull and delivery; GitLab and Bitbucket each supply only how the repository is reached and their upload surface (`bitbucket_content_sync`, which keeps missing keys hidden like GitLab's). Delivery is `deliver-gitlab-translations.ts` unchanged except for the review noun.
- **Branch rebuilds.** Bitbucket can't move a branch to another commit, and its `src` endpoint commits on an existing branch only when `parents` is that branch's head. A sync branch that doesn't sit on the current target is deleted and made again as one commit on it. Bitbucket may decline the open pull request when its branch is deleted; the run then opens a new one, and the declined one is not the sync's own close, so it never holds a later one back unless its content matches.
- **No blob ids.** Bitbucket's listings give no git blob ids. To recognise a branch that already holds this run's content (so an hourly sync doesn't rebuild it), delivery reads the files the branch's single commit touches, at most 200, and hashes them (SHA-1, Bitbucket's only object format).
- **Hidden marks** in pull request descriptions are Markdown reference definitions (`[//]: # (hyperlocalise-sync:…)`), which Bitbucket doesn't render; GitLab's HTML comments would show. Decline takes no message, so the reason and the close mark are written into the description first.
- **Triggers.** Manual and scheduled runs from the project Sync panel. Bitbucket webhooks, and Bitbucket in the visual workflow Content sync step, are later work.

## Consequences

- A token's per-repository write access isn't reported by Bitbucket for API or access tokens, so the Sync panel can't mark repositories *pull only*; a refused write is reported on the run, as for GitLab.
- Chat repository context and repository agents don't use Bitbucket.
- Reviewer comments on a declined-and-reopened pull request stay on the declined one.
