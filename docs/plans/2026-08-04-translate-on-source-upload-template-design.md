# Translate on source upload template

## Problem

Native TMS already dispatches `source_upload` automations that create a job and
run Translate with agent. Users still had to assemble that flow by hand. The
Automations gallery had no activatable template for it.

## Decision

Add one activatable workspace automation template:

- **Trigger:** source upload
- **Tools:** create native TMS job → Translate with agent
- **Defaults:** use project target locales

Ship it as:

1. Skill `translate-on-source-upload` under the workspace orchestrator agent
2. Matching gallery entry in `WORKSPACE_AUTOMATION_TEMPLATES_BASE`
3. Template flow labels for source upload and the two translation tools

## Scope

- Gallery template + skill merge only
- Reuse existing ingest → dispatch → orchestrator tools

## Out of scope

- New orchestrator tools or job statuses
- Auto-provisioning the automation for every project
- External TMS (Crowdin/Phrase/Lokalise/Smartling) upload paths

## Data flow

```
source upload
  → source file ingest
  → source_upload workspace automation
  → create_native_tms_job
  → assign_translate_with_agent
  → file translation workflow
```

## Activation

Activating the template opens the automation form with:

- `triggerMode: source_upload`
- `translationEnabled: true`
- `translationUseProjectTargetLocales: true`

The user chooses a project, then saves. After ingest of a new source version,
matching active automations dispatch as today.
