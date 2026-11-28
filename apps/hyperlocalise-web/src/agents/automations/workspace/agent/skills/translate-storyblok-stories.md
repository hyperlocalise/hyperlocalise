---
id: translate-storyblok-stories
name: Translate Storyblok stories
description: Import Storyblok stories into a native project on a schedule, localise in Jobs, then push approved translations when you are ready.
category: popular
---

## Translate Storyblok stories

Import changed Storyblok stories into the attached native project and open translation jobs for configured target locales.

- Import runs on schedule or when an operator clicks **Run now**.
- Read each story's translatable fields with Storyblok's translation export. The space's plan must include translation export and import.
- Write one JSON source file per story at `storyblok/{spaceId}/{full slug}.json`. Keys are Storyblok's export keys; keep them unchanged.
- Limit import to the configured folders. With no folders, import every story in the space.
- Map project target locales onto the space's languages. Skip targets with no matching language.
- The space's default language is the source.
- Do not push translations to Storyblok during import.
- Operators enqueue **Push to Storyblok** separately. That action writes approved translations as field-level translations and does not publish the story.
