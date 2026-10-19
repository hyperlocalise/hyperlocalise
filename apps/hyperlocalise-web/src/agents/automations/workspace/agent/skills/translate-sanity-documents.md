---
id: translate-sanity-documents
name: Translate Sanity documents
description: Import Sanity documents into a native project on a schedule, localise in Jobs, then push approved translations when you are ready.
category: popular
---

## Translate Sanity documents

Import changed Sanity documents into the attached native project and open translation jobs for configured target locales.

- Import runs on schedule or when an operator clicks **Run now**.
- Write one JSON source file per document at `sanity/{projectId}/{dataset}/{documentType}/{slug}-{id}.json`.
- When a mapped target locale already has Sanity translation content, import that copy into Hyperlocalise as an approved translation when the existing translation policy allows it.
- Open jobs only for locales that still need translation. Skip locales that were just imported, are already push-ready, or are already on an open job for that file. Assign **Translate with agent** to that leftover job when the tool is enabled.
- Map project locales onto Sanity language tags by exact tag first, then language-only aliases such as `en` ↔ `en-US` when only one regional form is present.
- Do not push translations to Sanity during import.
- Operators enqueue **Push to Sanity** separately. That action writes Sanity draft documents. It does not publish.
