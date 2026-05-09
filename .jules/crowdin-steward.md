# Crowdin Steward's Journal

## 2026-05-08 - Fix Project model parity for DelayedWorkflowStart and AiPreTranslate

**Learning:** Crowdin API v2 uses `delayedWorkflowStart` as the JSON field name for delaying workflows, but the SDK was using `delayedTranslations`. Additionally, the `aiPreTranslate` field was missing from the `Project` response model despite being present in `ProjectsAddRequest`.

**Action:** Updated `DelayedWorkflowStart` JSON tags in both `Project` and `ProjectsAddRequest` models. Added `AiPreTranslate` field to the `Project` model to ensure full response parity. Verified with contract tests using real API JSON shapes.

## 2026-05-15 - Improve Task model parity for Crowdin API v2

**Learning:** Several fields in the Crowdin Tasks API were missing from the Go SDK models. Specifically, `translateProgress` and `splitFiles` were absent from the `Task` response model. Additionally, task creation forms for both standard and Enterprise projects were missing flags like `skipUntranslatedStrings`, `includeUntranslatedStringsOnly`, and `splitFiles`.

**Action:** Added `TranslateProgress` (*TaskProgress) and `SplitFiles` (*bool) to the `Task` response struct. Updated `TaskCreateForm`, `EnterpriseTaskCreateForm`, and vendor-specific creation forms to include missing boolean flags (`SkipUntranslatedStrings`, `IncludeUntranslatedStringsOnly`, `SplitFiles`). Verified serialization and response parsing with updated contract tests in `tasks_test.go`.
