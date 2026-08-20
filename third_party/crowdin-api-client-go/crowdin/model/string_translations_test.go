package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestApprovalsListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *ApprovalsListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &ApprovalsListOptions{},
		},
		{
			name: "with all options",
			opts: &ApprovalsListOptions{
				OrderBy: "createdAt desc,id", FileID: 1, LabelIDs: []int{1, 2},
				ExcludeLabelIDs: []int{3, 4}, StringID: 2, LanguageID: "en", TranslationID: 3,
				CorrectionID: 4,
				ListOptions:  ListOptions{Offset: 1, Limit: 10},
			},
			out: "correctionId=4&excludeLabelIds=3%2C4&fileId=1&labelIds=1%2C2&languageId=en&limit=10&offset=1&orderBy=createdAt+desc%2Cid&stringId=2&translationId=3",
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

func TestCorrectionsListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *CorrectionsListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &CorrectionsListOptions{},
		},
		{
			name: "with denormalizePlaceholders = 0",
			opts: &CorrectionsListOptions{DenormalizePlaceholders: toPtr(0)},
			out:  "denormalizePlaceholders=0",
		},
		{
			name: "with all options",
			opts: &CorrectionsListOptions{
				StringID:                123,
				OrderBy:                 "createdAt desc",
				DenormalizePlaceholders: toPtr(1),
				ListOptions:             ListOptions{Offset: 5, Limit: 15},
			},
			out: "denormalizePlaceholders=1&limit=15&offset=5&orderBy=createdAt+desc&stringId=123",
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

func TestCorrectionAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *CorrectionAddRequest
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
			req:  &CorrectionAddRequest{},
			err:  "string ID is required",
		},
		{
			name: "missing text",
			req:  &CorrectionAddRequest{StringID: 123},
			err:  "text is required",
		},
		{
			name: "valid request",
			req: &CorrectionAddRequest{
				StringID:           123,
				Text:               "Corrected text",
				PluralCategoryName: "few",
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

func TestCorrectionGetOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *CorrectionGetOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &CorrectionGetOptions{},
		},
		{
			name: "with denormalizePlaceholders = 0",
			opts: &CorrectionGetOptions{DenormalizePlaceholders: toPtr(0)},
			out:  "denormalizePlaceholders=0",
		},
		{
			name: "with denormalizePlaceholders = 1",
			opts: &CorrectionGetOptions{DenormalizePlaceholders: toPtr(1)},
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

func TestTranslationAlignmentRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *TranslationAlignmentRequest
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
			req:  &TranslationAlignmentRequest{},
			err:  "source language ID is required",
		},
		{
			name: "missing target language ID",
			req:  &TranslationAlignmentRequest{SourceLanguageID: "en"},
			err:  "target language ID is required",
		},
		{
			name: "missing text",
			req:  &TranslationAlignmentRequest{SourceLanguageID: "en", TargetLanguageID: "de"},
			err:  "text is required",
		},
		{
			name:  "valid request",
			req:   &TranslationAlignmentRequest{SourceLanguageID: "en", TargetLanguageID: "de", Text: "Hello, World!"},
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

func TestLanguageTranslationsListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *LanguageTranslationsListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &LanguageTranslationsListOptions{},
		},
		{
			name: "with DenormalizePlaceholders = 0",
			opts: &LanguageTranslationsListOptions{DenormalizePlaceholders: toPtr(0)},
			out:  "denormalizePlaceholders=0",
		},
		{
			name: "with all options",
			opts: &LanguageTranslationsListOptions{
				OrderBy: "createdAt desc,id", StringIDs: []int{1, 2}, LabelIDs: []int{1, 2},
				FileID: 1, BranchID: 2, DirectoryID: 3, CroQL: "croql", DenormalizePlaceholders: toPtr(1),
				ListOptions: ListOptions{Offset: 1, Limit: 10},
			},
			out: "branchId=2&croql=croql&denormalizePlaceholders=1&directoryId=3&fileId=1&labelIds=1%2C2&limit=10&offset=1&orderBy=createdAt+desc%2Cid&stringIds=1%2C2",
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

func TestTranslationGetOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *TranslationGetOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &TranslationGetOptions{},
		},
		{
			name: "with denormalizePlaceholders = 0",
			opts: &TranslationGetOptions{DenormalizePlaceholders: toPtr(0)},
			out:  "denormalizePlaceholders=0",
		},
		{
			name: "with denormalizePlaceholders = 1",
			opts: &TranslationGetOptions{DenormalizePlaceholders: toPtr(1)},
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

func TestStringTranslationsListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *StringTranslationsListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &StringTranslationsListOptions{},
		},
		{
			name: "with denormalizePlaceholders = 0",
			opts: &StringTranslationsListOptions{DenormalizePlaceholders: toPtr(0)},
			out:  "denormalizePlaceholders=0",
		},
		{
			name: "with all options",
			opts: &StringTranslationsListOptions{
				OrderBy: "createdAt desc,name", StringID: 1,
				LanguageID: "en", FileID: 42, LabelIDs: []int{10, 20},
				CroQL: "croql_expr", DenormalizePlaceholders: toPtr(1),
				ListOptions: ListOptions{Offset: 5, Limit: 15},
			},
			out: "croql=croql_expr&denormalizePlaceholders=1&fileId=42&labelIds=10%2C20&languageId=en&limit=15&offset=5&orderBy=createdAt+desc%2Cname&stringId=1",
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

func TestTranslationAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *TranslationAddRequest
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
			req:  &TranslationAddRequest{},
			err:  "string ID is required",
		},
		{
			name: "missing language ID",
			req:  &TranslationAddRequest{StringID: 123},
			err:  "language ID is required",
		},
		{
			name: "missing text",
			req:  &TranslationAddRequest{StringID: 123, LanguageID: "uk"},
			err:  "text is required",
		},
		{
			name: "valid request",
			req: &TranslationAddRequest{
				StringID: 123, LanguageID: "uk", Text: "Hello, World!",
				PluralCategoryName: "one", AddToTM: toPtr(true),
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

func TestVotesListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *VotesListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &VotesListOptions{},
		},
		{
			name: "with all options",
			opts: &VotesListOptions{
				StringID: 1, LanguageID: "en", TranslationID: 2, FileID: 3,
				LabelIDs: []int{1, 2}, ExcludeLabelIDs: []int{3, 4},
				ListOptions: ListOptions{Offset: 1, Limit: 10},
			},
			out: "excludeLabelIds=3%2C4&fileId=3&labelIds=1%2C2&languageId=en&limit=10&offset=1&stringId=1&translationId=2",
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

func TestVoteAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *VoteAddRequest
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
			req:  &VoteAddRequest{},
			err:  "invalid vote type: \"\"",
		},
		{
			name: "invalid vote type: empty string",
			req:  &VoteAddRequest{TranslationID: 19069345},
			err:  "invalid vote type: \"\"",
		},
		{
			name: "invalid vote type",
			req:  &VoteAddRequest{Mark: "test", TranslationID: 19069345},
			err:  "invalid vote type: \"test\"",
		},
		{
			name: "missing translation ID",
			req:  &VoteAddRequest{Mark: VoteTypeUp},
			err:  "translation ID is required",
		},
		{
			name:  "valid request",
			req:   &VoteAddRequest{Mark: VoteTypeUp, TranslationID: 19069345},
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
