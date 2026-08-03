---
id: tms-tools
requiresTmsIntegration: true
tools: check_crowdin_progress,search_crowdin_glossary
sharedSkills: crowdin
---

## TMS tools

Use these tools for read-only Crowdin status and terminology: project progress, locale completion, file or string status, and glossary concordance.

- Resolve the Hyperlocalise project by name with `list_projects` when the conversation is not attached to one yet.
- Attach the project with `update_interaction_project` or pass `projectId` to TMS tools when project scope helps.
- For terminology advice on Crowdin-linked work, use `search_crowdin_glossary` before guessing whether a term stays in English.
