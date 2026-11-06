# The platform as the source of truth for strings

**Status:** Accepted

Ships in three parts over two pull requests, and each pull request updates this record when it lands:

1. **Translations when source text changes:** a project setting that sends approved translations back to review, with a way to skip it for one change. The first pull request.
2. **Editing source text in the platform:** a project setting that lets people and the public API change source text, an import rule that keeps those edits, and a content editor control.
3. **Sending edited source text back:** GitLab delivery writes the platform's source text, as well as its translations, when part 2's setting is on. GitHub follows later.

Parts 2 and 3 ship together, in the second pull request. Part 2 alone would leave a repository-synced project with clashes that never settle and a repository whose source text drifts from the platform's, since only part 3 writes the platform's text back. Part 3 alone has nothing to send, because without part 2's import rule the next sync replaces any source text edited in the platform.

## Context

Today the uploaded or synced file is the source of truth. Every import replaces a key's source text with the file's ([source file reconciliation](../plans/2026-09-13-source-file-reconciliation-design.md)). The public API can change source text on native projects, but the content editor can't.

When a key's source text changes, its approved translations stay approved with their old text. The reconciliation design says retained keys keep their translations, and the guide [Update source content safely](../platform/guides/update-source-content.mdx) tells people to recheck approved wording by hand. On 2026-11-05 this was confirmed by running it against a database: an approved translation kept its status and text after the source changed through a file re-upload, `PATCH /v1/strings/{id}` and `POST /v1/projects/{id}/strings/batch`. Those are the only writers of source text. Every upload surface (the web app, the CLI, repository syncs, integration imports) goes through the same import, `upsertKeysFromEntries`. Nothing marks such a translation as out of date later: there is no trigger, and translations don't store the source text they were made from.

So out-of-date text can be delivered as final. Teams that keep their source text in the platform need an out-of-date state per language and a way back into review.

Other translation tools differ in their defaults, but most string-based ones flag translations and let the person making the change skip it:

- Phrase Strings unverifies translations in linked languages, with "Skip verification" in the editor and `skip_unverification` on upload.
- Lokalise has a project setting that marks other languages unverified when the base language changes.
- Weblate marks them "Needs editing".
- Crowdin and Transifex let each upload choose: keep, keep but unapprove, or clear.
- Smartling treats changed text as a new string, with the old translation offered from translation memory.

## Decision

### Part 1: translations when source text changes

- **A project setting, "When source text changes"**, with two choices:
  - **Stays approved**, the default and today's behaviour.
  - **Needs review**.
  Existing projects keep today's behaviour until someone changes the setting. It sits under **Translation & Content Editor behavior** in the project settings, beside identical string merging, and is stored in `projects.approved_translations_on_source_change`. Administrators and localization managers can change it, through the same go-svc route as the merging setting (`PATCH …/content-editor-behavior`). Changing it doesn't bump the grouping revision, so open content editors don't refresh. Projects linked to an external TMS don't have it.
- **A source change** is a text change of an existing key: same key, different text. Changes to surrounding whitespace alone don't count, because the public API trims what it receives while imported strings may keep their spaces. New keys and removed keys follow the reconciliation rules as they are.
- **Needs review** moves only `approved` translations, to `needs_review`. Their text is kept so a reviewer can update it. The reviewer and review time are cleared, and a revision row records the change: with the system as the actor for an import, and with the API key's user for the public API. Drafts, translations already in review, rejected translations and locked translations are left alone: a lock refuses status changes, so a locked translation moved to review could not be approved again without unlocking, and the public API already refuses source changes on locked strings. The change commits in the same transaction as the source change.
- **Every writer follows the setting:** the import (every upload surface, integration imports included) and the public API's string routes. One rule per project needs no list of which upload surfaces count as integrations. Integration imports run on their own, so nobody can skip the reset for them: in a project set to Needs review, every source change an integration brings in, typo fixes included, goes to review.
- **Skipping the reset for one change.** Only the person making a change knows whether its meaning changed: a typo or punctuation fix leaves the translations correct. `keepApproved: true` leaves approved translations approved for that change:
  - `PATCH /v1/projects/{projectId}/strings/{stringId}` takes it in the body; on its own it is not a change.
  - `POST /v1/projects/{projectId}/strings/batch` takes it once, beside `strings`, for every item in the batch.
  - File uploads store it on the source file version (`repository_source_file_versions.keep_approved_translations`), because the import runs later in a workflow. The Files page's upload panel shows a checkbox, "Keep translations approved", only while the project is set to Needs review. The platform file upload API (`POST /v1/files`) takes the form field `keepApproved=true`.
  - If a second upload of the same file arrives before the first is imported, only the second is imported, with its own choice.
  - Not covered: the CLI push, chat, MCP and other upload surfaces send no flag, so they follow the setting. The content editor gets a checkbox in part 2, when it can edit source text.
- **No "clear the translations" choice.** Clearing throws away work a reviewer could correct, can't be undone in bulk, and hides nothing on delivery: GitLab delivery keeps the repository's current text for a key with no approved translation. It can be added later if a customer asks. If it is, the old text should be offered as a suggestion rather than deleted.
- **Integration imports don't undo the reset.** Integration imports (Webflow, Intercom, Sanity, Braze, HubSpot, Mailchimp, Customer.io, Iterable) write the remote locale text as approved after the source import. In a project set to Needs review, a translation in review whose text such an import would leave unchanged stays in review, whatever sent it there; different text is approved as before. The import still counts those rows as imported, since integrations read a shortfall as a language left to translate and would start a job. An import made by a person (a bilingual file, a translation file on the Files page, Sanity's localize action) counts as their review and approves as before.
- **What delivery does with translations in review:**
  - Integration pushes that apply only approved translations onto the platform's existing locale copy (HubSpot, Braze, Mailchimp, Iterable, Loops, Customer.io) leave that key's current text in the copy, the old translation, until it is approved again; where no copy exists yet, the key goes out in the source language.
  - Sanity and Intercom skip that language for the item.
  - Webflow pushes only approved translations.
  - GitLab delivery keeps the repository's current text for that key.
  - Downloads, the CLI pull, GitHub content sync and bilingual export deliver the text whatever its status.
- **Docs:** the guide [Update source content safely](../platform/guides/update-source-content.mdx) and the content editor page describe the setting and the skip.

### Part 2: editing source text in the platform

- **A project setting, `source_text_editable`, off by default.** Off, an import replaces the platform's source text with the file's, as today. On, source text may be edited in the content editor and through the public API.
- **When the setting is on, an import keeps platform edits.** It follows a three-way rule per existing key, comparing the file's text, the platform's, and `imported_source_text` (the text last imported):
  - only the platform changed: keep it;
  - only the file changed: take it;
  - both changed to the same text: keep it;
  - both changed differently: a **clash**. The platform's text is kept, and the key is reported on every run until one side gives way.
- **While the setting is off, the public API refuses source text changes on strings that belong to a file** (`409 source_text_not_editable`), since the next import would silently replace them. Strings created through the API outside any file stay editable: no import replaces them, and the API is the only way to edit them.
- **Part 1's reset applies only to keys whose source text was actually written.** A kept platform edit or a clash leaves translations as they are.
- The content editor control and its skip checkbox are built in this part.

### Part 3: sending edited source text back

With part 2's setting on, GitLab delivery writes the platform's source text back to the repository's source files in the same merge request as the translations. That settles clashes in the platform's favour.

GitHub comes later. The GitHub repository automation is deprecated, and the project Sync panel holds GitHub back until it is retired (see the project Sync panel design, 2026-11-04), so GitHub has no sync to extend yet. Once project Sync offers GitHub, its pull requests write source text back the same way.

## Known gaps

These belong with the work on jobs over a set of keys, not here:

- A file job reuses a translation in review as its prefill, so it isn't retranslated.
- A review job re-approves translations in review after only the empty and length checks.
- Re-importing a bilingual file with no edits re-approves them.

Also left out of part 1:

- Translated images, videos and document copies keep their approved status when the source file is replaced; the setting covers source text only.
- Re-reading an already imported version (segmentation or import settings) reuses that upload's skip choice. Today reconcile returns early for that version; it matters once segmentation re-ingest reconciles again.
- A string from a file that is edited through the public API goes to review twice: once for the edit, once when the next import restores the file's text. Part 2's refusal (`409 source_text_not_editable`) removes it.
- The CLI push has no flag for the skip, though `POST /v1/files` accepts it.
- A locked translation keeps its old text approved after an import changes its source, and unlocking it later doesn't send it to review.
- Reverting a source change (a wrong upload, a reverted commit) leaves the translations in review: the import compares only with the current text, and the reset can't be undone in bulk.
- Reviewers see the new source beside the old translation, with no previous source text or diff, and the Needs review filter mixes these with drafts and submissions.
