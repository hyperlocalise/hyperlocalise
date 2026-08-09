# Crowdin Steward's Journal

## 2026-12-25 - Support TargetLanguageID filtering in List String Comments

**Learning:** In Crowdin API v2, listing string comments (`GET /api/v2/projects/{projectId}/comments`) supports filtering comments by a target language ID (or a comma-separated list of target language IDs) via the `targetLanguageId` query parameter. Lacking this option in the Go SDK prevented consumers from filtering project comments on targeted locales.

**Action:** Added `TargetLanguageID` (`targetLanguageId,omitempty`) of type `string` to `StringCommentsListOptions` struct in `model/string_comments.go` and updated its `Values()` query serialization helper. Expanded the test suites in both `model/string_comments_test.go` and `string_comments_test.go` to assert correct encoding and handling of this new query filter.
