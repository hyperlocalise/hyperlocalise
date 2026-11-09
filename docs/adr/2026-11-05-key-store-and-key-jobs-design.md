# Key store and key jobs

**Status:** Accepted

## Context

Teams moving from Phrase Strings work on keys, not files. They tag keys, link each key to the design where it appears, put a chosen set of keys into a job for people to work on, and mark translations verified per language.

Before this change a job covered one string or one file, keys had no tags or design link, and the content editor could not pick work by anything but file and filter.

Other platforms do this work in their editor first and offer the same actions through their API: Phrase Strings (batch "Add/remove tags", "Add to job", batch verify), Lokalise (bulk actions, "Create task" from selected keys), Transifex (bulk tags in the editor), Smartling ("Change Job" from the Strings View) and Crowdin (labels, tasks by label). This change is the editor side. The public API side is a separate change with its own record.

## Decision

### Tags and a design link on each key

- `project_translation_keys` gains `tags text[]` (default empty, GIN index) and `design_url text`.
- A tag is 1 to 64 letters, digits, `_` or `-`, the rule the content editor already uses for Crowdin labels, so native projects reuse the editor's label filter (include all / include any, exclude all / exclude any). One request adds or removes at most 20 tags.
- A design link is one http or https address per key, such as a Figma frame. Setting a new one replaces the old one. Only http and https links are stored or shown, so a link can't run script when opened.
- The rules live in `internal/keymeta`, so every service that writes tags or links accepts the same values.
- The content editor shows a key's tags and design link in the context panel, not on the queue row, because the row's tags are read back as the string type. Admins, localization managers and developers (the `projects:write` roles, who manage a project's strings) add and remove tags and set, change or clear the link there, and tag many strings at once with **Edit tags…** in the selection menu. Translators and reviewers see them read-only, as in Phrase, Lokalise and Crowdin, where editing keys is a manager's or developer's job. The editor saves through go-svc (`POST .../cat/strings/tags`, `POST .../cat/segments/{id}/design-url`), next to its hide, lock and character limit routes. Grouped rows stand for several strings, so they offer no editing, as for source text.

### "Verified" is "approved"

Phrase's verified translation is our approved translation, and unverified is needs review. No new state is added: approval is already per string and language, the editor approves one string or the ticked ones, editing an approved translation sends it back to review, and the project setting **When source text changes** sends approved translations back to review when the source changes, which is Phrase's main reason to unverify. The content editor docs give Phrase users the mapping.

### Key jobs

- `translation_job_type` gains `keys`. A new table `translation_job_keys (job_id, translation_key_id)` lists a job's keys. The job's languages stay in `input_payload.targetLocales`, as for every other job, so lists, the job page and the job `PATCH` read them unchanged.
- A key job is a task for people: kind `proofread`, status `waiting_for_review`, never queued and never sent to an AI model. People finish it with **Mark done**, as for any proofread task. There is no reopen, and no per-language completion, because jobs have one status.
- In the content editor, with strings ticked, **Add to a task…** creates a new key job (title, languages, optional due date and description; the owner is set on the job page) through the in-app project jobs route with `type: "keys"`, or adds them to an open key job of the project through `POST /api/orgs/{slug}/projects/{projectId}/jobs/{jobId}/keys`. This follows Phrase's "Add to job", Lokalise's "Create task" and Smartling's "Change Job" from selected strings. Anyone who may create jobs (`jobs:create`) may use them, the rule for every other job here; Phrase, Crowdin and Transifex keep it to managers.
- The dialog takes only the ticked strings, like every other action in the selection menu, and the job routes take string ids, not a filter. The editor loads 50 strings at a time, so a bigger task means loading more rows before **Select all**. Selecting every string that matches the filter, loaded or not, is left for a later change to the editor's selection, so that all its actions follow it; Lokalise's **Select all** works that way.
- Hidden keys and keys in no file can't join (the content editor only shows strings that belong to a file). Creating a key job is not held back by the 50-open-jobs limit, and open key jobs don't count towards it; the hourly creation rate still applies.
- The content editor's queue takes a `jobId` in its advanced filter. The job page opens the project content editor with that filter and no status filter, so people see every string of the job.

### Screenshots

Screenshots are attached one string at a time in the content editor, as before. Attaching one screenshot to many selected strings (Phrase, Smartling) is left for later.

## Consequences

- A key hidden after it joined a job stays in the job, but its count and the editor queue leave it out like any hidden key. It comes back when it is shown again.
- A key job has no source file, so Reports does not match editor saves to it and charges no task fee for it. The match is keyed on files today.
- A task bigger than the loaded rows needs scrolling until the later selection change lands.
- No AI translation runs for a key job. Translations come from the existing file jobs, editor suggestions or people.
- Tag and link changes are not in the activity log yet: an event type is a contract shared by two services.

## Alternatives considered

- **The API first, the editor later.** WEEX's automation calls Phrase's API for this work today, but every platform compared offers it in the editor too, and people without scripts could not tag or link at all.
- **An "every string matching the filter" choice in the task dialog.** Built first, then dropped: it was the only action in the selection menu to reach past the ticked strings, and a status filter is judged in one language while the task covers several, so it was unclear which strings it meant.
- **Keys in the job's JSON input.** Would need JSON containment for the editor filter and for progress, and could not cascade when a key is deleted.
- **Tags and design links in key `metadata`.** No migration, but several services rewrite `metadata` without locking, so a tag write could be lost.
- **Many design links per key (like Phrase's Figma attachments).** WEEX attaches one link per request, so one link per key covers it. A link table can replace the column later.
- **A separate "verified" state.** Approved already records who reviewed it and when, per key and language.
- **Running AI translation inside key jobs.** It needs its own workflow, batching and billing, which is larger than the rest of this change. It can be added later as kind `translation`.
