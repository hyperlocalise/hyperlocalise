# Activity log batch events, provenance and undo

**Status:** Proposed

## Context

The activity log records one `string_segment_*` event per string. Approving many strings writes one row per string, and a translation job writes no completion event at all. Reviewers cannot see what an AI run did, which model it used, or which guidelines shaped it, and cannot undo a run from the log.

Most of the undo machinery already exists:

- Every write to `project_translations` appends a row to `project_translation_revisions` in the same transaction.
- Writes made together share an `operation_id`: `job:<jobId>` for translation jobs, `import:<uuid>` for file imports, a UUID for editor group saves, and `undo:<uuid>` for undos.
- `POST .../files/detail/cat/operations/{operationId}/undo` in go-svc puts every string an operation wrote back to its earlier version. Strings changed since, or locked, are skipped and counted. Only the content editor's per-string history panel calls it.

What is missing:

- **No batch events.** There is no event for a finished translation job, a batch of approvals, or an import with its counts per locale.
- **No provenance.** Generation context is lost:
  - String jobs merge the project guideline, the workspace guideline and uploaded guideline passages into one text before calling the model. The versions used are not kept.
  - File jobs send the CLI the project translation context, the job's free-text `instructions` and matched glossary terms. They do not load guidelines at all.
  - The model is resolved in both paths (`OrganizationModelResolver`, `resolveSandboxLlmProfile`) but is recorded only in billing usage.
- **Approvals have no operation.** `updateTranslationStatus` writes a revision without an `operation_id`, and there is no bulk approve endpoint.
- **Undo is too narrow.** It refuses operations over 1,000 strings (`editorCatMaxGroupSaveOccurrences`), cannot target one locale of a multi-locale job, and lives under a file-scoped route.

## Decision

### 1. Batch events

Add events that summarize one operation in one locale. The per-string events stay, because Reports capture and the per-string history read them.

| Event | Emitted when | Target |
| --- | --- | --- |
| `translations_generated` | A translation job finishes writing translations for a locale | `job` |
| `translations_approved` | A bulk approve commits | `project` |
| `translations_imported` | A file import finishes for a locale (replaces the role of `file_translations_imported` in the log UI; the old event stays readable) | `file` |

Common payload fields:

```ts
type TranslationBatchPayload = {
  operationId: string; // matches project_translation_revisions.operation_id
  projectId: string;
  targetLocale: string;
  itemCount: number; // translations whose text or status changed
  sourcePath?: string; // set when the operation covers one file
  jobId?: string;
};
```

`itemCount` is the number of revision rows the operation wrote for that locale, counted after the write commits, so it matches what undo would restore.

A new `POST .../cat/translations/status/bulk` endpoint approves or rejects a list of strings for one locale under one `operation_id`. It writes one revision per string, one `string_segment_approved` event per string as today, and one `translations_approved` event. Single-string approvals keep their current behaviour. The log UI merges a person's consecutive `string_segment_approved` events for the same locale and project that are less than five minutes apart into one row, but those merged rows have no Undo.

### 2. Generation provenance

Each translation job records what it was given when it is about to call the model. A new `generation_provenance` jsonb column on `jobs` stores it, and `translations_generated` copies it into its payload so the log can render without a join.

```ts
type GenerationProvenance = {
  trigger?:
    | { kind: "automation"; automationId: string; runId: string; name: string }
    | { kind: "api_key"; apiKeyId: string }
    | { kind: "conversation"; interactionId: string }
    | { kind: "user"; userId: string };
  model: {
    provider: string;
    model: string;
    credentialSource: "byok" | "gateway"; // same values as CliBilledTokenUsage
  };
  guidelines: {
    project?: { revisionId: string; version: number };
    workspace?: { revisionId: string; version: number };
    documents: Array<{
      documentId: string;
      revisionId: string;
      version: number;
      title: string;
      mandatory: boolean;
      locale?: string;
      omitted?: true; // mandatory but did not fit the context budget
    }>;
  };
  glossaries: Array<{ glossaryId: string; name: string; termCount: number }>;
  translationMemories: Array<{ memoryId: string; name: string; matchCount: number }>;
  customInstructions: boolean;
};
```

An automation that enqueues a job writes `trigger` when it enqueues. Other triggers come from the job's `apiKeyId`, `interactionId` or `createdByUserId` when provenance is recorded.

Rules:

- Store identity, never content. Guideline text, passages, instructions and prompts stay out, as `FORBIDDEN_ACTIVITY_PAYLOAD_KEYS` already requires. Document titles are allowed, like file names today.
- `TranslationContextBuilder.build` returns the provenance alongside the merged text. `getKnowledgeMemoryForProject` and `getKnowledgeMemoryForOrganization` already return `revisionId` and `version`. The go-svc guideline retrieve response adds `revisionId` and `version` to each returned document.
- A guideline is listed only when a non-empty excerpt of it reached the prompt. A guideline whose selection came back empty, or a job with `knowledgeMemoryEnabled: false`, lists nothing.
- One job can call the model many times. Uploaded passages are retrieved per string, so a job records the union of documents across calls, each once at the version used. The first model and guideline versions resolved for the job are kept. A guideline saved mid-job does not change the record.
- File jobs load project, workspace and uploaded guidelines the way string jobs do, and pass them to the CLI in the system prompt. They record the model from `resolveSandboxLlmProfile`, the guidelines used, the glossaries whose terms were sent, and whether `instructions` was set.

The log row names what shaped the run, not version numbers:

> Auto-translation added {count} translations into {locale} on behalf of {actor}
> via {trigger} · {model} ({own key or Hyperlocalise}) · Guidelines: {guideline names} · Glossary: {glossary names}

- Each guideline name opens the version the run used.
- A guideline saved since the run is tagged "updated since", so a reviewer can tell whether a re-run would see different guidance. The row compares the recorded revision with the current one when it renders.

Expanding the row shows a "Context used" panel:

- Each guideline with its scope (project, workspace or uploaded document), when that version was saved and by whom, "View this version" and "Compare with current". Uploaded documents say whether they were always included or picked by search, and flag mandatory documents that did not fit.
- Glossaries and translation memories by name, with how many terms or matches were used.
- Whether custom instructions were set. Viewers who can read the project see the text, read from the job, not from the log.

Which terms and guideline passages applied to each string is a later addition.

### 3. Undo from the log

- Move the endpoint to `POST /v1/orgs/{slug}/projects/{projectId}/operations/{operationId}/undo`, with an optional `targetLocale` body field. Keep the old route as an alias until the content editor moves.
- Add `targetLocale` to the member query, so undoing one locale leaves the other locales of the same job alone.
- Remove the 1,000-string limit. The handler locks keys and restores in pages of 500 inside one transaction per page, and returns a `jobId` when the operation exceeds 5,000 strings so the work continues in the background and reports progress.
- The undo's own `undo:<uuid>` operation emits a `translations_reverted` event with `revertedOperationId`, `targetLocale`, `restoredCount`, `skippedChangedCount` and `skippedLockedCount`.
- The log reads `translations_reverted` events for the operations on the page and marks the originals "Undone by {actor}". The Undo button shows only when the event has an `operationId`, no matching revert exists, and the viewer can edit the project.
- Undo reads only `project_translation_revisions`. Activity events are delivered best effort, so the log row provides the `operationId` and never the list of strings.

### 4. Log UI

- Group rows by local day (Today, Yesterday, then dates) and show clock time. The full timestamp stays in the tooltip.
- Build each sentence from the payload with ICU plurals and locale display names, instead of "actor · action · target".
- Expanding a batch row lists the affected strings, paged from `project_translation_revisions` by `operation_id` and `target_locale`, with before and after text for viewers who can read the project.
- Undo opens a confirmation, then a toast with restored and skipped counts, as the content editor history panel does today.

## Consequences

- Reviewers can see what each AI run did, with which model and which guideline versions, and undo it per locale.
- `jobs` gains one nullable jsonb column. Events gain four types. Older events render as before.
- Large undos move from a request to a background job above 5,000 strings.
- Per-string events are unchanged, so Reports capture and string history are unaffected. Undo writes already carry the `undo:` prefix that Reports ignores.
- File jobs start following guidelines, which changes their output for workspaces that have guidelines saved.
