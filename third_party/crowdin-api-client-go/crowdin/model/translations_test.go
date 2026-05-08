package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPreTranslationRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *PreTranslationRequest
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
			req:  &PreTranslationRequest{},
			err:  "languageIds is required",
		},
		{
			name: "missing fileIds",
			req:  &PreTranslationRequest{LanguageIDs: []string{"uk"}},
			err:  "fileIds is required",
		},
		{
			name: "valid request",
			req: &PreTranslationRequest{LanguageIDs: []string{"uk"}, FileIDs: []int{1, 2},
				Method: "tm", EngineID: 1, AutoApproveOption: "all", DuplicateTranslations: toPtr(false)},
			valid: true,
		},
		{
			name: "missing aiPromptId",
			req: &PreTranslationRequest{LanguageIDs: []string{"uk"}, FileIDs: []int{1, 2},
				Method: "ai", AutoApproveOption: "all", DuplicateTranslations: toPtr(false)},
			err: "aiPromptId is required",
		},
		{
			name: "valid request with ai method",
			req: &PreTranslationRequest{LanguageIDs: []string{"uk"}, FileIDs: []int{1, 2},
				Method: "ai", AIPromptID: 1, AutoApproveOption: "all", DuplicateTranslations: toPtr(false)},
			valid: true,
		},
		{
			name: "missing engineId with mt method",
			req: &PreTranslationRequest{LanguageIDs: []string{"uk"}, FileIDs: []int{1, 2},
				Method: "mt", AutoApproveOption: "all", DuplicateTranslations: toPtr(false)},
			err: "engineId is required",
		},
		{
			name: "valid request with mt method",
			req: &PreTranslationRequest{LanguageIDs: []string{"uk"}, FileIDs: []int{1, 2},
				Method: "mt", EngineID: 1, AutoApproveOption: "all", DuplicateTranslations: toPtr(false)},
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

func TestBuildProjectDirectoryTranslationRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *BuildProjectDirectoryTranslationRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name:  "empty request",
			req:   &BuildProjectDirectoryTranslationRequest{},
			valid: true,
		},
		{
			name: "must not skip both",
			req: &BuildProjectDirectoryTranslationRequest{SkipUntranslatedStrings: toPtr(true),
				SkipUntranslatedFiles: toPtr(true)},
			err: "skipUntranslatedStrings and skipUntranslatedFiles must not be true at the same request",
		},
		{
			name: "must not export both",
			req: &BuildProjectDirectoryTranslationRequest{
				ExportWithMinApprovalsCount:     toPtr(1),
				ExportStringsThatPassedWorkflow: toPtr(true),
			},
			err: "exportWithMinApprovalsCount and exportStringsThatPassedWorkflow must not be true at the same request",
		},
		{
			name: "valid request",
			req: &BuildProjectDirectoryTranslationRequest{TargetLanguageIDs: []string{"en"},
				SkipUntranslatedStrings: toPtr(true), ExportApprovedOnly: toPtr(true)},
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

func TestBuildProjectFileTranslationRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *BuildProjectFileTranslationRequest
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
			req:  &BuildProjectFileTranslationRequest{},
			err:  "targetLanguageId is required",
		},
		{
			name: "must not skip both",
			req: &BuildProjectFileTranslationRequest{TargetLanguageID: "uk", SkipUntranslatedStrings: toPtr(true),
				SkipUntranslatedFiles: toPtr(true)},
			err: "skipUntranslatedStrings and skipUntranslatedFiles must not be true at the same request",
		},
		{
			name: "must not export both",
			req: &BuildProjectFileTranslationRequest{TargetLanguageID: "uk", ExportWithMinApprovalsCount: toPtr(1),
				ExportStringsThatPassedWorkflow: toPtr(true)},
			err: "exportWithMinApprovalsCount and exportStringsThatPassedWorkflow must not be true at the same request",
		},
		{
			name: "valid request",
			req: &BuildProjectFileTranslationRequest{TargetLanguageID: "uk", SkipUntranslatedStrings: toPtr(true),
				ExportApprovedOnly: toPtr(true)},
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

func TestTranslationsBuildsListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *TranslationsBuildsListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &TranslationsBuildsListOptions{},
		},
		{
			name: "with all options",
			opts: &TranslationsBuildsListOptions{BranchID: 1, ListOptions: ListOptions{Limit: 10, Offset: 5}},
			out:  "branchId=1&limit=10&offset=5",
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

func TestBuildProjectRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *BuildProjectRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name:  "empty request",
			req:   &BuildProjectRequest{},
			valid: true,
		},
		{
			name: "must not skip both",
			req:  &BuildProjectRequest{SkipUntranslatedStrings: toPtr(true), SkipUntranslatedFiles: toPtr(true)},
			err:  "`skipUntranslatedStrings` and `skipUntranslatedFiles` must not be true at the same request",
		},
		{
			name: "must not export both",
			req:  &BuildProjectRequest{ExportWithMinApprovalsCount: toPtr(1), ExportStringsThatPassedWorkflow: toPtr(true)},
			err:  "`exportWithMinApprovalsCount` and `exportStringsThatPassedWorkflow` must not be true at the same request",
		},
		{
			name: "valid request",
			req: &BuildProjectRequest{BranchID: 1, TargetLanguageIDs: []string{"en"}, SkipUntranslatedStrings: toPtr(true),
				ExportApprovedOnly: toPtr(true)},
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

func TestPseudoBuildProjectRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *PseudoBuildProjectRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name:  "empty request",
			req:   &PseudoBuildProjectRequest{},
			valid: true,
		},
		{
			name: "invalid lengthTransformation",
			req:  &PseudoBuildProjectRequest{LengthTransformation: toPtr(-100)},
			err:  "lengthTransformation must be from -50 to 100",
		},
		{
			name: "valid request",
			req: &PseudoBuildProjectRequest{Pseudo: toPtr(true), BranchID: 1, Prefix: "prefix", Suffix: "suffix",
				LengthTransformation: toPtr(50), CharTransformation: "cyrillic"},
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

func TestUploadTranslationsRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *UploadTranslationsRequest
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
			req:  &UploadTranslationsRequest{},
			err:  "storageId is required",
		},
		{
			name: "one of fileId or branchId is required",
			req:  &UploadTranslationsRequest{StorageID: 1, FileID: 2, BranchID: 3},
			err:  "fileId and branchId can not be used at the same request",
		},
		{
			name: "valid request",
			req: &UploadTranslationsRequest{StorageID: 1, FileID: 2, BranchID: 0,
				ImportEqSuggestions: toPtr(true), AutoApproveImported: toPtr(true), TranslateHidden: toPtr(true),
				AddToTM: toPtr(false)},
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

func TestExportTranslationRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *ExportTranslationRequest
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
			req:  &ExportTranslationRequest{},
			err:  "targetLanguageId is required",
		},
		{
			name: "valid request",
			req: &ExportTranslationRequest{TargetLanguageID: "uk", Format: "xliff", FileIDs: []int{1}, LabelIDs: []int{4},
				SkipUntranslatedFiles: toPtr(false), ExportApprovedOnly: toPtr(false)},
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
