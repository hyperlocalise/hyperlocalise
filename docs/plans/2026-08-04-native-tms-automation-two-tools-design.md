# Native TMS automation two-tool config

## Problem

`toolConfig.translation` / `translationEnabled` hid two distinct orchestrator
steps behind one vague toggle.

## Decision

Split enablement to match the orchestrator tools:

```ts
toolConfig: {
  createNativeTmsJob: {
    enabled: true,
    useProjectTargetLocales: true,
    targetLocales: [],
  },
  assignTranslateWithAgent: {
    enabled: true,
  },
}
```

Form fields mirror those keys. Locales live on Create job.

## Rules

- Translate with agent requires Create job
- Source-upload trigger requires Create job
- The translate-on-source-upload template enables both
- Legacy `toolConfig.translation.enabled` migrates to both tools on read/write

## Out of scope

- Changing orchestrator tool names
- Auto-provisioning automations per project
