# Chained stages: a translation as another project's source

**Status:** Accepted

Ships in parts. This record is written with the first part and is updated as the others land:

1. **Word and Excel files, sent by hand** from the Files page (this change).
2. A mark on the file when the translation changed after it was last sent.
3. Automatic sending when the language is fully approved.
4. The original source text shown as a reference line in the destination project's content editor.
5. The same action in the public API.
6. Other file types, under the rules in [Other file types](#other-file-types).

## Context

Some teams write content in one language, translate it into a second, and only then translate it into every other language from that second one. The common case is Chinese documents that go to English first: post-editors and reviewers finish the English, and English, not Chinese, becomes the source for German, French and the rest. Teams moving from Phrase TMS call these chained stages, or a pivot language.

A project here has one source language. Jobs, the content editor, translation memory, glossaries and Reports all take a string's source text and source language from the project, and nothing reads one language's translation as the source of another.

Other platforms do this in four ways:

- **Two linked projects.** The finished translation becomes the source file of a second project. Phrase TMS does it with Automated Project Creation; memoQ, Trados and Smartling users do it by hand.
- **A step inside one project that switches the source.** Crowdin Enterprise ("Switch Source Language"), XTM (pre-processing) and Wordbee.
- **A source language chosen per task.** Lokalise tasks and Phrase Strings' pivot job template.
- **A second language shown beside the source.** Weblate's secondary language and Transifex.

## Decision

**Two projects, joined by one action.** The first project translates the original into the pivot language. The second project has the pivot language as its source and translates into the remaining languages. A language that should come straight from the original (Traditional Chinese from Simplified Chinese) stays a target of the first project.

- **The action.** On the Files page, a Word or Excel file's menu has **Use translation as source…**. The person picks a destination project; only projects whose source language is one of this project's target languages are offered, and that language is the one sent. The app builds the file in that language, the same way a download does but from approved translations only, and uploads it to the destination project as a source file under the same path.
- **Nothing unfinished is sent.** The action is refused while any string of the file lacks an approved translation in that language, and says how many are missing and which. The writers keep the original text wherever a translation is missing, so a partly approved file would put the original language into the second project labelled as its source. A string hidden by hand counts too when the built file would still hold its original text; a string hidden because the file dropped it does not.
- **The sent file is read back first.** Before uploading, the built file is read with the app's own reader, following the steps ingest takes for the destination (an `.xlsx` file with import settings is read without a source language, as ingest does after the sandbox). The send is refused if that gives a string the original does not have, a string still holding the original text where a translation was written, or lacks a visible string whose translation has letters. The sandbox's reader is a separate program kept in step with the app's; Word has a test that the two agree, Excel does not yet.
- **Strings keep their identity.** A Word string's key is its document part and paragraph position, and the writer replaces paragraphs in place, so the generated file has the same keys as the original. Sending the file again after a fix therefore updates the same strings in the destination: with the destination's **When source text changes** setting on **Needs review**, only the strings whose text changed have their approved translations sent back to review, and the rest stay as they are.
- **The destination treats it as an upload.** Its upload automations run, its translation memory and machine translation work from the pivot language, and Reports count the pivot language's words. Sending again runs the automations again, as any new version of a file does.
- **Where it came from is recorded.** The file version's upload surface is `translation_as_source`, and the stored file's metadata names the project and language it was built from.
- **Who may do it.** The roles that may upload files (`projects:write`: admins, localization managers and developers), on projects they can open. Both projects are in the same workspace.
- **Word and Excel first.** A round trip on Word files (headers, footnotes, tables, text boxes, tracked changes, links) returned the same keys in both of the app's readers. For Excel:
  - a sheet with a column per language gets the pivot language in its own column, which the destination reads as its source column with the same row keys;
  - a sheet read cell by cell gets each translation in place of the original text;
  - a file whose import settings name a source column is written through them: into that column, or into the language's own column when the first row names the source language in the set column. Before this change such a download was written by the first row alone, which wrote nothing unless the first row gave the same keys;
  - the destination file gets the original's import settings on every send, since the file is built through them. Settings saved on the destination's copy are replaced;
  - an old `.xls` file is sent as `.xlsx`, under the same name with the new extension.

  Excel cases the read-back check refuses, and does not support:
  - a sheet read cell by cell whose first row, once translated, has a cell that is just the name of the pivot language ("英文" becoming "English", or a cell that already reads "English"). The destination would take that column as its source column and read the sheet by rows. The person rewords that translation and sends again. Supporting it needs a per-sheet setting that fixes how a sheet is read, in both readers;
  - a formula in the pivot language's column, which the writer leaves alone;
  - import settings saved without a source column, including ones where only the header row choice was changed, on a file with a sheet whose first row names the source language. Ingest reads every sheet of such an `.xlsx` file cell by cell and the writer writes that sheet by rows, so its downloads are wrong in every language already;
  - a file with a source column set whose header row also names the source language in that column: the pivot language goes to its own column, which the copied settings do not point at.

  PowerPoint was not checked and is left out.
- **A string the sent file no longer has is hidden, not deleted.** An upload by hand deletes strings missing from the new file, with their translations and history. A sent file follows the repository sync rule instead: the string is hidden and comes back with its translations when a later send has it again.

## Why not the alternatives

- **A switch inside one project** changes what "source text" means for every reader of it (AI translation, quality checks, the editor, Reports word counts), and sends every language through the pivot unless exceptions are added per language.
- **A source language per task** keeps one project, but needs an exception in the shared rule that a job's source is the project's source, a second way to find glossary terms, Reports changes so vendor word counts use the pivot language, and a way to hold strings back until the pivot is approved.
- **A reference language only** leaves translation memory keyed on the original language, so memories built from the pivot language never match, and nothing enforces the order of stages.

Two projects change no shared system: the second project is an ordinary project, and everything that already works on a project works on it.

## Other file types

Not built. Recorded so that a later part follows the same rules. Every format is turned on only after a round-trip test of its own: build the translated file, read it back as a source, and get the same strings.

- **A file that cannot be written in its own format is not sent.** The download of a text format falls back to a plain key and value JSON when it cannot write the file's own format. A download says so; a send must refuse instead, because the fallback has a different shape and would replace the destination's strings.
- **File names that carry the language.** `locales/zh-CN.json` sent "under the same path" would hold English in a file named for Chinese. Lokalise, Crowdin and Weblate store such a path as a pattern with a slot for the language and treat every language's file as one logical file; Phrase TMS, which keeps literal paths, cannot swap a language code inside a file name. The rule here: the path is kept with the language slot the content sync already uses (`{{locale}}`), the file is sent under the path that pattern gives for the language sent (`locales/en.json`), and a later send finds its file through a saved link between the two files, not by comparing paths.
- **Files a repository sync owns.** The repository is the owner of a synced file's source text, so a sent file would be a second writer of it. The action is not offered for a file that a sync brings in, in either project. Such content can chain through the repository instead, as Phrase TMS does with a watched folder: the first project's sync delivers `en.json` by merge request, and a second project whose source is English syncs that file. A developer's edit to `en.json` is then an ordinary source change. This needs the sync to ignore its own commits. Crowdin Enterprise, Phrase Strings and Weblate instead keep one project and let a later step or job translate from the in-between language; that is the per-task alternative above, and the better fit if repository content needs chained stages often.
- **Settings and labels.** A file's import settings (filters, placeholder format, segmentation, columns) are copied to the destination file on the first send, since the destination must read the file the same way. Tags, design links, character limits and locks set on strings in the app are not copied. No platform compared carries these between two projects except inside the file itself (XLIFF notes and length limits); the ones that keep them do so by staying in one project. Copying them by matching keys on each send is possible later, because both projects key the file alike.
- **Files with two languages inside** (XLIFF, PO) are out of scope.

## History and undo

Each upload of a source file is kept as a version, and each translation has its own history with a restore action in the content editor. There is no list of a file's versions and no way to go back to one. Crowdin keeps file revisions with a restore action, Smartling parks the translations of removed strings and brings them back when the string returns, and no platform compared previews a source update before applying it. Hiding instead of deleting (above) gives sent files Smartling's behaviour. Two things would complete it, for every upload and not only sent files: a version list with restore on the Files page, and a count of strings added, changed and removed before an update is applied.

## Consequences

- **Two projects to watch.** There is no single view of a request's progress across both.
- **Glossaries.** A glossary is attached by its source language, so the second project needs a glossary whose source is the pivot language.
- **Sending is by hand** until part 3. Until part 2 nothing marks a file whose translation changed after it was sent.
- **A changed string waits for a person.** When a re-sent file changes a string, the destination keeps its earlier translation for review; a later file job does not translate it again, because file jobs keep any translation that has text.
- **Text Word does not offer as strings stays as it was.** The display text of link fields, a table of contents, inline content controls and comments are not strings today, so they keep the original language in every translated file, including the one sent.
- **The destination's copy belongs to the send.** A send replaces whatever the destination has at that path: a version uploaded there by hand, a file from a repository sync, or a file sent from a third project. Nothing warns about it, and the Files page does not show where a version came from. A repository sync that covers the same path would store its copy again on its next run. Refusing to replace a file that was never sent from this project is the likely fix; it is not built.
- **Strings matched by position move.** Word paragraphs and cell-by-cell Excel sheets key a string by its position. Removing one from the middle of the original moves every later string onto the next string's text, in both projects, and a string hidden at the end comes back with its old translation when the file grows again. With **When source text changes** on **Stay approved** those translations stay approved, so the setting should be **Needs review** in both projects.
- **Excel context stays as it was.** Context and comment columns are not strings. The destination reads them as each string's context, in the original language.
- **Values without letters.** A paragraph whose translation has no letters ("2026") is not a string in the destination. It is copied as it is.
