# The platform as the source of truth for strings

**Status:** Accepted

Ships in three parts over two pull requests, and each pull request updates this record when it lands:

1. **Translations when source text changes:** a project setting that sends approved translations back to review, with a way to skip it for one change. The first pull request.
2. **Editing source text in the platform:** a project setting that lets people and the public API change source text, an import rule that keeps those edits, and a content editor control.
3. **Sending edited source text back:** GitLab delivery writes the platform's source text, as well as its translations, when part 2's setting is on. GitHub follows later.

Parts 2 and 3 ship together, in the second pull request. Part 2 alone would leave a repository-synced project with clashes that never settle and a repository whose source text drifts from the platform's, since only part 3 writes the platform's text back. Part 3 alone has nothing to send, because without part 2's import rule the next sync replaces any source text edited in the platform.

## Context

Today the uploaded or synced file is the source of truth. Every import replaces a key's source text with the file's ([source file reconciliation](../plans/2026-09-13-source-file-reconciliation-design.md)). The public API can change source text on native projects, but the content editor can't.

When a key's source text changes, its approved translations stay approved with their old text. The reconciliation design says retained keys keep their translations, and the guide [Update source content safely](../platform/guides/update-source-content.mdx) tells people to recheck approved wording by hand. On 2026-11-05 this was confirmed by running it against a database: an approved translation kept its status and text after the source changed through a file re-upload, `PATCH /v1/strings/{id}` and `POST /v1/projects/{id}/strings/batch`. Those were the only writers of source text; part 2 adds the content editor. Every upload surface (the web app, the CLI, repository syncs, integration imports) goes through the same import, `upsertKeysFromEntries`. Nothing marks such a translation as out of date later: there is no trigger, and translations don't store the source text they were made from.

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

- **A project setting, `source_text_editable`, off by default**, shown as **Allow source text editing** under **Translation & Content Editor behavior** and changed through the same go-svc route as part 1's setting. Off, an import replaces the platform's source text with the file's, as today. On, source text may be edited in the content editor and through the public API, on the strings below. Turning it on takes effect at once; turning it off asks first, since edits not yet in the file are replaced by the file's text on its next import.
- **Which strings may be edited.** Strings in no file, and strings in a file the platform can write edited text back into. Decided 2026-11-06 by file type, from what each format's keys are:
  - **Editable:** the JSON family (JSON, JSONC, ARB, FormatJS catalogs), which `writeJsonSourceText` writes in place.
  - **Key-value formats with stable keys, editable once a writer exists:** YAML, XLIFF, Apple `.strings`, `.stringsdict` and `.xcstrings`, Android XML, RESX/RESW, properties, TOML, INI, CSV/TSV, Fluent. Today only the CLI, in the sandbox, can rebuild them.
  - **Not editable:** documents (HTML, Markdown, MDX, AsciiDoc, Liquid, TXT, Office, PDF, subtitles, Lottie, SVG), whose strings are positions in a text with inline markup hidden in markers; gettext PO and Qt TS, which are keyed by the source text itself; code files (JavaScript, PHP), which belong to developers; images and video.
  - **Not from an integration.** A file whose last import came from an integration (Braze, HubSpot, Webflow, Sanity and the rest) is not editable: its service holds the source text and the push sends translations only. Files from the Files page, the public API and CLI, Inbox replies, chat, MCP, the Slack agent, and GitLab or GitHub syncs are. A file with no recorded import (no reconciled version, or one from before surfaces were recorded) is not, since an integration may have brought it in; uploading it again makes it editable.
  - **Not hidden, not a segment with markup, not a sentence.** A hidden string is never written back, so it isn't offered. Text holding the internal markers that stand for inline markup, and keys that segmentation split out of a longer text (`#srx.`), are refused; new text holding those markers, or NUL, is refused by the editor route and the public API alike.
  - The list is explicit: the extensions in `source-text-editable-paths.ts` for the web app and in `internal/sourcetext` for the Go services, which alone holds the upload surfaces, as edits are allowed or refused there. A list is needed because "not a document" alone would let in PO, Qt TS, code and the formats with no writer yet.
- **When the setting is on, an import keeps platform edits.** It follows a three-way rule per existing key, comparing the file's text, the platform's, and `imported_source_text` (the text last imported):
  - only the platform changed: keep it;
  - only the file changed: take it;
  - both changed to the same text: keep it;
  - both changed differently: a **clash**. The platform's text is kept, and the key is reported on every run until one side gives way.

  Every import records the file's text as `imported_source_text`, except on a clash, which keeps its base so the next import finds it again. Texts are compared exactly. The migration adds the column empty: the first edit of a string records the text it replaces as its base (`coalesce(imported_source_text, source_text)`), so no backfill rewrites the table under the migration's locks. A key with no base takes the file's text.
- **Clashes are kept on the source file version's `sync_report`**, with the file's text, for any upload when the setting is on. Only the GitLab sync shows them, under **Recent syncs** and in the workflow step's output. A file the sync finds unchanged isn't imported again, but when it has a standing clash, or with the setting off a key edited here, its keys still go through the rule with the file's text already known (from the clash list, else the text last imported): a clash settled in the platform stops being one, and with the setting off an edit made here takes the file's text back.
- **The file as the platform has it.** The stored file isn't rewritten on each edit: it stays the record of what was imported, and the GitLab sync compares the repository's file with it. Instead, a reader that turns a source file into work or sends it on applies the platform's edits to it (`applyProjectSourceText`): file translation jobs translate the edited text, and GitLab delivery sends it. Downloads of JSON files already take the key's text. Both readers leave a list item that clashes as the file has it (see part 3), so a job never translates text the merge request won't send. With the setting off, readers take the file as it is at once, while the edited text stays on the string until the file's next import.
- **While the setting is off, the public API refuses source text changes on strings that belong to a file** (`409 source_text_not_editable`), since the next import would silently replace them; with it on, it refuses them on strings in files that aren't editable. Strings in no file stay editable. Sending a string's current text again, or with other surrounding spaces (the API trims what it receives), is not a change: it is accepted and nothing is written. Source text of strings in files is changed through the API only by admins, localization managers and developers (`403 source_text_forbidden`), the roles the content editor allows. A string the API creates in a file records its text as `imported_source_text`.
- **Part 1's reset applies only to keys whose source text was actually written.** A kept platform edit or a clash leaves translations as they are. Settling an unchanged file follows part 1's setting too, with no skip, since a sync has no person to choose it.
- **The content editor control.** On an editable string, a **Source text** section in the editor's side panel shows the string's source text with a pencil that opens a text field with **Save source text** and Cancel; ⌘↵ and ⌘S in the field save the source text, not the translation. It saves through a go-svc route (`POST …/files/detail/cat/segments/{id}/source-text`), which refuses with `409` while the setting is off, on a string that isn't editable, or on a string locked in any language. The queue marks each editable string (`sourceTextEditable`), counting a lock in any language, so the pencil appears only where the route accepts the edit. The control has its own skip, **Small fix: keep approved translations**, shown while part 1's setting is **Needs review**; whitespace-only changes don't send translations to review, as on import and the public API. Admins, localization managers and developers may use it: the `projects:write` roles, who manage a project's files. It isn't offered in the merged-strings view, where a row stands for several strings and an edit would change only one.

### Part 3: sending edited source text back

With part 2's setting on, GitLab delivery writes the platform's source text back to the repository's JSON-family source files in the same merge request as the translations. That settles clashes in the platform's favour.

- A key is written when its platform text differs from `imported_source_text`: an edit made here, or a clash. Keys hidden by hand and keys the repository dropped are left as the file has them.
- The writer changes only the edited string literals, so the file's layout, comments, escapes, key order and empty objects stay as they were.
- A list item that clashes is held back: an item inserted above it in the repository shifts the others, so its clash may be a neighbour in its place. A list item the file still has as last imported is written. File translation jobs follow the same rule.
- With no target languages left, a run still closes an open merge request that carries nothing it would send now.
- HTML pages aren't written back: their segments hold internal markers and shift with the page, and part 2 doesn't let them be edited.
- The merge request keeps its title once open (a reviewer's "Draft:" mark survives), so its description leads with any source text it changes; the commit says *update source text and translations*. The run summary counts the source files sent (`sourceWritten`), shown in **Recent syncs**.
- Once the merge request is merged, the next import finds the file and the platform agreeing, so the key's base moves on and no translation goes to review.

GitHub comes later. The GitHub repository automation is deprecated, and the project Sync panel holds GitHub back until it is retired (see the project Sync panel design, 2026-11-04), so GitHub has no sync to extend yet. Once project Sync offers GitHub, its pull requests write source text back the same way. Files from uploads, the CLI and GitHub keep edits in the platform with no way out yet: downloads offer target languages only.

## Known gaps

These belong with the work on jobs over a set of keys, not here:

- A file job reuses a translation in review as its prefill, so it isn't retranslated.
- A review job re-approves translations in review after only the empty and length checks.
- Re-importing a bilingual file with no edits re-approves them.

Left out of parts 2 and 3:

- A clash from a hand upload, the CLI push or the GitHub repository automation is kept on the version's report but shown nowhere; only the GitLab sync lists clashes, and only it writes source text back.
- Edits to files from uploads, the CLI and GitHub stay in the platform: no download of the source language yet.
- Only the JSON family is editable; the other key-value formats wait for writers.
- A Lottie animation saved as `.json` is editable and jobs translate its edits (its keys are JSON paths), but GitLab delivery doesn't write Lottie files back, for translations or source.
- A clashing list item stays as the file has it in jobs too, so the job's translation for that key is of the file's item, next to the edited source in the editor, until the clash is settled.
- An edit undone here (back to the text last imported) while a merge request carrying the edit is still open: if that merge request is merged before the next sync rebuilds it, the next import takes the edit as a file change, with no clash.
- `applyProjectSourceText` applies any edit on the file without re-checking where the file was last uploaded from; an edit made before the file was re-imported from an integration still reaches jobs.
- A key created in the platform inside a file is hidden by the file's next sync, as before, rather than written into the file.
- A source text edit leaves no history entry and no activity log event.
- Settling an unchanged file happens on GitLab sync runs only; a file that is never synced again keeps its clash until its next upload.
- A merge request merged after the text was edited again here reads as a clash on the next import (file: the text sent, platform: the newer edit), until the next merge request is merged.
- Two people editing the same string's source text: the last save wins, with no warning.
- Turning the setting on while an import is running can let that import overwrite an edit made at once afterwards.
- A job on an older stored version of a file applies today's edits to it; list positions may not line up.
- Clash reports keep each clash's full file text, unbounded.

Also left out of part 1:

- Translated images, videos and document copies keep their approved status when the source file is replaced; the setting covers source text only.
- Re-reading an already imported version (segmentation or import settings) reuses that upload's skip choice. Today reconcile returns early for that version; it matters once segmentation re-ingest reconciles again.
- A string from a file that is edited through the public API goes to review twice: once for the edit, once when the next import restores the file's text. Part 2's refusal (`409 source_text_not_editable`) removes it while the setting is off; while it's on, the import keeps the edit.
- The CLI push has no flag for the skip, though `POST /v1/files` accepts it.
- A locked translation keeps its old text approved after an import changes its source, and unlocking it later doesn't send it to review.
- Reverting a source change (a wrong upload, a reverted commit) leaves the translations in review: the import compares only with the current text, and the reset can't be undone in bulk.
- Reviewers see the new source beside the old translation, with no previous source text or diff, and the Needs review filter mixes these with drafts and submissions.
