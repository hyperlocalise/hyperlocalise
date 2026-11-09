# AI translation for chosen strings

**Status:** Accepted

## Context

[Key store and key jobs](2026-11-05-key-store-and-key-jobs-design.md) added tasks made of chosen strings (key jobs), for people only. AI translation ran on whole files (file jobs, through the CLI in a sandbox) or on one string at a time (string jobs and the content editor's suggestions). Other platforms translate a chosen set of strings in one action: Phrase Strings has **Pre-translate** for selected keys, and Crowdin pre-translates selected or filtered strings and filters AI pre-translation by label.

## Decision

- A key job may have kind `translation`. It is created like a proofread key job, from the ticked strings, with `kind: "translation"` and an optional `overwriteUnapproved` in its input. It starts **Queued**, runs, and ends **Succeeded** or **Failed** like other translation jobs. Proofread key jobs are unchanged.
- In the content editor, **Translate with AI…** in the selection menu creates it: languages, and whether to replace translations that are not approved yet. Anyone who may create file translation jobs may use it (`jobs:create`), and AI features must be available to the workspace.
- It runs in its own workflow, `keyTranslationJobWorkflow`, not in the file job's sandbox. Each string goes through the string job's path: the same context builder (glossary, translation memory, and knowledge memory when the workspace has it on, resolved by the job as file jobs do) and the workspace's model resolver, one model call per string for all its languages that need it. When part of an answer is unusable (a language missing, repeated or over the string's max length), the other languages are kept and the call's tokens still count. Strings are taken in small batches, one workflow step per batch, so a long job resumes where it stopped.
- What it writes:
  - by default, only translations that are missing or empty;
  - with `overwriteUnapproved`, also translations that are not approved;
  - never approved translations or strings locked in that language, checked again when writing;
  - never a translation someone else changed after the job planned its work, even when replacing unapproved ones, so edits made while the job runs are kept;
  - results are **Needs review**, origin machine, recorded in the string's history with the job as source, like string jobs.
- Charging follows file jobs: the job reserves one translation job at creation, and on success the tokens of every model call are added up and charged once with it. A job that translated at least one string succeeds, listing the languages where some strings failed. A job that translated nothing because every call failed is marked failed and not charged. A job with nothing left to translate makes no model call, succeeds, and is not charged.
- If a later batch fails after some strings were saved, the job succeeds with those, lists the rest as failed, and is charged for the calls it made.
- The run checks before each batch and in each save that the job is still running under it. After **Cancel**, a manual fail or a retry it stops at the next string and writes nothing more. Like a cancelled file job, a cancelled run is not charged.
- The open-job limit and the hourly rate apply, as for other AI jobs. Failed runs can be retried; the retry skips strings already translated.
- The job page's activity uses the existing events: started, strings found, progress per language, succeeded or failed.

## Consequences

- Reports does not count these jobs yet, as for proofread key jobs: its analysis and task fee are keyed on files.
- One model call per string covers all of its languages. File jobs make one call per string per language (the CLI doesn't put several strings in one call), so this makes fewer calls than a file job for the same strings. Putting several strings in one call could lower it further later without changing the job.
- Placeholder and format checks are the string job's, not the file job's per-format checks.

## Alternatives considered

- **The file job's sandbox on a generated file of the chosen strings.** Reuses its batching, but strings from several files have different formats and placeholder rules, and the sandbox adds a cold start and a second way to fail for small jobs.
- **A follow-up proofread task created automatically.** People can add the strings to a task afterwards; an automatic one would fill the jobs board for every run.
