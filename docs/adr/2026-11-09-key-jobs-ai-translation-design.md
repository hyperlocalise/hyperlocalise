# AI translation for chosen strings

**Status:** Accepted

## Context

[Key store and key jobs](2026-11-05-key-store-and-key-jobs-design.md) added tasks made of chosen strings (key jobs), for people only. AI translation ran on whole files (file jobs, through the CLI in a sandbox) or on one string at a time (string jobs and the content editor's suggestions). Other platforms translate a chosen set of strings in one action: Phrase Strings has **Pre-translate** for selected keys, and Crowdin pre-translates selected or filtered strings and filters AI pre-translation by label.

## Decision

- A key job may have kind `translation`. It is created like a proofread key job, from the ticked strings, with `kind: "translation"` and an optional `overwriteUnapproved` in its input. It starts **Queued**, runs, and ends **Succeeded** or **Failed** like other translation jobs. Proofread key jobs are unchanged.
- In the content editor, **Add to a task…** in the selection menu creates it when its **Task type** is **AI translation** (the default, **Proofread**, makes a task for people): languages, and whether to replace translations that are not approved yet. One dialog with a task type mirrors the file job dialog, whose **Task type** is **Translation** (AI) or **Proofread**; the AI option is named "AI translation" here so it does not read as people translating. Anyone who may create file translation jobs may use it (`jobs:create`), and AI features must be available to the workspace.
- It runs in its own workflow, `keyTranslationJobWorkflow`, not in the file job's sandbox. Each string goes through the string job's path: the same context builder (glossary, translation memory, and knowledge memory when the workspace has it on, resolved by the job as file jobs do) and the workspace's model resolver, one model call per string for all its languages that need it. When part of an answer is unusable (a language missing, repeated or over the string's max length), the other languages are kept and the call's tokens still count. Strings are taken in small batches, one workflow step per batch, so a long job resumes where it stopped.
- Every answer passes accept checks before it is saved (`accept-translations.ts`):
  - an answer equal to its source is not saved; it gets the one retry like the other problems, as the model sometimes hands back short interface text unchanged (seen 2026-11-10: "Request failed" into German, fixed on the retry), and a copy that comes back again counts as failed. Like the file job's rule (#1843) this needs two or more words, counted outside placeholders, so one-word copies (brand names, codes) and placeholder-only strings (`{first} {last}`) are kept; a target in the source's language (en-US to en-GB) is never a copy;
  - glossary terms for that language must be used and forbidden ones avoided. A glossary problem alone gets the retry, but an answer still off after it is saved for review instead of failed, because the check matches terms as written and a correctly inflected term (Russian, Polish, Finnish) reads as missing;
  - go-svc's format and placeholder checks for the string's file (message format and custom placeholder patterns) must pass. They are called directly, not through `validateScanSegment`, whose in-app placeholder check reads one-word ICU options as placeholders. When go-svc can't be reached the check is skipped and the translation is saved for review;
  - languages that came back missing, repeated or over the max length, or that failed the glossary or format check, get **one** retry: a second call for those languages only, with the problems added to the string's description. Blank answers count as missing. Whatever is still unusable counts as failed; if the retry call itself errors, what passed the first time is still saved. The retry's tokens are charged with the rest, and no retry is made once the job is cancelled.
- What it writes:
  - by default, only translations that are missing or empty, and Needs review translations that are copies of the source by the rule above (the file job's prefill does the same, #1843);
  - with `overwriteUnapproved`, also translations that are not approved;
  - never approved translations or strings locked in that language, checked again when writing;
  - never a translation someone else changed after the job planned its work, even when replacing unapproved ones, so edits made while the job runs are kept;
  - results are **Needs review**, origin machine, recorded in the string's history with the job as source, like string jobs.
- Charging follows file jobs: the job reserves one translation job at creation, and on success the tokens of every model call are added up and charged once with it. A job that translated at least one string succeeds, listing the languages where some strings failed. A job that translated nothing is marked failed: if no call answered, it is not charged; if calls answered but every answer was unusable or failed the checks, it says so and the AI tokens of that run are charged (AI credit only, not the translation job), once per run. A job with nothing left to translate makes no model call, succeeds, and is not charged.
- If a later batch fails after some strings were saved, the job succeeds with those, lists the rest as failed, and is charged for the calls it made.
- The run checks before each batch and in each save that the job is still running under it. After **Cancel**, a manual fail or a retry it stops at the next string and writes nothing more. Like a cancelled file job, a cancelled run is not charged.
- The open-job limit and the hourly rate apply, as for other AI jobs. Failed runs can be retried; the retry skips strings already translated.
- The job page's activity uses the existing events: started, strings found, progress per language, succeeded or failed.

## Consequences

- Reports counts these jobs as it counts file AI jobs (2026-11-10): at the start of a run the strings it plans to translate, by language; each string's saved languages as automated, AI-sourced work right after the save (no person's cost); and the job's status on success. A file job analyses every string of its file, a key job only the strings it plans, so its progress reaches 100% when it saves them all; strings left out at save time (edited, locked or failed) stay unfinished. The workspace's Reports setting is read once per run. Their AI use shows under AI usage, keyed by job.
- One model call per string covers all of its languages. File jobs make one call per string per language (the CLI doesn't put several strings in one call), so this makes fewer calls than a file job for the same strings. Putting several strings in one call could lower it further later without changing the job.
- Format checks are go-svc's, with the string file's settings; file jobs check formats inside the CLI. The two can disagree on a file format go-svc doesn't know.
- A multi-word name meant to stay in English ("Google Analytics") is rejected as a copy on every run and shows as failed; translators fill it by hand. Each run's calls for it are charged.

## Alternatives considered

- **The file job's sandbox on a generated file of the chosen strings.** Reuses its batching, but strings from several files have different formats and placeholder rules, and the sandbox adds a cold start and a second way to fail for small jobs.
- **The benchmarked alternatives (2026-11-10).** Five engines were compared on the same 40 strings: this one, this one with the accept checks, the CLI in the sandbox, the CLI's prompt in the app, and several strings per call. Several strings per call used about a fifth of the input tokens and half the time at the same quality and is the likely next step; it is deferred as an optimisation. The sandbox was three times slower; copying the CLI's prompt brought its lack of max-length handling with it.
- **A separate Translate with AI… menu item (built first, replaced 2026-11-10).** It made the strings flow the only place where AI runs and tasks for people were separate actions; the file dialog already offers both as task types. Other platforms differ: Lokalise offers automatic translation as a task type in its New task dialog, Crowdin and Phrase Strings keep pre-translation as its own action, and Smartling, Crowdin Enterprise and Phrase TMS make it a step of a job's workflow.
- **A follow-up proofread task created automatically.** People can add the strings to a task afterwards; an automatic one would fill the jobs board for every run.
