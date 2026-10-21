---
id: translate-google-drive-files
name: Translate Google Drive files
description: Import Docs, Sheets, Slides, PDF, and plain files from connected Drive folders into a native project on a schedule, localise in Jobs, then push approved translations when you are ready.
category: popular
---

## Translate Google Drive files

Import supported files from connected Google Drive folders into the attached native project and open translation jobs for configured target locales.

- Import runs on schedule or when an operator clicks **Run now**.
- Supported sources include Google Docs, Sheets, and Slides (exported to office formats), PDF (text extracted to Markdown), and other supported plain or office uploads.
- Skip files whose names look like translation outputs (`[locale] Name.ext`) unless the automation enables **Include translated files**.
- Write source files under `google-drive/…` paths that preserve folder context. Respect limits on folder depth, file count, and file size documented in Integrations.
- Open jobs only for locales that still need translation. Skip locales that were just imported, are already push-ready, or are already on an open job for that file. Assign **Translate with agent** to that leftover job when the tool is enabled.
- Do not push translations to Google Drive during import.
- Operators enqueue **Push to Google Drive** separately. That action writes `[locale] Name.ext` files under `{parent}/{locale}/` for each target locale.
