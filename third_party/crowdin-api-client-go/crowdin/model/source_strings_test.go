package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSourceStringsListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *SourceStringsListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &SourceStringsListOptions{},
		},
		{
			name: "with DenormalizePlaceholders = 0",
			opts: &SourceStringsListOptions{DenormalizePlaceholders: toPtr(0)},
			out:  "denormalizePlaceholders=0",
		},
		{
			name: "with all options",
			opts: &SourceStringsListOptions{DenormalizePlaceholders: toPtr(1), LabelIDs: []int{1, 2, 3},
				FileID: 1, BranchID: 1, DirectoryID: 1, TaskID: 2, CroQL: "croql", Filter: "text", Scope: "identifier"},
			out: "branchId=1&croql=croql&denormalizePlaceholders=1&directoryId=1&fileId=1&filter=text&labelIds=1%2C2%2C3&scope=identifier&taskId=2",
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
				assert.Empty(t, v)
			}
		})
	}
}

func TestSourceStringsGetOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *SourceStringsGetOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &SourceStringsGetOptions{},
		},
		{
			name: "with DenormalizePlaceholders = 0",
			opts: &SourceStringsGetOptions{DenormalizePlaceholders: toPtr(0)},
			out:  "denormalizePlaceholders=0",
		},
		{
			name: "with denormalizePlaceholders = 1",
			opts: &SourceStringsGetOptions{DenormalizePlaceholders: toPtr(1)},
			out:  "denormalizePlaceholders=1",
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
				assert.Empty(t, v)
			}
		})
	}
}

func TestSourceStringsAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *SourceStringsAddRequest
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
			req:  &SourceStringsAddRequest{},
			err:  "text must be a string or map of strings",
		},
		{
			name: "unsupported text type",
			req:  &SourceStringsAddRequest{Text: []int{1, 2, 3}, FileID: 48},
			err:  "text must be a string or map of strings",
		},
		{
			name: "missing text",
			req:  &SourceStringsAddRequest{FileID: 48},
			err:  "text must be a string or map of strings",
		},
		{
			name: "empty text",
			req:  &SourceStringsAddRequest{Text: "", FileID: 48},
			err:  "text cannot be empty",
		},
		{
			name: "empty text map",
			req:  &SourceStringsAddRequest{Text: map[string]string{}},
			err:  "text cannot be empty",
		},
		{
			name: "empty fileID",
			req:  &SourceStringsAddRequest{Text: "Not all videos are shown to users.", Identifier: "name"},
			err:  "fileId or branchId is required",
		},
		{
			name:  "valid request",
			req:   &SourceStringsAddRequest{Text: "Not all videos are shown to users.", Identifier: "name", FileID: 1},
			valid: true,
		},
		{
			name: "valid request",
			req: &SourceStringsAddRequest{
				Text: map[string]string{
					"one":   "string",
					"other": "strings",
				},
				FileID:     2,
				Identifier: "name",
				Context:    "context",
				IsHidden:   toPtr(false),
				MaxLength:  toPtr(10),
				Fields: map[string]any{
					"key_1": "value_1",
					"key_2": 2,
					"key_3": true,
					"key_4": []string{"en", "uk"},
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

func TestSourceStringsUploadRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *SourceStringsUploadRequest
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
			req:  &SourceStringsUploadRequest{},
			err:  "storageId is required",
		},
		{
			name: "missing branchId",
			req:  &SourceStringsUploadRequest{StorageID: 1},
			err:  "branchId is required",
		},
		{
			name: "invalid request",
			req: &SourceStringsUploadRequest{StorageID: 1, BranchID: 1, Type: "xlsx", ParserVersion: 1,
				LabelIDs: []int{1, 2, 3}, UpdateStrings: toPtr(false), CleanupMode: toPtr(false),
				ImportOptions: &SourceStringsImportOptions{FirstLineContainsHeader: toPtr(true),
					ImportTranslations: toPtr(true), Scheme: map[string]int{"key": 0}}, UpdateOption: "clear_translations_and_approvals"},
			err: "updateStrings must be set to true to use updateOption",
		},
		{
			name: "valid request",
			req: &SourceStringsUploadRequest{StorageID: 1, BranchID: 1, Type: "xlsx", ParserVersion: 1,
				LabelIDs: []int{1, 2, 3}, UpdateStrings: toPtr(false), CleanupMode: toPtr(false),
				ImportOptions: &SourceStringsImportOptions{FirstLineContainsHeader: toPtr(true),
					ImportTranslations: toPtr(true), Scheme: map[string]int{"key": 0}}},
			valid: true,
		},
		{
			name: "valid request 2",
			req: &SourceStringsUploadRequest{StorageID: 1, BranchID: 1, Type: "xlsx", ParserVersion: 1,
				LabelIDs: []int{1, 2, 3}, UpdateStrings: toPtr(true), CleanupMode: toPtr(false),
				ImportOptions: &SourceStringsImportOptions{FirstLineContainsHeader: toPtr(true),
					ImportTranslations: toPtr(true), Scheme: map[string]int{"key": 0}}, UpdateOption: "clear_translations_and_approvals"},
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
