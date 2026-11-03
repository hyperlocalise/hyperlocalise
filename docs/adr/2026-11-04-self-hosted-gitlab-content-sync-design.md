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

- The sync settings name **where each language's files sit**: a path template under the provider folder with `{{locale}}` for the language code (`{{locale}}.json`, `{{locale}}/pages/*.html`), and an optional map from a project locale to the code the repository uses (`fr-FR` → `fr`). The placeholder is required; `**` is allowed only as a whole folder and at most twice, a name may hold at most two `*` or `{{locale}}`, and at most eight wildcards in all, so matching stays fast. The source locale's files are imported as source files. A file whose code is a target locale is a translation file, left for delivery. A file that matches neither is skipped. Nothing is guessed, so a translated file is never read as English, and a run that finds no source file fails rather than succeeding with nothing.
- The settings live in the existing sync configuration (`ContentSyncConfig`: `branch`, `pathTemplate`, `localeCodes`). GitLab is offered in the visual workflow **Content sync** step, which runs the same `executeContentSyncConfig`; a built-in project sync page is separate work.
- The run waits for every imported file's ingest to finish, so delivery can rely on the keys being there. A file whose bytes are unchanged since the last run is not stored again, whatever the commit, as long as the last version is the sync's own and its ingest isn't still running from the last hour; its last ingest is waited for, and queued again if it never ran or failed. Such a file is still settled: its keys go through the same three-way rule with the file's text already known (kept with each clash, and otherwise the text last imported), so a clash someone resolved here stops being one, a platform text put back to the base takes the file's text, and with the setting off an edit made here is replaced. No parse and no source-upload automation runs for that. A version a newer upload superseded counts as finished.

### Source text edits, on both sides

- **A project setting, `source_text_editable`, off by default.** Off, an import replaces the platform's source text with the file's, as every upload does today. On, source text may be edited here and through the public API, and an import follows a three-way rule per existing key, comparing the file's text, the platform's and `imported_source_text`, the text last imported (null for keys from before the column; the platform's text stands in):
  - only the platform changed: keep it;
  - only the file changed: take it;
  - both changed to the same text: keep it;
  - both changed differently: a **clash**; keep the platform's and report the key.
  Every import records the file's text as the last imported text, except on a clash, which keeps its base so it is reported on every run until one side gives way (delivery writes the platform's text back when the setting is on). Texts are compared exactly. The migration records each existing key's text as its base, so edits made after it are protected from the start. The rule keys on exact strings, so position-keyed formats (HTML, Markdown segments) can clash on a shifted slot when a paragraph is inserted; that is a known limit.
- The public API refuses a source text change with `409 source_text_not_editable` while the setting is off. Turning the setting off warns that edits not yet in the repository will be replaced by the next sync.
- Approved translations go back to review only for keys whose source text was actually written.

### Keys the repository dropped

A GitLab sync hides them with the existing hidden flag, which translation jobs skip, instead of deleting them, and records that a sync hid them (`hidden_by_sync_at`). A key that comes back is unhidden only if a sync hid it (a hand upload that brings it back shows it too); hiding or unhiding by hand clears the record, so a key unhidden by hand while still missing is hidden again the next time its file is imported. A file the repository dropped has all its keys hidden the same way: only files this sync would import (under its project folder, matching its template as a source file) are considered, so a second sync's files under the same project folder are left alone, and a file the template no longer names is left as it is. A file that comes back unchanged is shown again without a new ingest. Every other upload path keeps today's delete, so a hand upload of a synced file removes the keys the sync had hidden.

### Reporting

Clashes (with the file's text) and the keys a run hid are stored on the source file version (`sync_report`); the run summary lists, per file, the clashes still standing and the keys that run hid. Clashes are kept for every kind of upload when the setting is on. They are never written to key metadata, which several services rewrite without locking.

## Consequences

- A sync needs a workspace GitLab connection; a member's GitLab.com sign-in is not used, since runs have no user.
- The sync holds the GitLab project's id as well as its path, and refuses to run when the path on the current server names another project. The step's repository picker lists projects only when the workspace has a connection.
- The public API refuses source text changes on every project until the setting is turned on, strings outside any file included; this changes a live path and is named as a risk. Nothing in the app itself edits source text yet; the setting's name looks ahead to that.
- The public API records a created string's text as its last imported text, so a string created in a synced file is simply hidden by the next sync rather than counted as an edit.
- A sync's waits for many files run together with one time limit; a very large folder may need more than one run. Two Content sync steps for the same repository that keep the default project folder write the same files; nothing stops that yet.
- The migration fills `imported_source_text` for every key in a file in one statement, and the Go services read `source_text_editable` on every project load, so the migration must run before they deploy.
- A file with a changed source text and translations in the repository is reported and left as is; a manual clean-up of hidden keys is later work.
- The GitHub content sync still clones, delivers unreviewed text and hard-deletes missing keys. Moving it onto the interface is a separate change with its owner.
