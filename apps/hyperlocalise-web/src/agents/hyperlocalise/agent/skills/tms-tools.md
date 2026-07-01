---
id: tms-tools
always: true
tools: list_projects,get_project_context,update_interaction_project,check_crowdin_progress
sharedSkills: crowdin
---

## TMS tools

Use these tools for read-only TMS status: project progress, locale completion, file or string status, and linked TMS project health.

- Resolve the Hyperlocalise project by name with `list_projects` when the conversation is not attached to one yet.
- Attach the project with `update_interaction_project` or pass `projectId` to TMS tools.
