# Crowdin Steward's Journal

## 2026-05-08 - Fix Project model parity for DelayedWorkflowStart and AiPreTranslate

**Learning:** Crowdin API v2 uses `delayedWorkflowStart` as the JSON field name for delaying workflows, but the SDK was using `delayedTranslations`. Additionally, the `aiPreTranslate` field was missing from the `Project` response model despite being present in `ProjectsAddRequest`.

**Action:** Updated `DelayedWorkflowStart` JSON tags in both `Project` and `ProjectsAddRequest` models. Added `AiPreTranslate` field to the `Project` model to ensure full response parity. Verified with contract tests using real API JSON shapes.

## 2026-05-15 - Improve Task model parity for Crowdin API v2

**Learning:** Several fields in the Crowdin Tasks API were missing from the Go SDK models. Specifically, `translateProgress` and `splitFiles` were absent from the `Task` response model. Additionally, task creation forms for both standard and Enterprise projects were missing flags like `skipUntranslatedStrings`, `includeUntranslatedStringsOnly`, and `splitFiles`.

**Action:** Added `TranslateProgress` (*TaskProgress) and `SplitFiles` (*bool) to the `Task` response struct. Updated `TaskCreateForm`, `EnterpriseTaskCreateForm`, and vendor-specific creation forms to include missing boolean flags (`SkipUntranslatedStrings`, `IncludeUntranslatedStringsOnly`, `SplitFiles`). Verified serialization and response parsing with updated contract tests in `tasks_test.go`.

## 2026-05-22 - Add SourceString parity for hasPlurals and isIcu

**Learning:** The Crowdin Source Strings API v2 returns `hasPlurals` and `isIcu` fields which were missing from the `SourceString` model. Additionally, `isIcu` can be specified when adding a new string but was missing from `SourceStringsAddRequest`.

**Action:** Added `HasPlurals`, `IsIcu`, `CommentsCount`, and `IssuesCount` fields to the `SourceString` response model and `IsIcu` (*bool) to the `SourceStringsAddRequest` model. Updated contract tests to verify correct parsing and serialization of these fields. Fixed a typo in the `SourceStringsAddRequest` documentation comment.

## 2026-05-29 - Improve Pre-Translation parity for branches and directories

**Learning:** The Crowdin API v2 Apply Pre-Translation endpoint supports `branchIds` and `directoryIds` in the request body, allowing for more granular targeting than just `fileIds`. Additionally, the response attributes include `directoryIds`.

**Action:** Added `BranchIDs` and `DirectoryIDs` to `PreTranslationRequest` and `DirectoryIDs` to `PreTranslationAttributes` in `model/translations.go`. Updated `PreTranslationRequest.Validate()` to require at least one of `fileIds`, `branchIds`, or `directoryIds`. Verified with updated unit tests.

## 2026-06-05 - Improve Pre-Translation parity and fix TagsDetection typo

**Learning:** The Pre-Translation status response includes an `eta` field and several attributes (`engineId`, `aiPromptId`, `fallbackLanguages`, `labelIds`, `excludeLabelIds`) that were missing from the SDK models. Additionally, documentation for `TagsDetection` was using incorrect values for "Skip tags".

**Action:** Added `ETA` to `PreTranslation` and missing fields to `PreTranslationAttributes`. Used `*int` for `EngineID` and `AIPromptID` to correctly handle zero values vs omission. Updated `PreTranslationRequest` to include these fields as well. Corrected the `TagsDetection` comment in `ProjectsAddRequest`. Updated contract tests to verify parsing of these new fields.

## 2026-06-12 - Improve Glossary and TM model parity for description and groupId

**Learning:** Crowdin API v2 for Glossaries and Translation Memories includes a `description` field for both, and Translation Memories also support a `groupId` field in both responses and addition requests. These fields were missing from the Go SDK models, preventing users from fully managing these resources, especially in Enterprise environments where resource organization into groups is common.

**Action:** Added `Description` field to `Glossary` and `GlossaryAddRequest` in `model/glossaries.go`. Added `Description` and `GroupID` fields to `TranslationMemory`, and `GroupID` (*int) to `TranslationMemoryAddRequest` in `model/translation_memory.go`. Updated contract tests in `glossaries_test.go` and `translation_memory_test.go` to verify correct parsing and serialization.

## 2026-05-17 - Improve SourceString parity for masterStringId, isIcu, and excludeLabelIds

**Learning:** The Crowdin Source Strings API v2 supports adding duplicate strings by specifying a `masterStringId` and filtering strings by their ICU status (`isIcu`) or by excluding specific labels (`excludeLabelIds`). These parameters were missing from the SDK's `SourceStringsAddRequest` and `SourceStringsListOptions`.

**Action:** Added `MasterStringID` (*int) to `SourceStringsAddRequest`. Added `IsIcu` (*int) and `ExcludeLabelIDs` ([]int) to `SourceStringsListOptions`. Updated `SourceStringsListOptions.Values()` to correctly encode these parameters in query strings. Verified with updated unit tests in `source_strings_test.go`.

## 2026-05-18 - Improve File model parity and Recursion handling

**Learning:** The Crowdin Files API v2 returns `isReadOnly` for both files and directories, and file updates support `excludedTargetLanguages` and `fields`. Additionally, the `recursion` parameter in list operations is documented as `any` but was only handled as `string` in the SDK, causing issues when passed as `bool` or `int`.

**Action:** Added `IsReadOnly` (*bool) to the `File` model and `ExcludedTargetLanguages` ([]string) and `Fields` (map[string]any) to `FileUpdateRestoreRequest`. Updated `DirectoryListOptions` and `FileListOptions` to handle `Recursion` using `fmt.Sprintf("%v", ...)` to support all common types. Verified with updated contract tests in `source_files_test.go` and `model/source_files_test.go`.

## 2026-06-19 - Improve Bundle and Task model parity for ETA and workflowStepId

**Learning:** The Crowdin Bundles API v2 returns an `eta` field in bundle export responses, and the Tasks API supports filtering by `workflowStepId` via query parameters. These were missing from the Go SDK models and request options.

**Action:** Added `ETA` to the `BundleExport` model in `model/bundles.go`. Added `WorkflowStepID` to `TasksListOptions` and updated its `Values()` method in `model/tasks.go` to encode it. Updated contract tests in `bundles_test.go` and `tasks_test.go` to verify parity.

## 2026-06-26 - Fix Organization Webhooks path and improve model parity for WebURL

**Learning:** The Crowdin API v2 for Organization Webhooks (account-level) uses the path `/api/v2/webhooks`, unlike project webhooks which are under `/api/v2/projects/{projectId}/webhooks`. The SDK was incorrectly using the project-specific path for account-level additions. Additionally, many core models like Branch, Directory, and File include a `webUrl` field in their responses which was missing from the SDK.

**Action:** Updated `OrganizationWebhooksService.Add` to use the correct account-level path and removed the redundant `projectID` parameter. Added `WebURL` field to `Branch`, `Directory`, and `File` models in `model/branches.go` and `model/source_files.go`. Updated comprehensive test suites in `webhooks_organization_test.go`, `branches_test.go`, and `source_files_test.go` to verify correct parsing and serialization.

## 2026-06-26 - Improve Glossary and TM model parity for updatedAt and translationOfTermId

**Learning:** The Crowdin API v2 for Glossaries and Translation Memories returns an `updatedAt` field in their resource responses, which was missing from the Go SDK models. Additionally, the Add Term endpoint supports a deprecated `translationOfTermId` field for linking translations, which can still be useful for legacy integrations.

**Action:** Added `UpdatedAt` (string) to `Glossary` and `TranslationMemory` models. Added `TranslationOfTermID` (int) to `TermAddRequest`. Updated contract tests in `glossaries_test.go` and `translation_memory_test.go` to verify correct parsing and serialization of these fields.

## 2026-07-03 - Improve Project and TM parity for Enterprise fields and GroupID filtering

**Learning:** Crowdin Enterprise API v2 includes several fields in the Project response model (`templateId`, `vendorId`, `mtEngineId`) that were missing from the SDK. Additionally, listing projects and translation memories supports filtering by `groupId`. Using `*int` for the GroupID field allows the SDK to explicitly send `groupId=0` (for root group) while omitting it when nil.

**Action:** Added `TemplateID`, `VendorID`, and `MTEngineID` to the `Project` struct in `model/projects.go`. Added `GroupID (*int)` to `ProjectsListOptions` and `TranslationMemoriesListOptions`. Updated `Values()` methods to correctly encode the `groupId` parameter. Verified with updated contract tests in `projects_test.go` and `model/translation_memory_test.go`.

## 2026-05-23 - Optimize Values() allocations and fix AI model typos

**Learning:** Using `fmt.Sprintf("%d", id)` in `Values()` methods for query parameter serialization causes unnecessary allocations in hot paths. Replacing it with `strconv.Itoa(id)` is more efficient. Additionally, several typos (e.g., `AIPromtsListOptions`, `configuraion`) and duplicate fields (`MaxExamplesCount`) were identified in the AI model.

**Action:** Optimized `Values()` methods across all model files using `strconv.Itoa`. Fixed typos and removed duplicate fields in `model/ai.go`, propagating the corrected `AIPromptsListOptions` name throughout the fork. Corrected `ProjectsListResponse` documentation comment and removed redundant `Languages` field from `ProjectsAddRequest`. Verified with full test suite passing in the fork.

## 2026-07-10 - Improve Task model parity and fix AI model comments/typos

**Learning:** The Crowdin Tasks API v2 supports filtering by `labelIds` and `excludeLabelIds`, and Enterprise task creation supports `branchIds`. These were missing from the SDK models. Additionally, some comments in the AI model were inaccurate, and redundant fields like `Languages` in `ProjectsAddRequest` (replaced by `TargetLanguageIDs`) should be removed to avoid confusion.

**Action:** Added `LabelIDs` and `ExcludeLabelIDs` to `TasksListOptions` and updated `Values()` for correct query parameter encoding. Added `BranchIDs` to Enterprise task creation forms and updated `ValidateRequest` to include them. Corrected documentation comments and fixed a loop typo in the AI service. Removed redundant `Languages` field from `ProjectsAddRequest`. Verified with new unit tests and full test suite passing.

## 2026-07-17 - Improve Translation Status parity for progress filtering

**Learning:** Several "Get Progress" endpoints in Crowdin API v2 support optional query parameters for granular filtering that were missing from the Go SDK. Specifically, branch, directory, and file progress can be filtered by `languageIds`, and language progress can be filtered by `fileIds`, `branchIds`, and `directoryIds`.

**Action:** Defined `TranslationProgressListOptions` (with `LanguageIDs`) and `LanguageProgressListOptions` (with `FileIDs`, `BranchIDs`, `DirectoryIDs`) in `model/translation_status.go`. Updated `TranslationStatusService` methods to use these specific option structs. Maintained backward compatibility for `GetProjectProgress` by aliasing `ProjectProgressListOptions` to the new `TranslationProgressListOptions`. Verified correct query parameter encoding with new functional tests in `translation_status_test.go`.

## 2026-07-24 - Improve Project parity for GroupID and TMPenalties

**Learning:** In Crowdin API v2, `groupId` is an optional field that can be set to `0` to indicate the root group. The Go SDK used an `int` which, when combined with `omitempty`, would drop the field if set to `0`. Additionally, the `tmPenalties` field in the `Project` response was untyped (`any`), making it difficult to use correctly in Go.

**Action:** Updated `ProjectsAddRequest.GroupID` to `*int` in `model/projects.go` to allow explicit `0` values. Changed `Project.TMPenalties` from `any` to `*ProjectTMPenalties` for better type safety. Fixed a documentation typo in `ProjectsListResponse`. Updated unit tests in `projects_test.go` to verify correct serialization and parsing with the new types.

## 2026-08-01 - Improve Label and Screenshot model parity and type consistency

**Learning:** The Crowdin Label response model was missing the `projectId` field, which is standard for most Crowdin resources. Additionally, `ScreenshotListOptions` used `[]string` for `StringIDs`, `LabelIDs`, and `ExcludeLabelIDs`, which is inconsistent with other models that use `[]int` for numeric identifiers and with the official API contract.

**Action:** Added `ProjectID` to the `Label` struct in `model/labels.go`. Updated `ScreenshotListOptions` in `model/screenshot.go` to use `[]int` for `StringIDs`, `LabelIDs`, and `ExcludeLabelIDs`. Updated corresponding contract tests in `labels_test.go`, `screenshot_test.go`, and `screenshots_test.go` to reflect these changes and ensure correct query parameter encoding.

## 2026-08-08 - Improve Reports model parity for AI Match and ProjectIDs

**Learning:** Crowdin API v2 Reports have evolved to include AI-specific matching in net rate schemes and more granular metadata in report status attributes. Specifically, `aiMatch` was missing from `ReportNetRateSchemes`, and `projectIds` was missing from `ReportStatusAttributes` for group/organization reports. Additionally, several new report names and the `status` filter in `GroupTaskUsageSchema` were absent.

**Action:** Added `AIMatch` to `ReportNetRateSchemes`, `ProjectIDs` to `ReportStatusAttributes`, and `Status` to `GroupTaskUsageSchema` in `model/reports.go`. Added missing `ReportName` constants for project and group reports (including TM-specific and comprehensive summaries). Updated comprehensive contract tests in `reports_test.go` to verify correct parsing and serialization of these new fields.

## 2026-08-15 - Optimize JoinSlice and improve Bundle model parity

**Learning:** The `JoinSlice` utility in the Go SDK was using `fmt.Sprintf` for every element, causing unnecessary reflection and allocations in hot paths like query parameter encoding. Additionally, `BundleAddRequest` was missing `omitempty` tags for optional label fields, which could lead to sending empty arrays to the Crowdin API.

**Action:** Optimized `model.JoinSlice` in `utils.go` by using `strings.Builder` and type switches for `int` and `string` to significantly reduce allocations. Added `omitempty` to `LabelIDs` and `ExcludeLabelIDs` in `BundleAddRequest` and corrected the documentation comment for `ExcludeLabelIDs`. Verified with focused unit tests and the full test suite.

## 2026-08-22 - Improve Translations API parity for labels and soft match

**Learning:** The Crowdin Translations API v2 supports several parameters that were missing from the Go SDK, specifically filtering by labels during project and directory builds, and the 'soft match' option for pre-translations. Additionally, uploading translations supports marking them as done immediately.

**Action:** Added  (*bool) to  and . Added  ([]int) to , , and , and updated  to include them. Added  (*bool) to . Verified with comprehensive unit tests in  and .

## 2026-08-29 - Improve AI Prompts parity for provider and model filtering

**Learning:** The Crowdin AI Prompts API v2 supports filtering prompts by `aiProviderId` and `aiModelId`, but these options were missing from the SDK's `AIPromptsListOptions`. Additionally, the `Prompt` response model was using a generic `string` for the `action` field instead of the existing `PromptAction` enum.

**Action:** Added `AIProviderID` and `AIModelID` to `AIPromptsListOptions` and updated its `Values()` method for correct query parameter encoding. Updated `Prompt.Action` to use the `PromptAction` type. Cleaned up redundant client access in AI service tests. Verified with updated unit tests in `model/ai_test.go` and full suite passing.

## 2026-08-22 - Improve Translations API parity for labels and soft match

**Learning:** The Crowdin Translations API v2 supports several parameters that were missing from the Go SDK, specifically filtering by labels during project and directory builds, and the 'soft match' option for pre-translations. Additionally, uploading translations supports marking them as done immediately.

**Action:** Added `TranslateWithSoftMatchOnly` (*bool) to `PreTranslationRequest` and `PreTranslationAttributes`. Added `LabelIDs` ([]int) to `BuildProjectRequest`, `BuildProjectDirectoryTranslationRequest`, and `BuildAttributes`, and updated `MarshalJSON` to include them. Added `MarkAddedAsDone` (*bool) to `UploadTranslationsRequest`. Verified with comprehensive unit tests in `translations_test.go` and `model/translations_test.go`.

## 2026-09-05 - Improve Machine Translation Engines model parity and flexibility

**Learning:** The Crowdin MT Engines API v2 uses different credential structures depending on the engine type (e.g., Google, DeepL, etc.), but the SDK was using a hardcoded struct. Additionally, the list response was missing pagination, and the resource model was missing standard fields like `createdAt` and `updatedAt`.

**Action:** Updated `MachineTranslation.Credentials` to `map[string]any` and `MTAddRequest.Credentials` to `any` to support all engine types. Added `Pagination` to `MachineTranslationsListResponse`. Added `CreatedAt` and `UpdatedAt` fields to the `MachineTranslation` model. Fixed and unskipped `TestMachineTranslationEnginesService_AddMT` by aligning expectations and correcting mock JSON data.

## 2026-09-12 - Improve StringComment model parity and fix documentation URL

**Learning:** The Crowdin String Comments API v2 response includes a `string` object that contains `hasPlurals` and `isIcu` fields, which were missing from the Go SDK's `String` struct in `model/string_comments.go`. Additionally, the documentation URL for the `Get` method was incorrectly pointing to the `post` (Add) operation.

**Action:** Added `HasPlurals` (bool) and `IsIcu` (bool) fields to the `String` struct in `model/string_comments.go`. Fixed the documentation URL in the comment for `StringCommentsService.Get` by changing `post` to `get`. Updated the `getStringComment` test helper in `string_comments_test.go` to reflect these changes. Verified with full test suite passing.

## 2026-09-12 - Update StringComment test fixture for explicit field validation

**Learning:** Test fixtures that only use zero values (like `false` for booleans) may pass even if JSON struct tags are missing or incorrect, as the unmarshaler defaults to the zero value. Using non-zero values in tests ensures that tags like `json:"hasPlurals"` are actually working.

**Action:** Updated `string_comments_test.go` to use `true` for `hasPlurals` and `isIcu` in both the JSON mock and the expected struct. This confirms that these new fields are correctly unmarshaled from Crowdin API responses.

## 2026-06-14 - Correct EditArchivedStatus endpoint path

**Learning:** The Crowdin API v2 endpoint for editing a task's archived status is located under `/api/v2/user/tasks/{taskId}`, not the standard project-specific `/api/v2/projects/{projectId}/tasks/{taskId}` or the incorrect `/api/v2/tasks/{taskId}` path.

**Action:** Updated `EditArchivedStatus` in `tasks.go` to use the correct `/api/v2/user/tasks/%d?projectId=%d` path. Adjusted `TestTasksService_EditArchivedStatus` in `tasks_test.go` to verify the correct URL is called. Verified with `make test`.

## 2026-09-19 - Add AI Translate endpoint for on-demand translations

**Learning:** The Crowdin API v2 recently introduced a `POST /ai/translate` endpoint for on-demand AI translations of dynamic content. This endpoint exists both at the root `/api/v2/ai/translate` (for Enterprise) and under user-specific paths `/api/v2/users/{userId}/ai/translate`. The request body requires `strings` and `targetLanguageId`. Due to minimal documentation on the exact response schema, a generic `any` response model was used to ensure compatibility with future changes.

**Action:** Implemented `AIService.Translate` method and added typed `AITranslateRequest` and `AITranslateResponse` models in `model/ai.go`. Verified request serialization and response unmarshaling with a contract test in `ai_test.go`.

## 2026-09-26 - Improve Upload Translations parity and fix panic in Source Strings upload

**Learning:** The Crowdin API v2 for uploading translations (`POST /api/v2/projects/{projectId}/translations/{languageId}`) supports `directoryId` for string-based projects, which was missing from the SDK. Additionally, `SourceStringsUploadRequest.Validate()` would panic if `updateOption` was set while `updateStrings` was nil.

**Action:** Added `DirectoryID` (int) to `UploadTranslationsRequest` and updated `Validate()` to ensure `FileID` is not used with `BranchID` or `DirectoryID`. Added `BranchID` and `DirectoryID` to the `UploadTranslations` response struct. Fixed potential nil pointer dereference in `SourceStringsUploadRequest.Validate()` and corrected a struct name in documentation comments. Verified with comprehensive unit and contract tests.

## 2026-10-03 - Improve response parity for Pagination and optimize ManagerListOptions

**Learning:** Several list response models in the Crowdin Go SDK were missing the `pagination` field, preventing callers from handling multi-page results for translation progress, QA checks, and group managers. Additionally, the `ManagerListOptions.Values()` method was using a manual loop for slice joining, which is less efficient and consistent than the `JoinSlice` helper.

**Action:** Added `Pagination *Pagination` to `TranslationProgressResponse`, `QAChecksResponse`, and `ManagerResponse`. Refactored `ManagerListOptions.Values()` to use `JoinSlice`. Added comprehensive unmarshaling tests to verify that the new pagination fields are correctly populated from API responses. Verified with `go test` in the fork.

## 2026-10-10 - Improve Enterprise Task parity and fix test typos

**Learning:** The Crowdin Enterprise API v2 supports  in , but it was missing from the SDK model. Additionally, several test function names in  contained typos (e.g., "Tepmlate").

**Action:** Added  string field to  in . Corrected "Tepmlate" to "Template" and "Tepmlates" to "Templates" in . Added  to verify parity.

## 2026-10-10 - Improve Enterprise Task parity and fix test typos

**Learning:** The Crowdin Enterprise API v2 supports `dateFrom` in `EnterpriseVendorTaskCreateForm`, but it was missing from the SDK model. Additionally, several test function names in `tasks_test.go` contained typos (e.g., "Tepmlate").

**Action:** Added `DateFrom` string field to `EnterpriseVendorTaskCreateForm` in `model/tasks.go`. Corrected "Tepmlate" to "Template" and "Tepmlates" to "Templates" in `tasks_test.go`. Added `TestTasksService_Add_EnterpriseVendorTaskCreateForm` to verify parity.

## 2026-10-17 - Improve Screenshot model parity for URL field

**Learning:** The Crowdin Screenshots API v2 returns a `url` field in its response, which is used to download the screenshot. While the `webUrl` field was already present, the `url` field was missing from the `Screenshot` model, leading to incomplete parsing of API responses.

**Action:** Added the `URL` field to the `Screenshot` struct in `model/screenshot.go`. Updated the `TestScreenshotsService_GetScreenshot` and label-related tests in `labels_test.go` to include the `URL` field in expected results, ensuring documentation parity and correct unmarshaling. Verified with `go test` in the fork.

## 2026-10-24 - Improve Screenshot and Distribution model parity

**Learning:** The Crowdin Screenshots API v2 returns a `projectId` field which was missing from the SDK. Additionally, the Distributions API supports `branchIds` and `directoryIds` in both response models and addition requests, allowing for distribution of content from specific branches or directories.

**Action:** Added `ProjectID` to the `Screenshot` struct in `model/screenshot.go`. Added `BranchIDs` and `DirectoryIDs` to both `Distribution` and `DistributionAddRequest` in `model/distributions.go`. Updated contract tests in `screenshots_test.go`, `labels_test.go`, and `distributions_test.go` to verify correct parsing and serialization of these new fields.

## 2026-10-31 - Fix Distribution validation for branch and directory IDs

**Learning:** The Crowdin API v2 for creating distributions allows specifying content via `fileIds`, `branchIds`, or `directoryIds` when using the 'default' export mode. The Go SDK was incorrectly requiring `fileIds` exclusively, causing validation failures for valid branch or directory-based distribution requests.

**Action:** Updated `DistributionAddRequest.Validate` in `model/distributions.go` to check that at least one of `fileIds`, `branchIds`, or `directoryIds` is provided for the default export mode. Expanded `model/distributions_test.go` with contract tests verifying each of these valid configurations.

## 2026-06-30 - Improve Task model parity for creatorId and projectId

**Learning:** The Crowdin Tasks API v2 supports filtering by `creatorId` when listing project tasks and by `projectId` when listing user tasks. These parameters were missing from the SDK's `TasksListOptions` and `UserTasksListOptions` respectively.

**Action:** Added `CreatorID` to `TasksListOptions` and `ProjectID` to `UserTasksListOptions` in `model/tasks.go`. Updated their `Values()` methods to correctly encode these parameters in query strings. Verified with updated unit tests in `tasks_test.go`.

## 2026-11-07 - Improve Source Strings parity for string-based projects and updateOption

**Learning:** The Crowdin Source Strings API v2 allows adding and uploading strings without specifying file, branch, or directory identifiers for string-based projects. The SDK was incorrectly enforcing these as mandatory. Additionally, the string upload status response includes an `updateOption` field which was missing from the SDK.

**Action:** Removed client-side validation in `SourceStringsAddRequest.Validate()` and `SourceStringsUploadRequest.Validate()` that mandated at least one container identifier. Added the `UpdateOption` field to the `SourceStringsUpload` attributes struct in `model/source_strings.go`. Verified with updated unit tests and ensured all existing tests pass after formatting.
