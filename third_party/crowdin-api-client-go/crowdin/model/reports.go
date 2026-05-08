package model

import (
	"errors"
	"fmt"
	"net/url"
)

// ReportFormat represents the format of a report
// file to export.
type ReportFormat string

const (
	ReportFormatXLSX ReportFormat = "xlsx"
	ReportFormatCSV  ReportFormat = "csv"
	ReportFormatJSON ReportFormat = "json"
)

// ReportScopeType represents the scope type of a report.
type ReportScopeType string

const (
	ReportScopeTypeProject      ReportScopeType = "project"
	ReportScopeTypeOrganization ReportScopeType = "organization"
	ReportScopeTypeGroup        ReportScopeType = "group"
)

// ReportUnit represents a unit of a report.
type ReportUnit string

const (
	ReportUnitStrings         ReportUnit = "strings"
	ReportUnitWords           ReportUnit = "words"
	ReportUnitChars           ReportUnit = "chars"
	ReportUnitCharsWithSpaces ReportUnit = "chars_with_spaces"
)

// ReportMode represents the mode of a report.
type ReportMode string

const (
	ReportModeTranslations ReportMode = "translations"
	ReportModeApprovals    ReportMode = "approvals"
	ReportModeVotes        ReportMode = "votes"
)

// ReportName represents the name of a report.
type ReportName string

const (
	ReportCostsEstimationPostEditing  ReportName = "costs-estimation-pe"
	ReportTransactionCostsPostEditing ReportName = "translation-costs-pe"
	ReportContributionRawData         ReportName = "contribution-raw-data"
	ReportTopMembers                  ReportName = "top-members"
	ReportTranslatorAccuracy          ReportName = "translator-accuracy"
	ReportPreTranslateAccuracy        ReportName = "pre-translate-accuracy"
	ReportSourceContentUpdates        ReportName = "source-content-updates"
	ReportProjectMembers              ReportName = "project-members"
	ReportEditorIssues                ReportName = "editor-issues"
	ReportQACheckIssues               ReportName = "qa-check-issues"
	ReportSavingActivity              ReportName = "saving-activity"
	ReportTranslationActivity         ReportName = "translation-activity"

	// Deprecated: Use ReportPreTranslateAccuracy instead.
	ReportPreTranslateEfficiency ReportName = "pre-translate-efficiency"

	// Organization reports.
	ReportGroupTranslationCostsPostEditing ReportName = "group-translation-costs-pe"
	ReportGroupTopMembers                  ReportName = "group-top-members"
	ReportGroupTaskUsage                   ReportName = "group-task-usage"
	ReportGroupQACheckIssues               ReportName = "group-qa-check-issues"
	ReportGroupTranslationActivity         ReportName = "group-translation-activity"
)

// ReportArchive represents a report archive.
type ReportArchive struct {
	ID        int    `json:"id"`
	ScopeType string `json:"scopeType"`
	ScopeID   int    `json:"scopeId"`
	UserID    int    `json:"userId"`
	Name      string `json:"name"`
	WebURL    string `json:"webUrl"`
	Scheme    any    `json:"scheme"`
	CreatedAt string `json:"createdAt"`
}

// ReportArchiveResponse defines the structure of a response
// when getting a report archive.
type ReportArchiveResponse struct {
	Data *ReportArchive `json:"data"`
}

// ReportArchiveListResponse defines the structure of a response
// when getting a list of report archives.
type ReportArchiveListResponse struct {
	Data []*ReportArchiveResponse `json:"data"`
}

// ReportArchivesListOptions specifies the optional parameters to
// the ReportsService.ListArchives method.
type ReportArchivesListOptions struct {
	// Filter only project report archives.
	// Enum: project, organization, group.
	ScopeType ReportScopeType `json:"scopeType,omitempty"`
	// Filter archives by specific scope id.
	// [Enterprise client] Use only if scopeType set to group or project.
	ScopeID int `json:"scopeId,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of the options.
// It implements the crowdin.ListOptionsProvider interface.
func (o *ReportArchivesListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if o.ScopeType != "" {
		v.Add("scopeType", string(o.ScopeType))
	}
	if o.ScopeID != 0 {
		v.Add("scopeId", fmt.Sprintf("%d", o.ScopeID))
	}

	return v, len(v) > 0
}

type (
	// ReportStatus represents the status of a generated
	// or archived report.
	ReportStatus struct {
		Identifier string                 `json:"identifier"`
		Status     string                 `json:"status"`
		Progress   int                    `json:"progress"`
		Attributes ReportStatusAttributes `json:"attributes"`
		CreatedAt  string                 `json:"createdAt"`
		UpdatedAt  string                 `json:"updatedAt"`
		StartedAt  string                 `json:"startedAt"`
		FinishedAt string                 `json:"finishedAt"`
	}

	// ReportStatusAttributes represents the attributes of
	// a report status.
	ReportStatusAttributes struct {
		Format     string `json:"format"`
		ReportName string `json:"reportName"`
		Schema     any    `json:"schema"`
	}
)

// ReportStatusResponse defines the structure of a response
// when getting a report status.
type ReportStatusResponse struct {
	Data *ReportStatus `json:"data"`
}

// ExportReportArchiveRequest defines the structure of a request to
// export a report archive.
type ExportReportArchiveRequest struct {
	// Export file format.
	// Enum: xlsx, csv, json. Default: xlsx.
	Format ReportFormat `json:"format,omitempty"`
}

type (
	// ReportBaseRates defines the base rates for a report.
	ReportBaseRates struct {
		// Applies to all languages by default.
		FullTranslation float64 `json:"fullTranslation,omitempty"`
		Proofread       float64 `json:"proofread,omitempty"`
	}

	// ReportIndividualRates defines the individual rates for a report.
	// Custom rates for certain languages or users.
	ReportIndividualRates struct {
		LanguageIDs     []string `json:"languageIds,omitempty"`
		UserIDs         []int    `json:"userIds,omitempty"`
		FullTranslation float64  `json:"fullTranslation,omitempty"`
		Proofread       float64  `json:"proofread,omitempty"`
	}

	// ReportNetRateSchemes defines the net rate schemes for a report.
	// Percentage paid of full translation rate.
	ReportNetRateSchemes struct {
		// Match type enum: "perfect", "100", "99-82", "81-60".
		TMMatch []ReportNetRateSchemeMatch `json:"tmMatch,omitempty"`
		// Match type enum: "100", "99-82", "81-60".
		MTMatch []ReportNetRateSchemeMatch `json:"mtMatch,omitempty"`
		// Match type enum: "100", "99-82".
		SuggestionMatch []ReportNetRateSchemeMatch `json:"suggestionMatch,omitempty"`
	}

	// ReportNetRateSchemeMatch defines the match type and price
	// for a net rate scheme.
	ReportNetRateSchemeMatch struct {
		// Match type, %. Enum: perfect, 100, 99-82, 81-60.
		MatchType string `json:"matchType,omitempty"`
		// Price, %.
		Price float64 `json:"price,omitempty"`
	}
)

// ReportGenerateRequest defines the structure of a request to
// generate a report.
type ReportGenerateRequest struct {
	// Report name.
	Name ReportName `json:"name"`
	// Schema for the report generation request.
	// Can be one of the following types:
	//  - CostsEstimationPostEditingSchema
	//  - TransactionCostsPostEditingSchema
	//  - TopMembersSchema
	//  - ContributionRawDataSchema
	//  - TranslatorAccuracySchema
	//  - PreTranslateAccuracySchema
	//  - PreTranslateEfficiencySchema (Deprecated)
	//  - SourceContentUpdatesSchema
	//  - ProjectMembersSchema
	//  - EditorIssuesSchema
	//  - QACheckIssuesSchema
	//  - SavingActivitySchema
	//  - TranslationActivitySchema
	Schema ReportSchema `json:"schema"`
}

// ReportSchema is an interface that defines the schema
// for a report generation request.
type ReportSchema interface {
	ValidateSchema() error
}

type (
	// CostsEstimationPostEditingSchema defines the schema for the costs
	// estimation post-editing report.
	CostsEstimationPostEditingSchema struct {
		// Report unit.
		// Enum: strings, words, chars, chars_with_spaces. Default: words.
		Unit ReportUnit `json:"unit,omitempty"`
		// Report currency.
		// Enum: USD, EUR, JPY, GBP, AUD, CAD, CHF, CNY, SEK, NZD, MXN,
		// SGD, HKD, NOK, KRW, TRY, RUB, INR, BRL, ZAR, GEL, UAH, DDK
		Currency string `json:"currency,omitempty"`
		// Export file format.
		// Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Base rates.
		BaseRates *ReportBaseRates `json:"baseRates,omitempty"`
		// Individual rates (Custom rates for certain languages or users).
		IndividualRates []*ReportIndividualRates `json:"individualRates,omitempty"`
		// Net Rate Schemes (Percentage paid of full translation rate).
		// Note: A new translation will be included in the report at the lowest rate
		// if multiple scheme categories can be applied to the translation.
		NetRateSchemes *ReportNetRateSchemes `json:"netRateSchemes,omitempty"`
		// Calculate internal matches. Default: false.
		CalculateInternalMatches *bool `json:"calculateInternalMatches,omitempty"`
		// Include pre-translated strings. Default: false.
		IncludePreTranslatedStrings *bool `json:"includePreTranslatedStrings,omitempty"`
		// Language Identifier for which the report should be generated.
		LanguageID string `json:"languageId,omitempty"`
		// List of file identifiers.
		FileIDs []int `json:"fileIds,omitempty"`
		// List of directory identifiers.
		DirectoryIDs []int `json:"directoryIds,omitempty"`
		// List of branch identifiers.
		BranchIDs []int `json:"branchIds,omitempty"`
		// List of label identifiers.
		LabelIDs []int `json:"labelIds,omitempty"`
		// Defines which strings include in report.
		// Enum: strings_with_label, strings_without_label. Default: strings_with_label.
		LabelIncludeType string `json:"labelIncludeType,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`

		// Task Identifier.
		// Used to generate report by task.
		TaskID int `json:"taskId,omitempty"`
	}

	// TransactionCostsPostEditingSchema defines the schema for the transaction
	// costs post-editing report.
	TransactionCostsPostEditingSchema struct {
		// Report unit.
		// Enum: strings, words, chars, chars_with_spaces. Default: words.
		Unit ReportUnit `json:"unit,omitempty"`
		// Report currency.
		// Enum: USD, EUR, JPY, GBP, AUD, CAD, CHF, CNY, SEK, NZD, MXN,
		// SGD, HKD, NOK, KRW, TRY, RUB, INR, BRL, ZAR, GEL, UAH, DDK
		Currency string `json:"currency,omitempty"`
		// Export file format.
		// Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Base rates.
		BaseRates *ReportBaseRates `json:"baseRates,omitempty"`
		// Individual rates (Custom rates for certain languages or users).
		IndividualRates []*ReportIndividualRates `json:"individualRates,omitempty"`
		// Net Rate Schemes (Percentage paid of full translation rate).
		// Note: A new translation will be included in the report at the lowest rate
		// if multiple scheme categories can be applied to the translation.
		NetRateSchemes *ReportNetRateSchemes `json:"netRateSchemes,omitempty"`
		// Exclude approvals when the same user has made translations for the string.
		ExcludeApprovalsForEditedTranslations *bool `json:"excludeApprovalsForEditedTranslations,omitempty"`
		// Grouping parameter.
		// Enum: user, language. Default: user.
		GroupBy string `json:"groupBy,omitempty"`
		// Language Identifier for which the report should be generated.
		LanguageID string `json:"languageId,omitempty"`
		// User Identifier for which the report should be generated.
		UserIDs []int `json:"userIds,omitempty"`
		// List of file identifiers.
		FileIDs []int `json:"fileIds,omitempty"`
		// List of directory identifiers.
		DirectoryIDs []int `json:"directoryIds,omitempty"`
		// List of branch identifiers.
		BranchIDs []int `json:"branchIds,omitempty"`
		// List of label identifiers.
		LabelIDs []int `json:"labelIds,omitempty"`
		// Defines which strings include in report.
		// Enum: strings_with_label, strings_without_label. Default: strings_with_label.
		LabelIncludeType string `json:"labelIncludeType,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`

		// Task Identifier.
		// Used to generate report by task.
		TaskID int `json:"taskId,omitempty"`
	}

	// TopMembersSchema defines the schema for the top members report.
	TopMembersSchema struct {
		// Defines report unit.
		// Enum: strings, words, chars, chars_with_spaces. Default: words.
		Unit ReportUnit `json:"unit,omitempty"`
		// Language Identifier for which the report should be generated.
		LanguageID string `json:"languageId,omitempty"`
		// Export file format.
		// Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	// ContributionRawDataSchema defines the schema for the contribution
	// raw data report.
	ContributionRawDataSchema struct {
		// Report mode. Enum: translations, approvals, votes.
		Mode ReportMode `json:"mode"`
		// Report unit. Enum: strings, words, chars, chars_with_spaces.
		// Default: words.
		Unit ReportUnit `json:"unit,omitempty"`
		// Task Identifier.
		// Used to generate report by task.
		TaskID int `json:"taskId,omitempty"`
		// Language Identifier for which the report should be generated.
		LanguageID string `json:"languageId,omitempty"`
		// User Identifier for which the report should be generated.
		UserID string `json:"userId,omitempty"`
		// Column names to include in the report.
		// Enum: userId, languageId, stringId, translationId, fileId, filePath,
		// pluralForm, sourceStringTextHash, mtEngine, mtId, tmName, tmId,
		// preTranslated, tmMatch, mtMatch, suggestionMatch, sourceUnits,
		// targetUnits, createdAt, updatedAt, mark.
		Columns []string `json:"columns,omitempty"`
		// List of TM identifiers.
		TMIDs []int `json:"tmIds,omitempty"`
		// List of MT identifiers.
		MTIDs []int `json:"mtIds,omitempty"`
		// List of file identifiers.
		FileIDs []int `json:"fileIds,omitempty"`
		// List of directory identifiers.
		DirectoryIDs []int `json:"directoryIds,omitempty"`
		// List of branch identifiers.
		BranchIDs []int `json:"branchIds,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	// TranslatorAccuracySchema defines the schema for the translator
	// accuracy report.
	TranslatorAccuracySchema struct {
		// Report unit. Enum: strings, words, chars, chars_with_spaces.
		// Default: words.
		Unit ReportUnit `json:"unit,omitempty"`
		// Export file format.
		// Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Split into categories by edit distance.
		PostEditingCategories []string `json:"postEditingCategories,omitempty"`
		// Language Identifier for which the report should be generated.
		LanguageID string `json:"languageId,omitempty"`
		// List of user identifiers.
		UserIDs []int `json:"userIds,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	// PreTranslateAccuracySchema defines the schema for pre translate
	// accuracy report.
	PreTranslateAccuracySchema struct {
		// Report unit. Enum: strings, words, chars, chars_with_spaces.
		// Default: words.
		Unit ReportUnit `json:"unit,omitempty"`
		// Export file format.
		// Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Split into categories by edit distance.
		PostEditingCategories []string `json:"postEditingCategories,omitempty"`
		// Language Identifier for which the report should be generated.
		LanguageID string `json:"languageId,omitempty"`
		// Task Identifier for which the report should be generated.
		TaskID int `json:"taskId,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	// PreTranslateEfficiencySchema defines the schema for pre translate
	// efficiency report.
	// Deprecated: Use PreTranslateAccuracySchema instead.
	PreTranslateEfficiencySchema struct {
		// Report unit. Enum: strings, words, chars, chars_with_spaces.
		// Default: words.
		Unit ReportUnit `json:"unit,omitempty"`
		// Export file format.
		// Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Split into categories by edit distance.
		PostEditingCategories []string `json:"postEditingCategories,omitempty"`
		// Language Identifier for which the report should be generated.
		LanguageID string `json:"languageId,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	// SourceContentUpdatesSchema defines the schema for the source content updates report.
	SourceContentUpdatesSchema struct {
		// Report unit. Enum: strings, words, chars, chars_with_spaces. Default: words.
		Unit ReportUnit `json:"unit,omitempty"`
		// Export file format. Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	// ProjectMembersSchema defines the schema for the project members report.
	ProjectMembersSchema struct {
		// Export file format. Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	// EditorIssuesSchema defines the schema for the editor issues report.
	EditorIssuesSchema struct {
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
		// Export file format. Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Issue type filter.
		IssueType string `json:"issueType,omitempty"`
	}

	// QACheckIssuesSchema defines the schema for the QA check issues report.
	QACheckIssuesSchema struct {
		// Export file format. Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Language Identifier for which the report should be generated.
		LanguageID string `json:"languageId,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	// SavingActivitySchema defines the schema for the saving activity report.
	SavingActivitySchema struct {
		// Report unit. Enum: strings, words, chars, chars_with_spaces. Default: words.
		Unit ReportUnit `json:"unit,omitempty"`
		// Language Identifier for which the report should be generated.
		LanguageID string `json:"languageId,omitempty"`
		// Export file format. Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	// TranslationActivitySchema defines the schema for the translation activity report.
	TranslationActivitySchema struct {
		// Report unit. Enum: strings, words, chars, chars_with_spaces. Default: words.
		Unit ReportUnit `json:"unit,omitempty"`
		// Language Identifier for which the report should be generated.
		LanguageID string `json:"languageId,omitempty"`
		// Export file format. Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}
)

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *ReportGenerateRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	if r.Schema == nil {
		return errors.New("schema is required")
	}

	return r.Schema.ValidateSchema()
}

// ValidateSchema implements the ReportSchema interface and checks if the
// CostsEstimationPostEditing schema is valid.
func (r *CostsEstimationPostEditingSchema) ValidateSchema() error {
	return nil
}

// ValidateSchema implements the ReportSchema interface and checks if the
// TransactionCostsPostEditing schema is valid.
func (r *TransactionCostsPostEditingSchema) ValidateSchema() error {
	return nil
}

// ValidateSchema implements the ReportSchema interface and checks if the
// TopMembers schema is valid.
func (r *TopMembersSchema) ValidateSchema() error {
	return nil
}

// ValidateSchema implements the ReportSchema interface and checks if the
// ContributionRawData schema is valid.
func (r *ContributionRawDataSchema) ValidateSchema() error {
	if r.Mode == "" {
		return errors.New("mode is required")
	}

	return nil
}

// ValidateSchema implements the ReportSchema interface and checks if the
// TranslatorAccuracySchema schema is valid.
func (r *TranslatorAccuracySchema) ValidateSchema() error {
	return nil
}

// ValidateSchema implements the ReportSchema interface and checks if the
// PreTranslateAccuracy schema is valid.
func (r *PreTranslateAccuracySchema) ValidateSchema() error {
	return nil
}

// ValidateSchema implements the ReportSchema interface and checks if the
// PreTranslateEfficiency schema is valid.
func (r *PreTranslateEfficiencySchema) ValidateSchema() error {
	return nil
}

// ValidateSchema implements the ReportSchema interface and checks if the
// SourceContentUpdates schema is valid.
func (r *SourceContentUpdatesSchema) ValidateSchema() error {
	return nil
}

// ValidateSchema implements the ReportSchema interface and checks if the
// ProjectMembers schema is valid.
func (r *ProjectMembersSchema) ValidateSchema() error {
	return nil
}

// ValidateSchema implements the ReportSchema interface and checks if the
// EditorIssues schema is valid.
func (r *EditorIssuesSchema) ValidateSchema() error {
	return nil
}

// ValidateSchema implements the ReportSchema interface and checks if the
// QACheckIssues schema is valid.
func (r *QACheckIssuesSchema) ValidateSchema() error {
	return nil
}

// ValidateSchema implements the ReportSchema interface and checks if the
// SavingActivity schema is valid.
func (r *SavingActivitySchema) ValidateSchema() error {
	return nil
}

// ValidateSchema implements the ReportSchema interface and checks if the
// TranslationActivity schema is valid.
func (r *TranslationActivitySchema) ValidateSchema() error {
	return nil
}

// GroupReportGenerateRequest defines the structure of a request to
// generate a group or organization report.
type GroupReportGenerateRequest struct {
	// Report name.
	Name ReportName `json:"name"`
	// Schema for the group report generation request.
	// One of the following types:
	//  - GroupTransactionCostsPostEditingSchema
	//  - GroupTopMembersSchema
	//  - GroupTaskUsageSchema
	//  - GroupQACheckIssuesSchema
	//  - GroupTranslationActivitySchema
	Schema ReportGroupSchema `json:"schema"`
}

// ReportGroupSchema is an interface that defines the schema
// for a group report generation request.
//
// Schema can be one of the following types:
//   - GroupTransactionCostsPostEditingSchema
//   - GroupTopMembersSchema
//   - GroupTaskUsageSchema
//   - GroupQACheckIssuesSchema
//   - GroupTranslationActivitySchema
type ReportGroupSchema interface {
	ValidateGroupSchema() error
}

type (
	// GroupTransactionCostsPostEditingSchema defines the schema for the group
	// translation costs post-editing report.
	GroupTransactionCostsPostEditingSchema struct {
		// Project Identifier for which the report should be generated.
		ProjectIDs []int `json:"projectIds,omitempty"`
		// Report unit.
		// Enum: strings, words, chars, chars_with_spaces. Default: words.
		Unit ReportUnit `json:"unit,omitempty"`
		// Report currency.
		// Enum: USD, EUR, JPY, GBP, AUD, CAD, CHF, CNY, SEK, NZD, MXN,
		// SGD, HKD, NOK, KRW, TRY, RUB, INR, BRL, ZAR, GEL, UAH, DDK
		Currency string `json:"currency,omitempty"`
		// Export file format.
		// Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Base rates.
		BaseRates *ReportBaseRates `json:"baseRates,omitempty"`
		// Individual rates (Custom rates for certain languages or users).
		IndividualRates []*ReportIndividualRates `json:"individualRates,omitempty"`
		// Net Rate Schemes (Percentage paid of full translation rate).
		// Note: A new translation will be included in the report at the lowest rate
		// if multiple scheme categories can be applied to the translation.
		NetRateSchemes *ReportNetRateSchemes `json:"netRateSchemes,omitempty"`
		// Exclude approvals when the same user has made translations for the string.
		ExcludeApprovalsForEditedTranslations *bool `json:"excludeApprovalsForEditedTranslations,omitempty"`
		// Grouping parameter.
		// Enum: user, language. Default: user.
		GroupBy string `json:"groupBy,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
		// User Identifier for which the report should be generated.
		UserIDs []int `json:"userIds,omitempty"`
	}

	// GroupTopMembersSchema defines the schema for the group top members report.
	GroupTopMembersSchema struct {
		// Project Identifier for which the report should be generated.
		ProjectIDs []int `json:"projectIds,omitempty"`
		// Defines report unit.
		// Enum: strings, words, chars, chars_with_spaces. Default: words.
		Unit ReportUnit `json:"unit,omitempty"`
		// Language Identifier for which the report should be generated.
		LanguageID string `json:"languageId,omitempty"`
		// Export file format.
		// Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	// GroupTaskUsageSchema defines the schema for the group task usage report.
	GroupTaskUsageSchema struct {
		// Export file format. Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Report type filter.
		Type string `json:"type,omitempty"`
		// Project identifiers for which the report should be generated.
		ProjectIDs []int `json:"projectIds,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
		// Group results by the specified attribute.
		GroupBy string `json:"groupBy,omitempty"`
		// Task type identifier filter.
		TypeTasks int `json:"typeTasks,omitempty"`
		// Language Identifier for which the report should be generated.
		LanguageID string `json:"languageId,omitempty"`
		// Task creator identifier filter.
		CreatorID int `json:"creatorId,omitempty"`
		// Task assignee identifier filter.
		AssigneeID int `json:"assigneeId,omitempty"`
	}

	// GroupQACheckIssuesSchema defines the schema for the group QA check issues report.
	GroupQACheckIssuesSchema struct {
		// Project identifiers for which the report should be generated.
		ProjectIDs []int `json:"projectIds,omitempty"`
		// Export file format. Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	// GroupTranslationActivitySchema defines the schema for the group translation activity report.
	GroupTranslationActivitySchema struct {
		// Project identifiers for which the report should be generated.
		ProjectIDs []int `json:"projectIds,omitempty"`
		// Report unit. Enum: strings, words, chars, chars_with_spaces. Default: words.
		Unit ReportUnit `json:"unit,omitempty"`
		// Export file format. Enum: xlsx, csv, json. Default: xlsx.
		Format ReportFormat `json:"format,omitempty"`
		// Report date from in UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// Report date to in UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}
)

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *GroupReportGenerateRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	if r.Schema == nil {
		return errors.New("schema is required")
	}

	return r.Schema.ValidateGroupSchema()
}

// ValidateGroupSchema checks if the GroupCostsEstimationPostEditing schema is valid.
func (r *GroupTransactionCostsPostEditingSchema) ValidateGroupSchema() error {
	if r.BaseRates == nil {
		return errors.New("baseRates is required")
	}
	if r.IndividualRates == nil {
		return errors.New("individualRates is required")
	}
	if r.NetRateSchemes == nil {
		return errors.New("netRateSchemes is required")
	}

	return nil
}

// ValidateGroupSchema checks if the GroupTopMembers schema is valid.
func (r *GroupTopMembersSchema) ValidateGroupSchema() error {
	return nil
}

// ValidateGroupSchema checks if the GroupTaskUsage schema is valid.
func (r *GroupTaskUsageSchema) ValidateGroupSchema() error {
	return nil
}

// ValidateGroupSchema checks if the GroupQACheckIssues schema is valid.
func (r *GroupQACheckIssuesSchema) ValidateGroupSchema() error {
	return nil
}

// ValidateGroupSchema checks if the GroupTranslationActivity schema is valid.
func (r *GroupTranslationActivitySchema) ValidateGroupSchema() error {
	return nil
}

// ReportSettingsTemplate represents a report settings template.
type ReportSettingsTemplate struct {
	ID        int                          `json:"id"`
	Name      string                       `json:"name"`
	Currency  string                       `json:"currency"`
	Unit      string                       `json:"unit"`
	Config    ReportSettingsTemplateConfig `json:"config"`
	CreatedAt string                       `json:"createdAt"`
	UpdatedAt string                       `json:"updatedAt"`
	IsPublic  bool                         `json:"isPublic"`
	IsGlobal  *bool                        `json:"isGlobal,omitempty"`

	ProjectID int `json:"projectId,omitempty"`
	GroupID   int `json:"groupId,omitempty"`
}

// ReportSettingsTemplateResponse defines the structure of a response
// when getting a report settings template.
type ReportSettingsTemplateResponse struct {
	Data *ReportSettingsTemplate `json:"data"`
}

// ReportSettingsTemplateListResponse defines the structure of a response
// when getting a list of report settings templates.
type ReportSettingsTemplateListResponse struct {
	Data []*ReportSettingsTemplateResponse `json:"data"`
}

// ReportSettingsTemplatesListOptions specifies the optional parameters to
// the ReportsService.ListTemplates method.
type ReportSettingsTemplatesListOptions struct {
	// [Enterprise client] Project Identifier.
	ProjectID int `json:"projectId,omitempty"`
	// [Enterprise client] Group Identifier.
	GroupID int `json:"groupId,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of the options.
// It implements the crowdin.ListOptionsProvider interface.
func (o *ReportSettingsTemplatesListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if o.ProjectID != 0 {
		v.Add("projectId", fmt.Sprintf("%d", o.ProjectID))
	}
	if o.GroupID != 0 {
		v.Add("groupId", fmt.Sprintf("%d", o.GroupID))
	}

	return v, len(v) > 0
}

// ReportSettingsTemplateAddRequest defines the structure of a request to
// add a report settings template.
type ReportSettingsTemplateAddRequest struct {
	// Template name.
	Name string `json:"name"`
	// Report currency.
	// Enum: USD, EUR, JPY, GBP, AUD, CAD, CHF, CNY, SEK, NZD, MXN,
	// SGD, HKD, NOK, KRW, TRY, RUB, INR, BRL, ZAR, GEL, UAH, DDK
	Currency string `json:"currency"`
	// Report unit.
	// Enum: strings, words, chars, chars_with_spaces
	Unit ReportUnit `json:"unit"`
	// Report config.
	Config *ReportSettingsTemplateConfig `json:"config"`
	// Report visibility.
	IsPublic *bool `json:"isPublic,omitempty"`
	// Report global visibility.
	IsGlobal *bool `json:"isGlobal,omitempty"`

	// [Enterprise client] Project Identifier.
	ProjectID int `json:"projectId,omitempty"`
	// [Enterprise client] Group Identifier.
	GroupID int `json:"groupId,omitempty"`
}

// ReportSettingsTemplateUpdateRequest defines the structure of a request to
// create a report settings template.
type ReportSettingsTemplateConfig struct {
	// Base rates.
	BaseRates *ReportBaseRates `json:"baseRates,omitempty"`
	// Individual rates (Custom rates for certain languages or users).
	IndividualRates []*ReportIndividualRates `json:"individualRates,omitempty"`
	// Net Rate Schemes (Percentage paid of full translation rate).
	// Note: A new translation will be included in the report at the lowest rate
	// if multiple scheme categories can be applied to the translation.
	NetRateSchemes *ReportNetRateSchemes `json:"netRateSchemes,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *ReportSettingsTemplateAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	if r.Currency == "" {
		return errors.New("currency is required")
	}
	if r.Unit == "" {
		return errors.New("unit is required")
	}
	if r.Config == nil {
		return errors.New("config is required")
	}
	if r.Config.BaseRates == nil || len(r.Config.IndividualRates) == 0 || r.Config.NetRateSchemes == nil {
		return errors.New("config fields are required")
	}

	return nil
}
