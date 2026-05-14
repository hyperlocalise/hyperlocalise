package model

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
)

type (
	// PreTranslation represents a pre-translation status.
	PreTranslation struct {
		Identifier string                    `json:"identifier"`
		Status     string                    `json:"status"`
		Progress   int                       `json:"progress"`
		Attributes *PreTranslationAttributes `json:"attributes"`
		CreatedAt  string                    `json:"createdAt"`
		UpdatedAt  string                    `json:"updatedAt"`
		StartedAt  string                    `json:"startedAt,omitempty"`
		FinishedAt string                    `json:"finishedAt,omitempty"`
		ETA        string                    `json:"eta,omitempty"`
	}

	PreTranslationAttributes struct {
		LanguageIDs                   []string            `json:"languageIds"`
		BranchIDs                     []int               `json:"branchIds,omitempty"`
		DirectoryIDs                  []int               `json:"directoryIds,omitempty"`
		FileIDs                       []int               `json:"fileIds,omitempty"`
		Method                        *string             `json:"method,omitempty"`
		EngineID                      *int                `json:"engineId,omitempty"`
		AIPromptID                    *int                `json:"aiPromptId,omitempty"`
		AutoApproveOption             *string             `json:"autoApproveOption,omitempty"`
		DuplicateTranslations         *bool               `json:"duplicateTranslations,omitempty"`
		SkipApprovedTranslations      *bool               `json:"skipApprovedTranslations,omitempty"`
		TranslateUntranslatedOnly     *bool               `json:"translateUntranslatedOnly,omitempty"`
		TranslateWithPerfectMatchOnly *bool               `json:"translateWithPerfectMatchOnly,omitempty"`
		FallbackLanguages             map[string][]string `json:"fallbackLanguages,omitempty"`
		LabelIDs                      []int               `json:"labelIds,omitempty"`
		ExcludeLabelIDs               []int               `json:"excludeLabelIds,omitempty"`
	}

	PreTranslationReport struct {
		Languages        []*LanguageReport `json:"languages"`
		PreTranslateType string            `json:"preTranslateType"`
	}

	LanguageReport struct {
		ID                       string                                  `json:"id"`
		Files                    []*LanguageReportFile                   `json:"files"`
		Skipped                  *LanguageReportSkipped                  `json:"skipped,omitempty"`
		SkippedQaCheckCategories *LanguageReportSkippedQaCheckCategories `json:"skippedQaCheckCategories,omitempty"`
	}

	LanguageReportFile struct {
		ID         string                    `json:"id"`
		Statistics *LanguageReportStatistics `json:"statistics"`
	}

	LanguageReportStatistics struct {
		Phrases int `json:"phrases"`
		Words   int `json:"words"`
	}

	LanguageReportSkipped struct {
		TranslationEQSource int `json:"translation_eq_source"`
		QACheck             int `json:"qa_check"`
		HiddenStrings       int `json:"hidden_strings"`
		AIError             int `json:"ai_error"`
	}

	LanguageReportSkippedQaCheckCategories struct {
		Duplicate  int `json:"duplicate"`
		Spellcheck int `json:"spellcheck"`
	}
)

// PreTranslationsResponse defines the structure of a response when
// getting a pre-translation status.
type PreTranslationsResponse struct {
	Data *PreTranslation `json:"data"`
}

// PreTranslationsListResponse defines the structure of a response when
// getting a list of pre-translations.
type PreTranslationsListResponse struct {
	Data []*PreTranslationsResponse `json:"data"`
}

// PreTranslationReportResponse defines the structure of a response when
// getting a pre-translation report.
type PreTranslationReportResponse struct {
	Data *PreTranslationReport `json:"data"`
}

// PreTranslationRequest defines the structure of a request to apply pre-translation.
type PreTranslationRequest struct {
	// Set of languages to which pre-translation should be applied.
	LanguageIDs []string `json:"languageIds"`
	// Files array that should be translated.
	FileIDs []int `json:"fileIds,omitempty"`
	// Branch identifiers.
	BranchIDs []int `json:"branchIds,omitempty"`
	// Directory identifiers.
	DirectoryIDs []int `json:"directoryIds,omitempty"`
	// Defines pre-translation method. Enum: "tm", "mt", "ai". Default: "tm".
	//  - tm – pre-translation via Translation Memory.
	//  - mt – pre-translation via Machine Translation. "mt" should be used with `engineId` parameter.
	//  - ai – pre-translation via AI. "ai" should be used with `aiPromptId` parameter.
	Method string `json:"method,omitempty"`
	// Machine Translation engine Identifier. Required if `method` is set to "mt".
	EngineID *int `json:"engineId,omitempty"`
	// AI Prompt Identifier. Required if `method` is set to "ai".
	AIPromptID *int `json:"aiPromptId,omitempty"`
	// Defines which translations added by TM pre-translation should be auto-approved. Default: "none".
	// Enum: "all", "exceptAutoSubstituted", "perfectMatchApprovedOnly", "perfectMatchOnly", "none"
	//  - all – all
	//  - perfectMatchOnly – with perfect TM match
	//  - exceptAutoSubstituted – all (skip auto-substituted suggestions)
	//  - perfectMatchApprovedOnly - with perfect TM match (approved previously)
	//  - none – no auto-approve
	AutoApproveOption string `json:"autoApproveOption,omitempty"`
	// Adds translations even if the same translation already exists. Default is false.
	// Note: Works only with TM pre-translation method.
	DuplicateTranslations *bool `json:"duplicateTranslations,omitempty"`
	// Skip approved translations. Default is false.
	// Note: Works only with TM pre-translation method.
	SkipApprovedTranslations *bool `json:"skipApprovedTranslations,omitempty"`
	// Applies pre-translation for untranslated strings only. Default is true.
	// Note: Works only with TM pre-translation method.
	TranslateUntranslatedOnly *bool `json:"translateUntranslatedOnly,omitempty"`
	// Applies pre-translation only for the strings with perfect match
	// (source text and contextual information are identical). Default is false.
	// Note: Works only with TM pre-translation method.
	TranslateWithPerfectMatchOnly *bool `json:"translateWithPerfectMatchOnly,omitempty"`
	// Defines fallback languages mapping. The passed value should contain a map of
	// languageID as a key and an array of fallback language IDs as a value.
	//  - languageID – Crowdin ID for the specified language.
	//  - []string – an array containing fallback language IDs.
	// Note: Available only for TM Pre-Translation.
	FallbackLanguages map[string][]string `json:"fallbackLanguages,omitempty"`
	// Label Identifiers.
	LabelIDs []int `json:"labelIds,omitempty"`
	// Exclude Label Identifiers.
	ExcludeLabelIDs []int `json:"excludeLabelIds,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *PreTranslationRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if len(r.LanguageIDs) == 0 {
		return errors.New("languageIds is required")
	}
	if len(r.FileIDs) == 0 && len(r.BranchIDs) == 0 && len(r.DirectoryIDs) == 0 {
		return errors.New("one of fileIds, branchIds or directoryIds is required")
	}
	if r.Method == "ai" && (r.AIPromptID == nil || *r.AIPromptID == 0) {
		return errors.New("aiPromptId is required")
	}
	if r.Method == "mt" && (r.EngineID == nil || *r.EngineID == 0) {
		return errors.New("engineId is required")
	}
	return nil
}

// BuildProjectDirectoryTranslationRequest defines the structure of a request
// to build project directory translation.
type BuildProjectDirectoryTranslationRequest struct {
	// Specify target languages for build.
	// Leave this field empty to build all target languages.
	TargetLanguageIDs []string `json:"targetLanguageIds,omitempty"`
	// Defines whether to export only translated strings. Default: false.
	// Note: true value can't be used with `skipUntranslatedFiles=true` in same request .
	SkipUntranslatedStrings *bool `json:"skipUntranslatedStrings,omitempty"`
	// Defines whether to export only translated file. Default: false.
	// Note: true value can't be used with `skipUntranslatedStrings=true` in same request.
	SkipUntranslatedFiles *bool `json:"skipUntranslatedFiles,omitempty"`
	// Defines whether to export only approved strings. Default: false.
	ExportApprovedOnly *bool `json:"exportApprovedOnly,omitempty"`
	// Preserve folder hierarchy. Default: false.
	PreserveFolderHierarchy *bool `json:"preserveFolderHierarchy,omitempty"`

	// Defines whether to export only approved strings.
	// Note: value greater than 0 can't be used with `exportStringsThatPassedWorkflow=true`
	// in same request.
	ExportWithMinApprovalsCount *int `json:"exportWithMinApprovalsCount,omitempty"`
	// Defines whether to export only strings that passed workflow.
	// Note: true value can't be used with `exportWithMinApprovalsCount>0` in same request
	// or in projects without an assigned workflow.
	ExportStringsThatPassedWorkflow *bool `json:"exportStringsThatPassedWorkflow,omitempty"`
}

// MarshalJSON adapts directory build requests to Crowdin Enterprise behavior.
func (r *BuildProjectDirectoryTranslationRequest) MarshalJSON() ([]byte, error) {
	type buildProjectDirectoryTranslationRequest struct {
		TargetLanguageIDs               []string `json:"targetLanguageIds,omitempty"`
		SkipUntranslatedStrings         *bool    `json:"skipUntranslatedStrings,omitempty"`
		SkipUntranslatedFiles           *bool    `json:"skipUntranslatedFiles,omitempty"`
		PreserveFolderHierarchy         *bool    `json:"preserveFolderHierarchy,omitempty"`
		ExportWithMinApprovalsCount     *int     `json:"exportWithMinApprovalsCount,omitempty"`
		ExportStringsThatPassedWorkflow *bool    `json:"exportStringsThatPassedWorkflow,omitempty"`
	}

	exportWithMinApprovalsCount := r.ExportWithMinApprovalsCount
	if r.ExportApprovedOnly != nil && *r.ExportApprovedOnly && exportWithMinApprovalsCount == nil {
		minApprovalsCount := 1
		exportWithMinApprovalsCount = &minApprovalsCount
	}

	return json.Marshal(buildProjectDirectoryTranslationRequest{
		TargetLanguageIDs:               r.TargetLanguageIDs,
		SkipUntranslatedStrings:         r.SkipUntranslatedStrings,
		SkipUntranslatedFiles:           r.SkipUntranslatedFiles,
		PreserveFolderHierarchy:         r.PreserveFolderHierarchy,
		ExportWithMinApprovalsCount:     exportWithMinApprovalsCount,
		ExportStringsThatPassedWorkflow: r.ExportStringsThatPassedWorkflow,
	})
}

// Validate checks if the build project directory translation request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *BuildProjectDirectoryTranslationRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	if (r.SkipUntranslatedStrings != nil && r.SkipUntranslatedFiles != nil) &&
		(*r.SkipUntranslatedStrings && *r.SkipUntranslatedFiles) {
		return errors.New("skipUntranslatedStrings and skipUntranslatedFiles must not be true at the same request")
	}
	if (r.ExportWithMinApprovalsCount != nil && r.ExportStringsThatPassedWorkflow != nil) &&
		(*r.ExportWithMinApprovalsCount > 0 && *r.ExportStringsThatPassedWorkflow) {
		return fmt.Errorf("exportWithMinApprovalsCount and exportStringsThatPassedWorkflow must not be true at the same request")
	}

	return nil
}

// BuildProjectDirectoryTranslation represents a project directory build.
type BuildProjectDirectoryTranslation struct {
	ID         int    `json:"id"`
	ProjectID  int    `json:"projectId"`
	Status     string `json:"status"`
	Progress   int    `json:"progress"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
	FinishedAt string `json:"finishedAt,omitempty"`
}

// BuildProjectFileTranslationRequest defines the structure of a request
// to build project file translation.
type BuildProjectFileTranslationRequest struct {
	// Target Language Identifier.
	TargetLanguageID string `json:"targetLanguageId"`
	// Defines whether to export only translated strings. Default: false.
	// Note: true value can't be used with `skipUntranslatedFiles=true`` in same request.
	SkipUntranslatedStrings *bool `json:"skipUntranslatedStrings,omitempty"`
	// Defines whether to export only translated file. Default: false.
	// Note: true value can't be used with `skipUntranslatedStrings=true` in same request.
	SkipUntranslatedFiles *bool `json:"skipUntranslatedFiles,omitempty"`
	// Defines whether to export only approved strings. Default: false.
	ExportApprovedOnly *bool `json:"exportApprovedOnly,omitempty"`

	// Defines whether to export only approved strings.
	// Note: value greater than 0 can't be used with `exportStringsThatPassedWorkflow=true`
	// in same request.
	ExportWithMinApprovalsCount *int `json:"exportWithMinApprovalsCount,omitempty"`
	// Defines whether to export only strings that passed workflow.
	// Note: true value can't be used with `exportWithMinApprovalsCount>0` in same request
	// or in projects without an assigned workflow.
	ExportStringsThatPassedWorkflow *bool `json:"exportStringsThatPassedWorkflow,omitempty"`
}

// MarshalJSON adapts file build requests to Crowdin Enterprise behavior.
func (r *BuildProjectFileTranslationRequest) MarshalJSON() ([]byte, error) {
	type buildProjectFileTranslationRequest struct {
		TargetLanguageID                string `json:"targetLanguageId"`
		SkipUntranslatedStrings         *bool  `json:"skipUntranslatedStrings,omitempty"`
		SkipUntranslatedFiles           *bool  `json:"skipUntranslatedFiles,omitempty"`
		ExportWithMinApprovalsCount     *int   `json:"exportWithMinApprovalsCount,omitempty"`
		ExportStringsThatPassedWorkflow *bool  `json:"exportStringsThatPassedWorkflow,omitempty"`
	}

	exportWithMinApprovalsCount := r.ExportWithMinApprovalsCount
	if r.ExportApprovedOnly != nil && *r.ExportApprovedOnly && exportWithMinApprovalsCount == nil {
		minApprovalsCount := 1
		exportWithMinApprovalsCount = &minApprovalsCount
	}

	return json.Marshal(buildProjectFileTranslationRequest{
		TargetLanguageID:                r.TargetLanguageID,
		SkipUntranslatedStrings:         r.SkipUntranslatedStrings,
		SkipUntranslatedFiles:           r.SkipUntranslatedFiles,
		ExportWithMinApprovalsCount:     exportWithMinApprovalsCount,
		ExportStringsThatPassedWorkflow: r.ExportStringsThatPassedWorkflow,
	})
}

// Validate checks if the build project file translation request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *BuildProjectFileTranslationRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if len(r.TargetLanguageID) == 0 {
		return errors.New("targetLanguageId is required")
	}

	if (r.SkipUntranslatedStrings != nil && r.SkipUntranslatedFiles != nil) &&
		(*r.SkipUntranslatedStrings && *r.SkipUntranslatedFiles) {
		return errors.New("skipUntranslatedStrings and skipUntranslatedFiles must not be true at the same request")
	}
	if (r.ExportWithMinApprovalsCount != nil && r.ExportStringsThatPassedWorkflow != nil) &&
		(*r.ExportWithMinApprovalsCount > 0 && *r.ExportStringsThatPassedWorkflow) {
		return fmt.Errorf("exportWithMinApprovalsCount and exportStringsThatPassedWorkflow must not be true at the same request")
	}

	return nil
}

// TranslationsBuildsListOptions specifies the optional parameters to the
// TranslationsService.ListProjectBuilds method.
type TranslationsBuildsListOptions struct {
	ListOptions

	// Branch Identifier. Filter builds by branchId.
	BranchID int `json:"branchId,omitempty"`
}

// Values returns the url.Values representation of the query options.
func (o *TranslationsBuildsListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()
	if o.BranchID > 0 {
		v.Add("branchId", fmt.Sprintf("%d", o.BranchID))
	}

	return v, len(v) > 0
}

// TranslationsProjectBuild represents a project build.
type TranslationsProjectBuild struct {
	ID         int              `json:"id"`
	ProjectID  int              `json:"projectId"`
	Status     string           `json:"status"`
	Progress   int              `json:"progress"`
	CreatedAt  string           `json:"createdAt"`
	UpdatedAt  string           `json:"updatedAt"`
	FinishedAt string           `json:"finishedAt,omitempty"`
	Attributes *BuildAttributes `json:"attributes,omitempty"`
}

// BuildAttributes represents the attributes of a project build.
type BuildAttributes struct {
	BranchID                        *int     `json:"branchId,omitempty"`
	DirectoryID                     *int     `json:"directoryId,omitempty"`
	TargetLanguageIDs               []string `json:"targetLanguageIds,omitempty"`
	SkipUntranslatedStrings         *bool    `json:"skipUntranslatedStrings,omitempty"`
	SkipUntranslatedFiles           *bool    `json:"skipUntranslatedFiles,omitempty"`
	ExportApprovedOnly              *bool    `json:"exportApprovedOnly,omitempty"`
	ExportWithMinApprovalsCount     *int     `json:"exportWithMinApprovalsCount,omitempty"`
	ExportStringsThatPassedWorkflow *bool    `json:"exportStringsThatPassedWorkflow,omitempty"`

	Pseudo               *bool   `json:"pseudo,omitempty"`
	Prefix               *string `json:"prefix,omitempty"`
	Suffix               *string `json:"suffix,omitempty"`
	LengthTransformation *int    `json:"lengthTransformation,omitempty"`
	CharTransformation   *string `json:"charTransformation,omitempty"`
}

// TranslationsProjectBuildResponse defines the structure of a response when
// getting a project build.
type TranslationsProjectBuildResponse struct {
	Data *TranslationsProjectBuild `json:"data"`
}

// TranslationsProjectBuildsListResponse defines the structure of a response when
// getting a list of project builds.
type TranslationsProjectBuildsListResponse struct {
	Data []*TranslationsProjectBuildResponse `json:"data"`
}

type (
	// BuildProjectTranslationRequester interface that allows accepting
	// BuildProjectRequest and PseudoBuildProjectRequest types.
	BuildProjectTranslationRequester interface {
		ValidateBuildRequest() error
	}

	// BuildProjectRequest defines the structure of a request to build a project.
	BuildProjectRequest struct {
		// Branch Identifier.
		BranchID int `json:"branchId,omitempty"`
		// Specify target languages for build.
		// Leave this field empty to build all target languages
		TargetLanguageIDs []string `json:"targetLanguageIds,omitempty"`
		// Defines whether to export only translated strings.
		// Note: true value can't be used with `skipUntranslatedFiles=true` in same request.
		SkipUntranslatedStrings *bool `json:"skipUntranslatedStrings,omitempty"`
		// Defines whether to export only translated files.
		// Note: true value can't be used with `skipUntranslatedStrings=true` in same request.
		SkipUntranslatedFiles *bool `json:"skipUntranslatedFiles,omitempty"`
		// Defines whether to export only approved strings.
		ExportApprovedOnly *bool `json:"exportApprovedOnly,omitempty"`

		// Defines whether to export only approved strings.
		// Note: value greater than 0 can't be used with `exportStringsThatPassedWorkflow=true`
		// in same request.
		ExportWithMinApprovalsCount *int `json:"exportWithMinApprovalsCount,omitempty"`
		// Defines whether to export only strings that passed workflow.
		// Note: true value can't be used with `exportWithMinApprovalsCount>0` in same request
		// or in projects without an assigned workflow.
		ExportStringsThatPassedWorkflow *bool `json:"exportStringsThatPassedWorkflow,omitempty"`
	}

	// PsuedoBuildProjectRequest defines the structure of a request to build a project
	// with pseudo translations.
	PseudoBuildProjectRequest struct {
		// Flag for detecting pseudo translation. Default: false.
		Pseudo *bool `json:"pseudo"`
		// Branch Identifier.
		BranchID int `json:"branchId,omitempty"`
		// Add special characters at the beginning of each string to show
		// where messages have been concatenated together.
		Prefix string `json:"prefix,omitempty"`
		// Add special characters at the end of each string to show where
		// messages have been concatenated together.
		Suffix string `json:"suffix,omitempty"`
		// Make string larger or shorter.
		// Acceptable values must be from -50 to 100. Default is 0.
		LengthTransformation *int `json:"lengthTransformation,omitempty"`
		// Transforms characters to other languages.
		// Enum: "asian", "cyrillic", "european", "arabic".
		CharTransformation string `json:"charTransformation,omitempty"`
	}
)

// MarshalJSON adapts project build requests to Crowdin Enterprise behavior.
// Some Crowdin project build endpoints reject exportApprovedOnly even though
// the public client models include it. Preserve approved-only intent by mapping
// true to exportWithMinApprovalsCount when no explicit approval count is set,
// and omit exportApprovedOnly from this endpoint's payload.
func (r *BuildProjectRequest) MarshalJSON() ([]byte, error) {
	type buildProjectRequest struct {
		BranchID                        int      `json:"branchId,omitempty"`
		TargetLanguageIDs               []string `json:"targetLanguageIds,omitempty"`
		SkipUntranslatedStrings         *bool    `json:"skipUntranslatedStrings,omitempty"`
		SkipUntranslatedFiles           *bool    `json:"skipUntranslatedFiles,omitempty"`
		ExportWithMinApprovalsCount     *int     `json:"exportWithMinApprovalsCount,omitempty"`
		ExportStringsThatPassedWorkflow *bool    `json:"exportStringsThatPassedWorkflow,omitempty"`
	}

	exportWithMinApprovalsCount := r.ExportWithMinApprovalsCount
	if r.ExportApprovedOnly != nil && *r.ExportApprovedOnly && exportWithMinApprovalsCount == nil {
		minApprovalsCount := 1
		exportWithMinApprovalsCount = &minApprovalsCount
	}

	return json.Marshal(buildProjectRequest{
		BranchID:                        r.BranchID,
		TargetLanguageIDs:               r.TargetLanguageIDs,
		SkipUntranslatedStrings:         r.SkipUntranslatedStrings,
		SkipUntranslatedFiles:           r.SkipUntranslatedFiles,
		ExportWithMinApprovalsCount:     exportWithMinApprovalsCount,
		ExportStringsThatPassedWorkflow: r.ExportStringsThatPassedWorkflow,
	})
}

// Validate checks if the build project request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *BuildProjectRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return r.ValidateBuildRequest()
}

// ValidateBuildRequest implements the BuildProjectTranslationRequest interface.
func (r *BuildProjectRequest) ValidateBuildRequest() error {
	if (r.SkipUntranslatedStrings != nil && r.SkipUntranslatedFiles != nil) &&
		(*r.SkipUntranslatedStrings && *r.SkipUntranslatedFiles) {
		return errors.New("`skipUntranslatedStrings` and `skipUntranslatedFiles` must not be true at the same request")
	}
	if (r.ExportWithMinApprovalsCount != nil && r.ExportStringsThatPassedWorkflow != nil) &&
		(*r.ExportWithMinApprovalsCount > 0 && *r.ExportStringsThatPassedWorkflow) {
		return fmt.Errorf("`exportWithMinApprovalsCount` and `exportStringsThatPassedWorkflow` must not be true at the same request")
	}

	return nil
}

// Validate checks if the build project request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *PseudoBuildProjectRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return r.ValidateBuildRequest()
}

// PseudoBuildProjectRequest implements the BuildProjectTranslationRequest interface.
func (r *PseudoBuildProjectRequest) ValidateBuildRequest() error {
	if r.LengthTransformation != nil &&
		(*r.LengthTransformation < -50 || *r.LengthTransformation > 100) {
		return errors.New("lengthTransformation must be from -50 to 100")
	}

	return nil
}

// UploadTranslationsRequest defines the structure of a request to upload translations.
type UploadTranslationsRequest struct {
	// Storage Identifier.
	StorageID int `json:"storageId"`
	// File Identifier for import.
	// Note: Required for content in all formats except XLIFF.
	FileID int `json:"fileId,omitempty"`
	// Branch Identifier for import.
	// Note: Required for string based API.
	BranchID int `json:"branchId,omitempty"`
	// Defines whether to add translation if it's the same as the source string.
	// Default: false.
	ImportEqSuggestions *bool `json:"importEqSuggestions,omitempty"`
	// Mark uploaded translations as approved. Default: false.
	AutoApproveImported *bool `json:"autoApproveImported,omitempty"`
	// Allow translations upload to hidden source strings. Default: false.
	TranslateHidden *bool `json:"translateHidden,omitempty"`
	// Defines whether to add translation to TM. Default: true.
	AddToTM *bool `json:"addToTm,omitempty"`
}

// Validate checks if the upload translations request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *UploadTranslationsRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.StorageID == 0 {
		return errors.New("storageId is required")
	}
	if r.FileID > 0 && r.BranchID > 0 {
		return errors.New("fileId and branchId can not be used at the same request")
	}
	return nil
}

type (
	// UploadTranslations represents the uploaded translations.
	UploadTranslations struct {
		ProjectID  int    `json:"projectId"`
		StorageID  int    `json:"storageId"`
		LanguageID string `json:"languageId"`
		FileID     int    `json:"fileId"`
	}

	// UploadTranslationsResponse defines the structure of a response when
	// uploading translations.
	UploadTranslationsResponse struct {
		Data *UploadTranslations `json:"data"`
	}
)

// ExportTranslationRequest defines the structure of a request
// to export translations.
type ExportTranslationRequest struct {
	// Specify target language for export.
	TargetLanguageID string `json:"targetLanguageId"`
	// Defines export file format. Use API Type feature specified at the
	// corresponding file format from Crowdin Store.
	// Note: the `format` parameter is required in all cases except when you'd like
	// to export translations for a single file in its original format.
	Format string `json:"format,omitempty"`
	// Label Identifiers.
	LabelIDs []int `json:"labelIds,omitempty"`
	// Branch Identifiers.
	// Note: Can't be used with `directoryIds` or `fileIds` in same request.
	BranchIDs []int `json:"branchIds,omitempty"`
	// Directory Identifiers.
	// Note: Can't be used with `branchIds` or `fileIds` in same request.
	DirectoryIDs []int `json:"directoryIds,omitempty"`
	// File Identifiers.
	// Note: Can't be used with `branchIds` or `directoryIds` in same request.
	FileIDs []int `json:"fileIds,omitempty"`
	// Defines whether to export only translated strings. Default is false.
	// Note: Can't be used with `skipUntranslatedFiles` in same request.
	SkipUntranslatedStrings *bool `json:"skipUntranslatedStrings,omitempty"`
	// Defines whether to export only translated file. Default is false.
	// Note: Can't be used with `skipUntranslatedStrings` in same request.
	SkipUntranslatedFiles *bool `json:"skipUntranslatedFiles,omitempty"`
	// Defines whether to export only approved strings. Default is false.
	ExportApprovedOnly *bool `json:"exportApprovedOnly,omitempty"`

	// Defines whether to export only approved strings.
	// Note: value greater than 0 can't be used with `exportStringsThatPassedWorkflow=true`
	// in same request.
	ExportWithMinApprovalsCount *int `json:"exportWithMinApprovalsCount,omitempty"`
	// Defines whether to export only strings that passed workflow.
	// Note: true value can't be used with `exportWithMinApprovalsCount>0` in same request
	// or in projects without an assigned workflow.
	ExportStringsThatPassedWorkflow *bool `json:"exportStringsThatPassedWorkflow,omitempty"`
}

// MarshalJSON adapts export translation requests to Crowdin Enterprise behavior.
func (r *ExportTranslationRequest) MarshalJSON() ([]byte, error) {
	type exportTranslationRequest struct {
		TargetLanguageID                string `json:"targetLanguageId"`
		Format                          string `json:"format,omitempty"`
		LabelIDs                        []int  `json:"labelIds,omitempty"`
		BranchIDs                       []int  `json:"branchIds,omitempty"`
		DirectoryIDs                    []int  `json:"directoryIds,omitempty"`
		FileIDs                         []int  `json:"fileIds,omitempty"`
		SkipUntranslatedStrings         *bool  `json:"skipUntranslatedStrings,omitempty"`
		SkipUntranslatedFiles           *bool  `json:"skipUntranslatedFiles,omitempty"`
		ExportWithMinApprovalsCount     *int   `json:"exportWithMinApprovalsCount,omitempty"`
		ExportStringsThatPassedWorkflow *bool  `json:"exportStringsThatPassedWorkflow,omitempty"`
	}

	exportWithMinApprovalsCount := r.ExportWithMinApprovalsCount
	if r.ExportApprovedOnly != nil && *r.ExportApprovedOnly && exportWithMinApprovalsCount == nil {
		minApprovalsCount := 1
		exportWithMinApprovalsCount = &minApprovalsCount
	}

	return json.Marshal(exportTranslationRequest{
		TargetLanguageID:                r.TargetLanguageID,
		Format:                          r.Format,
		LabelIDs:                        r.LabelIDs,
		BranchIDs:                       r.BranchIDs,
		DirectoryIDs:                    r.DirectoryIDs,
		FileIDs:                         r.FileIDs,
		SkipUntranslatedStrings:         r.SkipUntranslatedStrings,
		SkipUntranslatedFiles:           r.SkipUntranslatedFiles,
		ExportWithMinApprovalsCount:     exportWithMinApprovalsCount,
		ExportStringsThatPassedWorkflow: r.ExportStringsThatPassedWorkflow,
	})
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *ExportTranslationRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.TargetLanguageID == "" {
		return errors.New("targetLanguageId is required")
	}

	return nil
}

type (
	// DownloadLink represents a download link.
	DownloadLink struct {
		URL      string `json:"url"`
		ExpireIn string `json:"expireIn"`

		Etag *string `json:"etag,omitempty"`
	}

	// DownloadLinkResponse defines the structure of a response when
	// getting a download URL with its expiration time.
	DownloadLinkResponse struct {
		Data *DownloadLink `json:"data"`
	}
)
