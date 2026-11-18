# Work that follows an edit: found by a schedule, not started by the edit

**Status:** Accepted

Ships in two parts on one branch. This record is written before the first:

1. **List work to review**, a visual workflow step.
2. **A due date counted from the run** on **Assign task**.

A third part, machine re-translation of changed text, was built and taken out again. See "What is not built".

## Context

A customer moving from Phrase asked that localization owners and linguists edit translations and source text in the platform, with the whole project exported to their repository as one merge request. Editing works. What does not happen is anything after it: an edit in the content editor starts no workflow, gives nobody a task and exports nothing.

An earlier attempt at a trigger on approved translations was built and retired on 2026-11-13. It reacted to every later change where the need was a one-time hand-off, it needed its own check in the background and its own table, and a reviewer's view was that automation should be made from visual workflow steps, with nothing new in the background.

What other platforms do, from their own documentation (Phrase Strings and TMS, Crowdin, Smartling, Lokalise, Transifex, POEditor, Weblate, memoQ, XTM, Smartcat):

- An edit changes the state of the string and nothing else: unverified, fuzzy, needs editing.
- Work for people is gathered by state, on a schedule, on upload or by hand. Phrase Strings' job automation, Lokalise's workflows and Smartling's job rules pick strings by status at each run. On Crowdin and Transifex a person makes the task.
- Whoever automates this skips strings already in an open job.
- Nobody waits for edits to go quiet. The schedule's interval is the batching.
- Text leaves for a repository on a schedule, on job completion or by hand, never per edit.

The customer's own scripts follow the same pattern: they ask Phrase for recently updated translations and make jobs from chosen keys. They use no webhooks.

What exists here today:

- A source edit sends approved translations back to **Needs review** when the project's **When source text changes** setting says so. A translation edit is saved as a draft, or approved if the person approves it.
- The **Schedule** trigger, **Pick assignee**, **Assign task** with **Comes after**, **Send email**, and the repository sync that sends approved text as one merge request.
- **Check progress** counts strings needing review, but cannot say which files and languages they are in, and a **For each** cannot be put inside another, so "each file, then each language" cannot be built.
- **Assign task** makes a new task on every run. A workflow on a schedule would give the same person a new task each time.
- A task's due date is a fixed date, which a recurring workflow cannot use.
- **Machine translate** fills empty strings only. Text whose source changed keeps its old translation.

## Decision

An edit keeps doing one thing: changing state. The work that follows is found from the state by a workflow on a schedule.

### List work to review

A step that, for a project, returns each file and language with translations waiting for review (or saved as drafts) **that no open task covers**. Each item carries the project, the file, its path, the language and the number of strings. A workflow loops over the list once:

**Schedule** → **List work to review** → **For each** → **Pick assignee** → **Assign task** → **Send email**

- **Covered** means an open or waiting post-edit or proofread task on that file whose languages include that language, whether or not it has an owner. A task made without languages covers all of them. A task on chosen strings does not count, and neither does a task waiting for a job that failed, which would never open by itself.
- **Why the skip is in the list and not on Assign task.** A workflow that makes a post-edit task and a proofread task after it would, with a skip on each step, make a new post-edit task as soon as the first was done, beside the proofread task still open. Leaving a file and language out while any task is open on it avoids that. A list of file and language pairs also needs only one loop.
- **Why no quiet period.** A task opens the editor on whatever needs review in its file, so it is a standing place, not a snapshot of strings. Edits made while a task is open appear in it. The next task for that file and language is made only after every task on it is finished and something still needs review.
- Only files on the project's main branch are listed. Up to 100 items are returned, the most a **For each** runs; the rest come at the next run.
- The rule for "an open task on a file" is shared with what a task's owner may open, so the two cannot drift.

Nothing is written, and there is no migration.

### A due date counted from the run

**Assign task**'s due date also takes a period counted from when the step runs, written as `+3d` or `+12h`. A fixed date and a value from an earlier step work as before. A value that starts with `+` is only ever read as a period. **Update job** and **Crowdin task** read their due date the same way.

## What is not built

- **Machine re-translation of text whose source changed.** A setting on **Machine translate** to replace translations that are not approved was built and reviewed, then left out. Nothing records that a translation was written against older source text, so the setting could not tell changed strings from the rest: it replaced every draft and every translation waiting for review, including ones people wrote, at every cycle. It also replaced locked strings, and a follow-up job after a partial failure translated again what the first job had saved, charging twice. It needs a mark for "source changed since this translation" first.
- A trigger on edits, an event table, a quiet period, or webhooks per edit.
- Making a task from a filter in the editor or the API. A script can list translations by status and time and then create a task on those strings, which exists.
- A mark on a draft or waiting translation saying its source changed since. It needs a history of source text, which does not exist. The reviewer still sees the string, because it is in the review list.
- A notice from the platform when a task is given. A workflow can send the email.

## Consequences

- A project that wants source edits to produce review work sets **When source text changes** to **Needs review**. With the default, approved translations stay approved and there is nothing to find.
- Drafts count as needing review, so a linguist's unfinished drafts can start a task at the next run.
- The first run finds everything waiting, not only recent edits.
- A task marked done with strings still unapproved comes back as a new task at the next run. A workflow that ends in a post-edit task alone would repeat, because a post-editor cannot approve; it should end in a proofread task.
- The shortest schedule is hourly, so a task follows an edit by up to an hour.

## Alternatives considered

- **A trigger on edits.** The retired design. It needs something in the background to notice saves and decide when a burst of them is one event, and no platform makes work for people from a single save.
- **"Skip if a task is already open" on Assign task.** Smaller, but wrong for a chain of tasks and for one vendor per language, for the reasons above.
- **An extra output on Check progress** instead of a new step. Fewer files, but it would put a rule about open tasks inside a step whose job is counting.
- **A task on the changed strings only.** A snapshot goes stale as more edits arrive, which is the limit other platforms have with tasks that cannot take new strings.

## How it is checked

- The step: which files and languages are listed, what is left out (approved, empty, hidden, other branches, removed languages, files with no upload), what an open, waiting, finished, AI, mirrored, chosen-strings or language-less task, a translation job, and a task waiting behind a failed job do to the list, the path filter, the cap, and the latest upload.
- The due date: a period, a fixed date, an invalid value.
- In the browser: edit source text, run the workflow, see one task per language; run it again and see none; finish the task and see it stay away.
