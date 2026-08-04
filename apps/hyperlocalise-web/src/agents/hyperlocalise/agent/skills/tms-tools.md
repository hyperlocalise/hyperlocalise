---
id: tms-tools
requiresTmsIntegration: true
tools: check_crowdin_progress
sharedSkills: crowdin
---

## TMS tools

Use these tools for read-only Crowdin status: project progress, locale completion, and file or string status.

- Resolve the Hyperlocalise project by name with `list_projects` when the conversation is not attached to one yet.
- Attach the project with `update_interaction_project` or pass `projectId` to TMS tools when project scope helps.
