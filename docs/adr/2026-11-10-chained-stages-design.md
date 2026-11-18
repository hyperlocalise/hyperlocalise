# Chained stages: a translation as another project's source

**Status:** Accepted

Ships in parts. This record is written with the first part and is updated as the others land:

1. **Word and Excel files, sent by hand** from the Files page.
2. **A mark on the file** when the translation changed after it was last sent. Built: see [Sent and changed since](#sent-and-changed-since).
3. **Automatic sending when the review task is done**, with a visual workflow. Built: see [Sending automatically](#sending-automatically).
4. The original source text shown as a reference line in the destination project's content editor.
5. The same action in the public API. Built: see [Public API](#public-api).
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
- **Default branches only.** Since project version branches (2026-11-13), a send reads the file from the first project's default branch and writes it to the destination's default branch; files at the same path on other branches play no part. The action is offered only on the default branch, and a protected destination default branch refuses the send. Sending between other branches is left for later.
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

## Sent and changed since

On the first project's Files page, a file that was sent shows **Sent** after its latest job status, or in place of **Uploaded** when it has had no job. Its tooltip names each project it was sent to and when it was last sent there, and the **Use translation as source…** dialog says the same for the chosen project, for people who cannot hover. A hidden file shows **Hidden** instead. The mark reads **Changed since sent** when sending again would send something else to any of those projects.

Each send stores a fingerprint of what it read on the file version it makes in the second project: the content hash of the original's newest upload, its import settings, the first project's source language (the Excel writer reads it), and each string's key and approved translation in the language sent (strings the file no longer has, hidden by an upload, are left out; a string hidden by hand is still in the file, and for one without an approved translation whether it is hidden is included, since that decides whether a send is refused). The mark compares that with the fingerprint now. So:

- an approved translation edited, or set back to review, counts. It stops counting once the text that was sent is approved again;
- a new upload with other content counts, and so does a change to the file's **Import filters**;
- a translation saved again unchanged, another language, and a string the file no longer has do not count.

The send reads its fingerprint before it reads the translations. A change made while the file is being built may reach the file and still make it read as changed: the error is always towards sending again, never towards missing a change.

When the second project's file at that path was replaced after the send (an upload there, or a send from elsewhere), the mark reads **Replaced in** that project instead, since sending again would ask first. The mark stores nothing in the first project. Only projects the person can open, and whose source language is one of this project's languages, are listed, so no other project's name is shown.

In the second project, a file whose newest version came from a send shows **From** and the sending project's name, or **From another project** for people who cannot open that project; its tooltip says when the file was sent, and, when the send replaced a version that did not come from the same file, which version it replaced and who uploaded it, so people there can find out what was replaced and ask. It is read from the newest version's upload surface and the metadata the send stored, so a later upload there by hand removes it. Without it, nothing in the second project said its files came from another project.

Known limits:

- The file counts as changed when it is uploaded again with any other content, such as the same text saved again in Word or Excel: the fingerprint holds the file's content hash, not its strings.
- The check reads every string of each sent file in the language sent, each time the Files page opens. Very large sent files make the page's first mark slower to appear.

## Sending automatically

A team chaining stages hands each file on once, when its review in the pivot language is finished. Sending is automated with a visual workflow, from one new step and the existing **Job changed** trigger:

1. **Job changed** on the first project, for status changes of **Proofread** tasks to **Succeeded**: a reviewer marked the task done. Since post-edit tasks can be marked done too (2026-11-16, [A file's human steps in order](./2026-11-16-task-steps-in-order-design.md)), the trigger's **Job kinds** list **Post-edit** apart from **Proofread**, though both are stored as the same kind of job, so this workflow does not start on a finished post-edit task. Every job event carries the job's current status, so the trigger must be limited to status changes, or editing a finished task's title would start it again. The trigger's project is optional on its own, but a workflow with the send step cannot be published or run without it, unless the step's **Send tasks from any project** is ticked: as the Retry step's duplicate-risk box does, the check makes a setting required by what else is in the workflow, and the person can accept the wider choice. Other workflow builders enforce such rules in their editor's checks rather than in instructions to an assistant; this assistant reads the same checks after each edit, so it asks for the project with no rule of its own.
2. **Use translation as source**, given the task's `jobId` and the project to send to. It reads the task's project, file and languages from the task, and sends the file through the same send a person makes, in the destination's source language.

The step adds no scheduled work and no table. The trigger already turns each task change into a run within a minute. The tasks themselves come from an **Assign task** step, for example in a **Source upload** workflow that machine translates each new file and assigns a proofread task.

- **The send's own rules apply.** Every string must be approved; an automatic send never replaces a file in the second project that this file did not send, since no person sees the notice; the default branch only. The file's newest upload is sent, which may be newer than the one the task reviewed; it too must be fully approved.
- **What needs a person fails the step; what needs nothing is an output.** Marking a task done does not check approvals, so a task done too early must not end quietly. A send that waits on a person (strings not approved, a file in the second project this file did not send, a protected default branch, an upload still being read or unreadable, a file that would read differently or cannot be written) fails the step. The run shows as failed and can be retried once the cause is fixed, since only failed runs and runs needing attention can be retried. A workflow can instead take the step's error branch to notify someone; that run counts as handled and cannot be retried, so the file is then sent from the Files page. The task's language is checked before the projects, so a trigger left on any project skips the tasks of projects that do not translate into the destination's language, the destination's own tasks among them, instead of failing a run for each; a destination chosen in the wrong language then shows as `task_in_other_language` on every run rather than as a failure. A setting that cannot work and a failure to build or store the file fail it too. When nothing should be sent, the step succeeds with `sent: false` and a `reason`: the same content is already there (`already_sent`, so a retried step uploads nothing), the file's content came from the second project (`sent_from_destination`, which stops two workflows sending a file back and forth), the task has no file or is in another language, its file was removed, the file is not Word or Excel or has no strings, or it is on another branch.
- **It acts on the workflow's authority.** Whoever may mark the task done, a translator included, sets off the send; the workflow's author chose the destination. The same holds for every workflow step that changes a project.
- **No person is behind the send.** The version has no uploader, the metadata marks it sent automatically, and the second project's **From** tooltip reads **Sent here automatically from** the first project.
- **Each finished task sends once.** A translation changed after the send is not sent again by itself: the file shows **Changed since sent**, and a person sends it again from the Files page, as the [Consequences](#consequences) describe for fixes.

Alternatives weighed:

- **A trigger that fires when a file becomes fully approved**, and again after each later approved change. It needs a scheduled look at every fully approved file and a table of what it last saw, so it is background machinery of its own; re-sending after every change was not a requirement, and most review findings on that design came from it.
- **A workflow per upload that waits for the review**: **Source upload**, **Assign task**, then **Wait** until **Check progress** says every string is approved. Built from existing steps only, but each waiting run is woken by the 15-minute scheduled check, a cancelled task waits until the timeout, and a person's "done" is not the signal.
- **Sending inside Mark done**, from a "when done, send to" setting on the task. The most direct for reviewers, but it ties the shared, live jobs code to files and makes Mark done wait while the file is built and read back.
- **Existing workflow steps calling the public API**: **Job changed**, then HTTP requests that read the job and call part 5's route with a stored key. No new step, but the send is recorded as the key's owner, a retried run uploads again, and the workflow calls the app over the internet.
- **No automation**: a **Job changed** workflow notifies the manager, who sends from the Files page, or the second project lists fully approved files that are not yet sent, for its manager to pull. Simpler, but a person stays in the hand-off, which Phrase TMS's automated projects make without one.
- **A team's own scripts** calling the job webhooks and the public API. Possible with part 5's route, but the visual workflow serves teams without developers.

## Public API

Teams that chain stages often run them from their own scripts, which drive their current platform through its API. The send is `POST /v1/projects/{projectId}/files/translation-source` on `https://hyperlocalise.com/api/v1`, beside `POST /v1/files`, with the file's path, the destination project and, optionally, `replaceVersionId`. It calls the same send as the Files page, with the same checks and refusal codes.

- **A web app route, not go-svc.** The send builds the Word or Excel file through the file's import settings, reads it back, and uploads it through the upload pipeline (storage, versions, ingest, automations). go-svc has no Office writer that handles import settings and no upload pipeline, and every other upload and job creation route of this API is already in the web app.
- **Permissions match the Files page.** The key needs `files:write`, the scope that uploads files, and its owner the role the dialog needs (`projects:write`: admins, localization managers and developers), with team access to both projects. A translator's key may hold `files:write`, which uploads files, but cannot send.
- **A caller sees nothing before sending.** The dialog shows what a send would replace before the click; a script does not. So the route never replaces a file at that path that this file did not send unless the request names that version, from a repository sync included. The refusal (`409 destination_file_replaced`) gives the version, when it was added, who added it (a person, or the owner of the API key for a file uploaded through the API, with a flag saying so; the key's name is not shown, as members other than admins see only their own keys), whether a repository sync added it, and where a file sent from elsewhere came from, so the script can check it and send again with `replaceVersionId`. A file that arrives in between is refused again under its own version. A send over this file's own last send needs nothing.
- **Statuses say what to do next.** `409` for states that change on their own or by a decision (missing approvals, with the count, the total and up to 20 strings; a file to confirm; a file still being read), `422` for a file that cannot be sent as it is, `400` for a request naming the wrong file or projects, `404` for what the key's owner cannot open.
- **The file is named by its path.** As on the Files page. A script that uploaded the file through `POST /v1/files` already has it.
- **Default branches only, with no `branch` parameter.** As on the Files page, the send reads the file from the default branch and writes to the destination's default branch; a protected destination default branch is refused with `409 destination_branch_protected`.
- **Recorded as its key's owner.** The send is the Files page's, which records a person, so the new version and its activity entry name the key's owner, not the key as `POST /v1/files` does. Passing the key through the send would fix it.

**How a script learns the translation is finished.** It listens for the job-change webhook (`job.status_changed` to `succeeded`) on the review job of the pivot language, and sends the file under the path it uploaded it with. A script that did not upload the file itself reads the job (`GET /v1/jobs/{jobId}` on `https://public-api.hyperlocalise.com`, #3239), which gives the job's source file with its path and branch, and its languages. A file on a branch other than the default cannot be sent. A finished review job does not prove every string is approved; the send checks that itself and refuses until they are. Sending stays the script's decision, unless a visual workflow sends the file when its review task is done ([Sending automatically](#sending-automatically)).

## Why not the alternatives

- **A switch inside one project** changes what "source text" means for every reader of it (AI translation, quality checks, the editor, Reports word counts), and sends every language through the pivot unless exceptions are added per language.
- **A source language per task** keeps one project, but needs an exception in the shared rule that a job's source is the project's source, a second way to find glossary terms, Reports changes so vendor word counts use the pivot language, and a way to hold strings back until the pivot is approved.
- **A reference language only** leaves translation memory keyed on the original language, so memories built from the pivot language never match, and nothing enforces the order of stages.

Two projects change no shared system: the second project is an ordinary project, and everything that already works on a project works on it.

## Other file types

Not built. Recorded so that a later part follows the same rules. Every format is turned on only after a round-trip test of its own: build the translated file, read it back as a source, and get the same strings.

- **A file that cannot be written in its own format is not sent.** The download of a text format falls back to a plain key and value JSON when it cannot write the file's own format. A download says so; a send must refuse instead, because the fallback has a different shape and would replace the destination's strings.
- **File names that carry the language.** `locales/zh-CN.json` sent "under the same path" would hold English in a file named for Chinese. Lokalise, Crowdin and Weblate store such a path as a pattern with a slot for the language and treat every language's file as one logical file; Phrase TMS, which keeps literal paths, cannot swap a language code inside a file name. The rule here: the path is kept with the language slot the content sync already uses (`{{locale}}`), the file is sent under the path that pattern gives for the language sent (`locales/en.json`), and a later send finds its file through a saved link between the two files, not by comparing paths.
- **Files a repository sync owns.** The repository is the owner of a synced file's source text, so a sent file would be a second writer of it. The action is not offered for a file that a sync brings into the first project. In the second, a file its sync added is replaced only once a person saw it, as any file the send did not put there (below); the sync may store its copy again on its next run. Such content can chain through the repository instead, as Phrase TMS does with a watched folder: the first project's sync delivers `en.json` by merge request, and a second project whose source is English syncs that file. A developer's edit to `en.json` is then an ordinary source change. This needs the sync to ignore its own commits. Crowdin Enterprise, Phrase Strings and Weblate instead keep one project and let a later step or job translate from the in-between language; that is the per-task alternative above, and the better fit if repository content needs chained stages often.
- **Settings and labels.** A file's import settings (filters, placeholder format, segmentation, columns) are copied to the destination file on the first send, since the destination must read the file the same way. Tags, design links, character limits and locks set on strings in the app are not copied. No platform compared carries these between two projects except inside the file itself (XLIFF notes and length limits); the ones that keep them do so by staying in one project. Copying them by matching keys on each send is possible later, because both projects key the file alike.
- **Files with two languages inside** (XLIFF, PO) are out of scope.

## History and undo

Each upload of a source file is kept as a version, and each translation has its own history with a restore action in the content editor. There is no list of a file's versions and no way to go back to one. Crowdin keeps file revisions with a restore action, Smartling parks the translations of removed strings and brings them back when the string returns, and no platform compared previews a source update before applying it. Hiding instead of deleting (above) gives sent files Smartling's behaviour. Two things would complete it, for every upload and not only sent files: a version list with restore on the Files page, and a count of strings added, changed and removed before an update is applied.

## Consequences

- **Two projects to watch.** There is no single view of a request's progress across both.
- **Glossaries.** A glossary is attached by its source language, so the second project needs a glossary whose source is the pivot language.
- **Sending again is by hand or from a script.** Part 3 sends each file once, when its review task is done; later fixes are sent from the Files page or through the public API.
- **A changed string waits for a person.** When a re-sent file changes a string, the destination keeps its earlier translation for review; a later file job does not translate it again, because file jobs keep any translation that has text.
- **Text Word does not offer as strings stays as it was.** The display text of link fields, a table of contents, inline content controls and comments are not strings today, so they keep the original language in every translated file, including the one sent.
- **A send replaces only its own copy without asking.** When the destination's newest version at that path is the last send from this same file, a send replaces it. Anything else (a version uploaded there by hand or through the API, one an integration added, one sent from another project or from another file of this project, such as `a.xls` and `a.xlsx` both arriving as `a.xlsx`) is replaced only when a person saw it: the dialog shows where it came from and who added it before sending, the button reads **Replace in** that project, and the request carries the version shown. The send checks again just before uploading, so a file that arrives in the meantime is not replaced unseen; an upload whose save is still under way at that moment is not seen and can still be replaced, which the second project's **From** mark then shows. A file the destination's repository sync added is treated the same way, and the notice says that the sync may store its copy again on its next run. One rule serves sends by hand, sends through the API and automatic sends; an automatic send, which no one sees, never replaces such a file, and an API send replaces one only when the request names its version. The server checks the approvals first, so a refusal over the file there never hides strings that are still missing.
- **Strings matched by position move.** Word paragraphs and cell-by-cell Excel sheets key a string by its position. Removing one from the middle of the original moves every later string onto the next string's text, in both projects, and a string hidden at the end comes back with its old translation when the file grows again. With **When source text changes** on **Stay approved** those translations stay approved, so the setting should be **Needs review** in both projects.
- **Excel context stays as it was.** Context and comment columns are not strings. The destination reads them as each string's context, in the original language.
- **Values without letters.** A paragraph whose translation has no letters ("2026") is not a string in the destination. It is copied as it is.
