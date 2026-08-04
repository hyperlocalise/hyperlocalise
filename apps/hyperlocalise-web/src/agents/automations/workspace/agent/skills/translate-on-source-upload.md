---
id: translate-on-source-upload
name: Translate on source upload
category: popular
defaultTrigger: source_upload
activatable: true
---

Create a native translation job when a source file is uploaded, then translate it with the Hyperlocalise agent.

Workflow:

- Read the uploaded source file and version from the source-upload trigger.
- Create a native TMS translation job for the project target locales.
- Assign the job to Translate with agent so localisation starts immediately.
- Preserve keys, placeholders, ICU syntax, glossary terms, and file structure.
- Summarize the job created and locales started for translation.
