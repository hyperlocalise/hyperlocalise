package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMTListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *MTListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &MTListOptions{},
		},
		{
			name: "with group ID = 0",
			opts: &MTListOptions{GroupID: toPtr(0)},
			out:  "groupId=0",
		},
		{
			name: "with group ID",
			opts: &MTListOptions{GroupID: toPtr(1)},
			out:  "groupId=1",
		},
		{
			name: "with all options",
			opts: &MTListOptions{GroupID: toPtr(4), ListOptions: ListOptions{Offset: 1, Limit: 10}},
			out:  "groupId=4&limit=10&offset=1",
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

func TestMTAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *MTAddRequest
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
			req:  &MTAddRequest{},
			err:  "name is required",
		},
		{
			name: "missing type",
			req:  &MTAddRequest{Name: "Crowdin Translate"},
			err:  "type is required",
		},
		{
			name: "missing credentials",
			req:  &MTAddRequest{Name: "Crowdin Translate", Type: "crowdin", Credentials: nil},
			err:  "credentials are required",
		},
		{
			name: "valid request",
			req: &MTAddRequest{Name: "Crowdin Translate", Type: "crowdin",
				Credentials: &MTECredentials{APIKey: "test"}},
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

func TestTranslateRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *TranslateRequest
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
			req:  &TranslateRequest{},
			err:  "target language ID is required",
		},
		{
			name: "missing source language ID",
			req:  &TranslateRequest{TargetLanguageID: "de"},
			err:  "source language ID or language recognition provider is required",
		},
		{
			name: "invalid language provider",
			req:  &TranslateRequest{TargetLanguageID: "de", LanguageRecognitionProvider: "invalid_provider"},
			err:  "invalid language recognition provider",
		},
		{
			name: "valid request",
			req: &TranslateRequest{SourceLanguageID: "en", TargetLanguageID: "de",
				LanguageRecognitionProvider: LanguageRecognitionProviderCrowdin, Strings: []string{"Hello, World!"}},
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
