# Self-hosted GitLab content sync

**Status:** Accepted

Ships as two stacked pull requests: pull files from GitLab into a project, then deliver translations as one merge request. Builds on the [self-hosted GitLab connection](./2026-11-03-self-hosted-gitlab-connection-design.md) and changes one line of the [project content sync](./2026-09-11-project-content-sync-design.md) record: GitLab does not reuse the sandbox clone.

## Context

A workspace connected to its own GitLab server wants its locale files pulled into a project and translations sent back. The GitHub content sync clones the repository into a cloud sandbox, which can't reach a server on a company network or a developer's machine, and plain file sync doesn't need a clone. The GitHub sync is live and stays as it is.

The platform is where source text and translations are edited, so a repeat sync must not throw away edits made here.

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

- The sync settings name **where each language's files sit**: a path template under the provider folder with `{{locale}}` for the language code (`{{locale}}.json`, `{{locale}}/pages/*.html`), and an optional map from a project locale to the code the repository uses (`fr-FR` → `fr`). The source locale's files are imported as source files. A file whose code is a target locale is a translation file, left for delivery. A file that matches neither is skipped. Nothing is guessed, so a translated file is never read as English.
- The settings live in the existing sync configuration (`ContentSyncConfig`: `branch`, `pathTemplate`, `localeCodes`). GitLab is offered in the visual workflow **Content sync** step, which runs the same `executeContentSyncConfig`; a built-in project sync page is separate work.
- The run waits for every imported file's ingest to finish, so delivery can rely on the keys being there. A version a newer upload superseded counts as finished.

### Source text edits, on both sides

- **A project setting, `source_text_editable`, off by default.** Off, an import replaces the platform's source text with the file's, as every upload does today. On, source text may be edited here and through the public API, and an import follows a three-way rule per existing key, comparing the file's text, the platform's and `imported_source_text`, the text last imported (null for keys from before the column; the platform's text stands in):
  - only the platform changed: keep it;
  - only the file changed: take it;
  - both changed to the same text: keep it;
  - both changed differently: a **clash**; keep the platform's and report the key.
  Every import records the file's text as the last imported text. Texts are compared exactly.
- The public API refuses a source text change with `409 source_text_not_editable` while the setting is off. Turning the setting off warns that edits not yet in the repository will be replaced by the next sync.
- Approved translations go back to review only for keys whose source text was actually written.

### Keys the repository dropped

A GitLab sync hides them with the existing hidden flag, which translation jobs skip, instead of deleting them, and records that a sync hid them (`hidden_by_sync_at`). A key that comes back is unhidden only if a sync hid it. Every other upload path keeps today's delete.

### Reporting

Clashes and missing keys are stored on the source file version (`sync_report`) and returned in the run summary, per file. They are never written to key metadata, which several services rewrite without locking.

## Consequences

- A sync needs a workspace GitLab connection; a member's GitLab.com sign-in is not used, since runs have no user.
- The sync holds the GitLab project's id as well as its path, and refuses to run when the path on the current server names another project.
- A file with a changed source text and translations in the repository is reported and left as is; a manual clean-up of hidden keys is later work.
- The GitHub content sync still clones, delivers unreviewed text and hard-deletes missing keys. Moving it onto the interface is a separate change with its owner.
