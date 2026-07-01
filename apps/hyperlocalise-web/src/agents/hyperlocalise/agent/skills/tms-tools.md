---
id: tms-tools
requiresTmsIntegration: true
tools: check_crowdin_progress
sharedSkills: crowdin
---

## TMS tools

Use these tools for read-only status in the workspace's linked TMS: project progress, locale completion, file or string status, and sync health.

- Resolve the Hyperlocalise project by name with `list_projects` when the conversation is not attached to one yet.
- Attach the project with `update_interaction_project` or pass `projectId` to TMS tools.
