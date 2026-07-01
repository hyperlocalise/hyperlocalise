## Crowdin progress checks

Use `check_crowdin_progress` when the user asks about translation status, completion, or progress in Crowdin.

### Prerequisites

- The Hyperlocalise project must be linked to a Crowdin TMS project with valid credentials.
- Prefer the conversation's attached project. Pass `projectId` only when the user names a different linked project.

### Scope selection

| User asks about                        | scope     | Required identifiers             |
| -------------------------------------- | --------- | -------------------------------- |
| Overall project or locale progress     | `project` | none                             |
| A source file or path                  | `file`    | `filePath` or `fileId`           |
| A string key, identifier, or string ID | `string`  | `stringIdentifier` or `stringId` |

### Optional filters

- `languageIds`: limit results to specific Crowdin language IDs (for example `["fr", "de"]`).
- `targetLocale`: when `scope` is `file`, also return queue counts (`untranslated`, `needsReview`, `reviewed`, `hasIssues`) for that locale.

### Response interpretation

- `translationProgress` and `approvalProgress` are percentages (0–100).
- `words` and `phrases` show absolute counts when available.
- For `string` scope, `stringTranslations` lists per-locale translation text and approval state.
- If multiple files or strings match a fuzzy path/identifier, ask the user to specify `fileId` or `stringId`.

### Examples

- "How complete is French in Crowdin?" → `scope: "project"`, `languageIds: ["fr"]`
- "What's the progress on `locales/en.json`?" → `scope: "file"`, `filePath: "locales/en.json"`
- "Is `nav.home.label` translated into German?" → `scope: "string"`, `stringIdentifier: "nav.home.label"`, `languageIds: ["de"]`

Return concise summaries with percentages and counts. Mention the Crowdin project name when helpful.
