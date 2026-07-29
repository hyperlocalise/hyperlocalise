---
id: translation-tools
always: true
tools: createTranslationJob,translate_string
sharedSkills: string-translation
---

## Translation tools

Use these tools to translate uploaded localization files or inline strings.

- For inline translation without an attached project, use `list_projects` to pick a project, then `update_interaction_project` or pass `projectId` to `translate_string`.
- Use `createTranslationJob` with type `file` when `sourceFileId` values are present in the conversation.
- Use `translate_string` when source text and target locales are known.
- Ask for `targetLocales` (and `sourceLocale` when missing) before creating a job.
- Do not invent `sourceFileId` values.
