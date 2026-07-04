package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestReportArchivesListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *ReportArchivesListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &ReportArchivesListOptions{},
		},
		{
			name: "all options",
			opts: &ReportArchivesListOptions{
				ScopeType: "project", ScopeID: 1,
				ListOptions: ListOptions{Limit: 10, Offset: 5},
			},
			out: "limit=10&offset=5&scopeId=1&scopeType=project",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v, ok := tt.opts.Values()
			if len(tt.out) > 0 {
				assert.True(t, ok)
				assert.Equal(t, tt.out, v.Encode())
			} else {
				assert.False(t, ok)
				assert.Empty(t, v.Encode())
			}
		})
	}
}

func TestReportGenerateRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *ReportGenerateRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name: "empty request",
			req:  &ReportGenerateRequest{},
			err:  "name is required",
		},
		{
			name: "required schema",
			req:  &ReportGenerateRequest{Name: ReportCostsEstimationPostEditing},
			err:  "schema is required",
		},
		{
			name: "valid schema (CostsEstimationPostEditingSchema)",
			req: &ReportGenerateRequest{
				Name:   ReportCostsEstimationPostEditing,
				Schema: &CostsEstimationPostEditingSchema{Unit: ReportUnitWords, Currency: "USD"},
			},
			valid: true,
		},
		{
			name: "valid schema (TransactionCostsPostEditingSchema)",
			req: &ReportGenerateRequest{
				Name:   ReportTransactionCostsPostEditing,
				Schema: &TransactionCostsPostEditingSchema{Unit: ReportUnitWords, Currency: "USD"},
			},
			valid: true,
		},
		{
			name: "valid schema (TopMembersSchema)",
			req: &ReportGenerateRequest{
				Name:   ReportTopMembers,
				Schema: &TopMembersSchema{Unit: ReportUnitWords},
			},
			valid: true,
		},
		{
			name: "required schema (ContributionRawDataSchema)",
			req: &ReportGenerateRequest{
				Name:   ReportContributionRawData,
				Schema: &ContributionRawDataSchema{Unit: ReportUnitWords},
			},
			err: "mode is required",
		},
		{
			name: "valid schema (ContributionRawDataSchema)",
			req: &ReportGenerateRequest{
				Name:   ReportContributionRawData,
				Schema: &ContributionRawDataSchema{Mode: ReportModeTranslations, Unit: ReportUnitWords},
			},
			valid: true,
		},
		{
			name: "valid schema (SourceContentUpdatesSchema)",
			req: &ReportGenerateRequest{
				Name:   ReportSourceContentUpdates,
				Schema: &SourceContentUpdatesSchema{Unit: ReportUnitWords},
			},
			valid: true,
		},
		{
			name: "valid schema (ProjectMembersSchema)",
			req: &ReportGenerateRequest{
				Name:   ReportProjectMembers,
				Schema: &ProjectMembersSchema{},
			},
			valid: true,
		},
		{
			name: "valid schema (EditorIssuesSchema)",
			req: &ReportGenerateRequest{
				Name:   ReportEditorIssues,
				Schema: &EditorIssuesSchema{IssueType: "all"},
			},
			valid: true,
		},
		{
			name: "valid schema (QACheckIssuesSchema)",
			req: &ReportGenerateRequest{
				Name:   ReportQACheckIssues,
				Schema: &QACheckIssuesSchema{LanguageID: "uk"},
			},
			valid: true,
		},
		{
			name: "valid schema (SavingActivitySchema)",
			req: &ReportGenerateRequest{
				Name:   ReportSavingActivity,
				Schema: &SavingActivitySchema{LanguageID: "uk", Unit: ReportUnitWords},
			},
			valid: true,
		},
		{
			name: "valid schema (TranslationActivitySchema)",
			req: &ReportGenerateRequest{
				Name:   ReportTranslationActivity,
				Schema: &TranslationActivitySchema{LanguageID: "ach", Unit: ReportUnitWords},
			},
			valid: true,
		},
		{
			name: "valid schema (TranslatorAccuracySchema)",
			req: &ReportGenerateRequest{
				Name:   ReportTranslatorAccuracy,
				Schema: &TranslatorAccuracySchema{Unit: ReportUnitStrings, Format: ReportFormatXLSX, PostEditingCategories: []string{"0-10"}},
			},
			valid: true,
		},
		{
			name: "valid schema (ReportPreTranslateAccuracySchema)",
			req: &ReportGenerateRequest{
				Name:   ReportPreTranslateAccuracy,
				Schema: &PreTranslateAccuracySchema{Unit: ReportUnitStrings, PostEditingCategories: []string{"0-10"}},
			},
			valid: true,
		},
		{
			name: "valid schema (ReportPreTranslateEfficiencySchema). Deprecated",
			req: &ReportGenerateRequest{
				Name:   ReportPreTranslateEfficiency,
				Schema: &PreTranslateEfficiencySchema{Unit: ReportUnitStrings, PostEditingCategories: []string{"0-10"}},
			},
			valid: true,
		},
		{
			name: "required schema.baseRates (CostsEstimationSchema)",
			req: &ReportGenerateRequest{
				Name: ReportCostsEstimation,
				Schema: &CostsEstimationSchema{
					Unit:     ReportUnitWords,
					Currency: "USD",
				},
			},
			err: "baseRates is required",
		},
		{
			name: "valid schema (CostsEstimationSchema)",
			req: &ReportGenerateRequest{
				Name: ReportCostsEstimation,
				Schema: &CostsEstimationSchema{
					Unit:            ReportUnitWords,
					Currency:        "USD",
					BaseRates:       &ReportBaseRates{FullTranslation: 0.1, Proofread: 0.2},
					IndividualRates: []*ReportIndividualRates{{UserIDs: []int{1}, FullTranslation: 0.1, Proofread: 0.2}},
					NetRateSchemes: &ReportNetRateSchemes{
						TMMatch: []ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.1}},
					},
				},
			},
			valid: true,
		},
		{
			name: "valid schema (TranslationCostsSchema)",
			req: &ReportGenerateRequest{
				Name: ReportTranslationCosts,
				Schema: &TranslationCostsSchema{
					Unit:            ReportUnitWords,
					Currency:        "USD",
					BaseRates:       &ReportBaseRates{FullTranslation: 0.1, Proofread: 0.2},
					IndividualRates: []*ReportIndividualRates{{UserIDs: []int{1}, FullTranslation: 0.1, Proofread: 0.2}},
					NetRateSchemes: &ReportNetRateSchemes{
						TMMatch: []ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.1}},
					},
				},
			},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}

func TestGroupReportGenerateRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *GroupReportGenerateRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name: "empty request",
			req:  &GroupReportGenerateRequest{},
			err:  "name is required",
		},
		{
			name: "required schema",
			req:  &GroupReportGenerateRequest{Name: ReportGroupTranslationCostsPostEditing},
			err:  "schema is required",
		},
		{
			name: "required schema.baseRates",
			req: &GroupReportGenerateRequest{
				Name:   ReportGroupTranslationCostsPostEditing,
				Schema: &GroupTransactionCostsPostEditingSchema{},
			},
			err: "baseRates is required",
		},
		{
			name: "required schema.individualRates",
			req: &GroupReportGenerateRequest{
				Name: ReportGroupTranslationCostsPostEditing,
				Schema: &GroupTransactionCostsPostEditingSchema{
					BaseRates: &ReportBaseRates{},
				},
			},
			err: "individualRates is required",
		},
		{
			name: "required schema.netRateSchemes",
			req: &GroupReportGenerateRequest{
				Name: ReportGroupTranslationCostsPostEditing,
				Schema: &GroupTransactionCostsPostEditingSchema{
					BaseRates:       &ReportBaseRates{},
					IndividualRates: []*ReportIndividualRates{},
				},
			},
			err: "netRateSchemes is required",
		},
		{
			name: "valid request (GroupTransactionCostsPostEditingSchema)",
			req: &GroupReportGenerateRequest{
				Name: ReportGroupTranslationCostsPostEditing,
				Schema: &GroupTransactionCostsPostEditingSchema{
					BaseRates:       &ReportBaseRates{FullTranslation: 0.1, Proofread: 0.2},
					IndividualRates: []*ReportIndividualRates{{UserIDs: []int{1}, FullTranslation: 0.1, Proofread: 0.2}},
					NetRateSchemes: &ReportNetRateSchemes{
						TMMatch:         []ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.1}},
						MTMatch:         []ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.2}},
						SuggestionMatch: []ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.3}},
					},
				},
			},
			valid: true,
		},
		{
			name: "valid request (GroupTopMembersSchema)",
			req: &GroupReportGenerateRequest{
				Name:   ReportGroupTopMembers,
				Schema: &GroupTopMembersSchema{ProjectIDs: []int{1}, Unit: ReportUnitWords},
			},
			valid: true,
		},
		{
			name: "valid request (GroupTaskUsageSchema)",
			req: &GroupReportGenerateRequest{
				Name:   ReportGroupTaskUsage,
				Schema: &GroupTaskUsageSchema{ProjectIDs: []int{1}, Format: ReportFormatXLSX},
			},
			valid: true,
		},
		{
			name: "valid request (GroupQACheckIssuesSchema)",
			req: &GroupReportGenerateRequest{
				Name:   ReportGroupQACheckIssues,
				Schema: &GroupQACheckIssuesSchema{ProjectIDs: []int{1}, Format: ReportFormatXLSX},
			},
			valid: true,
		},
		{
			name: "valid request (GroupTranslationActivitySchema)",
			req: &GroupReportGenerateRequest{
				Name:   ReportGroupTranslationActivity,
				Schema: &GroupTranslationActivitySchema{ProjectIDs: []int{1}, Unit: ReportUnitWords},
			},
			valid: true,
		},
		{
			name: "valid request (GroupCostsEstimationSchema)",
			req: &GroupReportGenerateRequest{
				Name: ReportGroupCostsEstimation,
				Schema: &GroupCostsEstimationSchema{
					ProjectIDs:      []int{1},
					Unit:            ReportUnitWords,
					Currency:        "USD",
					BaseRates:       &ReportBaseRates{FullTranslation: 0.1, Proofread: 0.2},
					IndividualRates: []*ReportIndividualRates{{UserIDs: []int{1}, FullTranslation: 0.1, Proofread: 0.2}},
					NetRateSchemes: &ReportNetRateSchemes{
						TMMatch: []ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.1}},
					},
				},
			},
			valid: true,
		},
		{
			name: "valid request (GroupTranslationCostsSchema)",
			req: &GroupReportGenerateRequest{
				Name: ReportGroupTranslationCosts,
				Schema: &GroupTranslationCostsSchema{
					ProjectIDs:      []int{1},
					Unit:            ReportUnitWords,
					Currency:        "USD",
					BaseRates:       &ReportBaseRates{FullTranslation: 0.1, Proofread: 0.2},
					IndividualRates: []*ReportIndividualRates{{UserIDs: []int{1}, FullTranslation: 0.1, Proofread: 0.2}},
					NetRateSchemes: &ReportNetRateSchemes{
						TMMatch: []ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.1}},
					},
				},
			},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}

func TestReportSettingsTemplatesListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *ReportSettingsTemplatesListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &ReportSettingsTemplatesListOptions{},
		},
		{
			name: "all options",
			opts: &ReportSettingsTemplatesListOptions{
				ProjectID: 1, GroupID: 2,
				ListOptions: ListOptions{Limit: 10, Offset: 5},
			},
			out: "groupId=2&limit=10&offset=5&projectId=1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v, ok := tt.opts.Values()
			if len(tt.out) > 0 {
				assert.True(t, ok)
				assert.Equal(t, tt.out, v.Encode())
			} else {
				assert.False(t, ok)
				assert.Empty(t, v.Encode())
			}
		})
	}
}

func TestReportSettingsTemplateAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *ReportSettingsTemplateAddRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name: "empty request",
			req:  &ReportSettingsTemplateAddRequest{},
			err:  "name is required",
		},
		{
			name: "required currency",
			req:  &ReportSettingsTemplateAddRequest{Name: "Default template"},
			err:  "currency is required",
		},
		{
			name: "required unit",
			req:  &ReportSettingsTemplateAddRequest{Name: "Default template", Currency: "USD"},
			err:  "unit is required",
		},
		{
			name: "required config",
			req: &ReportSettingsTemplateAddRequest{
				Name: "Default template", Currency: "USD",
				Unit: ReportUnitWords,
			},
			err: "config is required",
		},
		{
			name: "required config fields",
			req: &ReportSettingsTemplateAddRequest{
				Name: "Default template", Currency: "USD",
				Unit: ReportUnitWords, Config: &ReportSettingsTemplateConfig{},
			},
			err: "config fields are required",
		},
		{
			name: "valid request",
			req: &ReportSettingsTemplateAddRequest{
				Name: "Default template", Currency: "USD", Unit: ReportUnitWords,
				Config: &ReportSettingsTemplateConfig{
					BaseRates:       &ReportBaseRates{FullTranslation: 0.1, Proofread: 0.2},
					IndividualRates: []*ReportIndividualRates{{UserIDs: []int{1}, FullTranslation: 0.1, Proofread: 0.2}},
					NetRateSchemes: &ReportNetRateSchemes{
						TMMatch:         []ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.1}},
						MTMatch:         []ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.2}},
						SuggestionMatch: []ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.3}},
					},
				},
			},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}
