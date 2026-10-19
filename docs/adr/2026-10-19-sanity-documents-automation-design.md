# Sanity document automation design

**Status:** Accepted  
**Date:** 2026-10-19

## Context

Hyperlocalise already connects to Intercom for Help Center import and push. Sanity customers need the same automation shape: scheduled or manual import into native projects, translation in Jobs, and operator-triggered push of approved locales back as Sanity drafts.

Sanity content lives in a project/dataset with document-level or field-level internationalization. Tokens arrive through WorkOS Pipes like other CMS integrations.

## Decision

Mirror the Intercom automation wiring:

- `toolConfig.sanity` stores project, dataset, document types, locale mapping, draft policy, and existing-translation policy.
- Orchestrator tools `import_sanity_documents` and `push_sanity_translations` call `runImportSanityDocuments` / `runPushSanityTranslations` in `@/lib/sanity`.
- Push runs use `operation: push_approved` in the run input snapshot, same as Intercom.
- Content editor exposes **Ingest** and **Push to Sanity** when an active Sanity automation is attached to the project.
- Integrations uses a dedicated Sanity connection panel (Pipes) instead of the generic CMS pipes row.

Import/push business logic and sync-state tables are implemented incrementally; wiring exposes stable entry points and API routes for project/dataset discovery.

## Consequences

- Automations, validation, and UI follow Intercom patterns, reducing drift.
- Sanity-specific i18n detection stays in `@/lib/sanity` (document vs field modes, language tags).
- Push eligibility reuses the same GET automation detail shape (`sanityPush`) as `intercomPush`.
