---
id: tms-tools
requiresTmsIntegration: true
tools: check_crowdin_progress,search_crowdin_glossary
sharedSkills: crowdin
---

## TMS tools

Use these tools for read-only Crowdin status: project progress, locale completion, and file or string status. When glossary search is enabled for this turn, also use Crowdin glossary concordance for terminology.

- Resolve the Hyperlocalise project by name with `list_projects` when the conversation is not attached to one yet.
- Attach the project with `update_interaction_project` or pass `projectId` to TMS tools when project scope helps.
- When `search_crowdin_glossary` is available, use it for terminology advice on Crowdin-linked work before guessing whether a term stays in English.
