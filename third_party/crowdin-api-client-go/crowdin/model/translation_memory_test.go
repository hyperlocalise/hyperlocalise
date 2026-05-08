package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestTranslationMemoriesListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *TranslationMemoriesListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &TranslationMemoriesListOptions{},
		},
		{
			name: "all options",
			opts: &TranslationMemoriesListOptions{OrderBy: "createdAt desc,name", UserID: 1,
				ListOptions: ListOptions{Limit: 10, Offset: 5}},
			out: "limit=10&offset=5&orderBy=createdAt+desc%2Cname&userId=1",
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

func TestTranslationMemoryAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *TranslationMemoryAddRequest
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
			req:  &TranslationMemoryAddRequest{},
			err:  "name is required",
		},
		{
			name: "missing languageId",
			req:  &TranslationMemoryAddRequest{Name: "Knowledge Base's TM"},
			err:  "languageId is required",
		},
		{
			name:  "valid request",
			req:   &TranslationMemoryAddRequest{Name: "Knowledge Base's TM", LanguageID: "en"},
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

func TestTranslationMemoryExportRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *TranslationMemoryExportRequest
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
			req:  &TranslationMemoryExportRequest{Format: "unknown"},
			err:  "unsupported format: \"unknown\"",
		},
		{
			name:  "valid request",
			req:   &TranslationMemoryExportRequest{SourceLanguageID: "en", TargetLanguageID: "fr", Format: TMExportFormatCSV},
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

func TestTranslationMemoryImportRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *TranslationMemoryImportRequest
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
			req:  &TranslationMemoryImportRequest{},
			err:  "storageId is required",
		},
		{
			name: "missing storageId",
			req:  &TranslationMemoryImportRequest{StorageID: -1},
			err:  "storageId is required",
		},
		{
			name: "valid request",
			req: &TranslationMemoryImportRequest{StorageID: 1, FirstLineContainsHeader: toPtr(true),
				Scheme: map[string]int{"en": 0, "fr": 1}},
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

func TestTMConcordanceSearchRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *TMConcordanceSearchRequest
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
			req:  &TMConcordanceSearchRequest{},
			err:  "sourceLanguageId is required",
		},
		{
			name: "missing targetLanguageId",
			req:  &TMConcordanceSearchRequest{SourceLanguageID: "en"},
			err:  "targetLanguageId is required",
		},
		{
			name: "missing autoSubstitution",
			req:  &TMConcordanceSearchRequest{SourceLanguageID: "en", TargetLanguageID: "de"},
			err:  "autoSubstitution is required",
		},
		{
			name: "missing minRelevant",
			req: &TMConcordanceSearchRequest{SourceLanguageID: "en", TargetLanguageID: "de",
				AutoSubstitution: toPtr(true)},
			err: "minRelevant is required",
		},
		{
			name: "minRelevant is required",
			req: &TMConcordanceSearchRequest{SourceLanguageID: "en", TargetLanguageID: "de",
				AutoSubstitution: toPtr(true), MinRelevant: 0},
			err: "minRelevant is required",
		},
		{
			name: "missing expressions",
			req: &TMConcordanceSearchRequest{SourceLanguageID: "en", TargetLanguageID: "de",
				AutoSubstitution: toPtr(true), MinRelevant: 60},
			err: "expressions cannot be empty",
		},
		{
			name: "empty expressions",
			req: &TMConcordanceSearchRequest{SourceLanguageID: "en", TargetLanguageID: "de",
				AutoSubstitution: toPtr(true), MinRelevant: 60, Expressions: []string{}},
			err: "expressions cannot be empty",
		},
		{
			name: "valid request",
			req: &TMConcordanceSearchRequest{SourceLanguageID: "en", TargetLanguageID: "de",
				AutoSubstitution: toPtr(true), MinRelevant: 60, Expressions: []string{"expression"}},
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

func TestTMSegmentsListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *TMSegmentsListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &TMSegmentsListOptions{},
		},
		{
			name: "all options",
			opts: &TMSegmentsListOptions{OrderBy: "createdAt desc,name", CroQL: "croql",
				ListOptions: ListOptions{Limit: 10, Offset: 5}},
			out: "croql=croql&limit=10&offset=5&orderBy=createdAt+desc%2Cname",
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

func TestTMSegmentCreateRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *TMSegmentCreateRequest
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
			req:  &TMSegmentCreateRequest{},
			err:  "records is required",
		},
		{
			name:  "valid request",
			req:   &TMSegmentCreateRequest{Records: []*TMSegmentCreateRecord{{LanguageID: "en", Text: "text"}}},
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
