# Crowdin Steward's Journal

## 2026-05-08 - Fix Project model parity for DelayedWorkflowStart and AiPreTranslate

**Learning:** Crowdin API v2 uses `delayedWorkflowStart` as the JSON field name for delaying workflows, but the SDK was using `delayedTranslations`. Additionally, the `aiPreTranslate` field was missing from the `Project` response model despite being present in `ProjectsAddRequest`.

**Action:** Updated `DelayedWorkflowStart` JSON tags in both `Project` and `ProjectsAddRequest` models. Added `AiPreTranslate` field to the `Project` model to ensure full response parity. Verified with contract tests using real API JSON shapes.
