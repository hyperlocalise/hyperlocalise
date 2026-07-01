---
id: translation-tools
requiresProjectOrAttachments: true
tools: createTranslationJob,translate_string
sharedSkills: string-translation
---

## Translation tools

Use these tools to translate uploaded localization files or inline strings.

- Use `createTranslationJob` with type `file` when `sourceFileId` values are present in the conversation.
- Use `translate_string` when source text and target locales are known.
- Ask for `targetLocales` (and `sourceLocale` when missing) before creating a job.
- Do not invent `sourceFileId` values.
