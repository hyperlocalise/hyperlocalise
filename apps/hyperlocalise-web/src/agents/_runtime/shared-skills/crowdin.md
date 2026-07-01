---
id: crowdin
name: Crowdin TMS
provider: crowdin
---

## Crowdin TMS

Use Crowdin tools when the user asks about translation work in a Hyperlocalise project linked to Crowdin. This skill covers all Crowdin-specific agent capabilities; new tools are added here as the integration grows.

### Prerequisites

- The Hyperlocalise project must be linked to a Crowdin TMS project with valid organization credentials.
- Prefer the conversation's attached project. Pass `projectId` only when the user names a different linked project.
- When no project is attached, call `list_projects` to find the project by name, then `update_interaction_project` or pass `projectId` to `check_crowdin_progress`.
- Do not ask the user for Crowdin API tokens or personal access tokens.

### General rules

- Choose the tool and scope that best matches the user's request.
- Resolve ambiguous file paths or string identifiers before answering; ask for `fileId` or `stringId` when multiple matches exist.
- Summarize results concisely with percentages, counts, and the Crowdin project name when helpful.
- If Crowdin is not configured for the project, say so clearly and stop — do not guess progress.

### Available tools

#### `check_crowdin_progress`

Check translation and approval progress for a Crowdin project, source file, or string.

| User asks about                        | `scope`   | Required identifiers             |
| -------------------------------------- | --------- | -------------------------------- |
| Overall project or locale progress     | `project` | none                             |
| A source file or path                  | `file`    | `filePath` or `fileId`           |
| A string key, identifier, or string ID | `string`  | `stringIdentifier` or `stringId` |

Optional parameters:

- `languageIds`: limit results to specific Crowdin language IDs (for example `["fr", "de"]`).
- `targetLocale`: when `scope` is `file`, also return queue counts (`untranslated`, `needsReview`, `reviewed`, `hasIssues`) for that locale.

Response fields:

- `translationProgress` and `approvalProgress` are percentages (0–100).
- `words` and `phrases` show absolute counts when available.
- For `string` scope, `stringTranslations` lists per-locale translation text and approval state.

Examples:

- "How complete is French in Crowdin?" → `scope: "project"`, `languageIds: ["fr"]`
- "What's the progress on `locales/en.json`?" → `scope: "file"`, `filePath: "locales/en.json"`
- "Is `nav.home.label` translated into German?" → `scope: "string"`, `stringIdentifier: "nav.home.label"`, `languageIds: ["de"]`
