---
id: crowdin-tms-read
name: Crowdin TMS read
activationIntents: translation
excludeIntents: repository
requiresNoFileAttachments: true
tools: list_projects,get_project_context,update_interaction_project,check_crowdin_progress
sharedSkills: crowdin
delegate: false
---

## Crowdin TMS read path

Use the tools from this skill directly for read-only Crowdin progress, status, and locale completion requests.

- Resolve the project by name with `list_projects` when the conversation is not attached to one yet.
- Attach the project with `update_interaction_project` or pass `projectId` to `check_crowdin_progress`.
- Do not delegate these requests to the translation agent.
