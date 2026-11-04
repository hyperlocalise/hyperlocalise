# Self-hosted GitLab content sync

**Status:** Accepted

Ships as one pull request with the [project Sync panel](./2026-11-04-project-sync-panel-design.md): pull files from GitLab into a project, and deliver translations as one merge request. Builds on the [self-hosted GitLab connection](./2026-11-03-self-hosted-gitlab-connection-design.md) and changes one line of the [project content sync](./2026-09-11-project-content-sync-design.md) record: GitLab does not reuse the sandbox clone.

## Context

A workspace connected to its own GitLab server wants its locale files pulled into a project and translations sent back. The GitHub content sync clones the repository into a cloud sandbox, which can't reach a server on a company network or a developer's machine, and plain file sync doesn't need a clone. The GitHub sync is live and stays as it is.

Translations are edited here, so a repeat sync must not throw them away when the repository drops a key.

## Decision

### REST, through one narrow interface

- **Every GitLab call is a REST request**, never a clone. They all go through one request function in `lib/gitlab/client.ts`, so a relay or a fixed outgoing address can be added in one place.
- **Content sync speaks files and reviews, never a provider's terms.** `lib/agents/content-sync/content-sync-provider.ts` is the whole interface:
  - read side, built: `resolveBranchHead`, `listFiles` (a folder, recursively, at one commit), `readFile` (bytes at that commit);
  - write side, written down for the next pull request: `commitFiles` (several files as one commit on a branch, created from a start commit when new) and `upsertReview` (open a review from a branch, or update the open one).
  - Outside it: connection setup and tokens (`lib/gitlab/access.ts`), and incoming webhooks, which each provider turns into a run.
- **Checked on paper** that GitHub (contents, git trees, pulls), Bitbucket Cloud (src, commits with multiple files, pullrequests) and Azure DevOps (items, pushes, pull requests) can each do every method. Not built; not tested.
- The GitLab adapter is `lib/gitlab/content-sync-reader.ts`. Every read in a run uses the commit the run started from.

### What a pull imports

- The sync settings name **where each language's files sit**: a path template under the provider folder with `{{locale}}` for the language code (`{{locale}}.json`, `{{locale}}/pages/*.html`). A code names a project locale the way the Contentful, Intercom, Webflow and HubSpot integrations match locales: the same tag (case and `_` aside), else the one project locale of that language (`fr` for `fr-FR`, `en-US` for `en`); two of the language would be a guess, so neither is taken. There is no per-sync code map, so the rule is the same everywhere. The placeholder is required; `**` is allowed only as a whole folder and at most twice, a name may hold at most two `*` or `{{locale}}`, and at most eight wildcards in all, so matching stays fast. The source locale's files are imported as source files. A file whose code is a target locale is a translation file, left for delivery. A file that matches neither is skipped. Nothing is guessed, so a translated file is never read as English, and a run that finds no source file fails rather than succeeding with nothing.
- The settings live in the existing sync configuration (`ContentSyncConfig`: `branch`, `pathTemplate`). GitLab is offered in the visual workflow **Content sync** step and in the project Sync panel, which run the same `executeContentSyncConfig`.
- The run waits for every imported file's ingest to finish, so delivery can rely on the keys being there. A file whose bytes are unchanged since the last run is not stored again, whatever the commit, as long as the last version is the sync's own and its ingest isn't still running from the last hour; its last ingest is waited for, and queued again if it never ran or failed. No parse and no source-upload automation runs for that. A version a newer upload superseded counts as finished.

- An import replaces the platform's source text with the file's, as every upload does; editing source text in the platform is a separate, later design.

### Keys the repository dropped

A GitLab sync hides them with the existing hidden flag, which translation jobs skip, instead of deleting them, and records that a sync hid them (`hidden_by_sync_at`). A key that comes back is unhidden only if a sync hid it (a hand upload that brings it back shows it too); hiding or unhiding by hand clears the record, so a key unhidden by hand while still missing is hidden again the next time its file is imported. A file the repository dropped has all its keys hidden the same way: only files this sync would import (under its project folder, matching its template as a source file) are considered, so a second sync's files under the same project folder are left alone, and a file the template no longer names is left as it is. A file that comes back unchanged is shown again without a new ingest. Every other upload path keeps today's delete, so a hand upload of a synced file removes the keys the sync had hidden.

### Reporting

The keys a run hid are stored on the source file version (`sync_report`); the run summary lists them per file. They are never written to key metadata, which several services rewrite without locking.

## Consequences

- A sync needs a workspace GitLab connection; a member's GitLab.com sign-in is not used, since runs have no user.
- The sync holds the GitLab project's id as well as its path, and refuses to run when the path on the current server names another project. The step's repository picker lists projects only when the workspace has a connection.
- A sync's waits for many files run together with one time limit; a very large folder may need more than one run. Two Content sync steps for the same repository that keep the default project folder write the same files; nothing stops that yet.
- A translation file in the repository is counted and left as it is until delivery; a manual clean-up of hidden keys is later work.
- Delivery sends approved translations as they stand. Whether a source text change should send a key's approved translations back to review is a separate decision for every upload path, with its own design record; today they stay approved, as the [reconciliation design](../plans/2026-09-13-source-file-reconciliation-design.md) and the guide on updating source content say.
- The GitHub content sync still clones, delivers unreviewed text and hard-deletes missing keys. Moving it onto the interface is a separate change.
