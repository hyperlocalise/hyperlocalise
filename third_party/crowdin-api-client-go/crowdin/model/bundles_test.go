package model

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestBundleAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *BundleAddRequest
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
			req:  &BundleAddRequest{},
			err:  "name is required",
		},
		{
			name: "missing format",
			req:  &BundleAddRequest{Name: "Resx bundle"},
			err:  "format is required",
		},
		{
			name: "missing sourcePatterns",
			req:  &BundleAddRequest{Name: "Resx bundle", Format: "crowdin-resx"},
			err:  "sourcePatterns is required",
		},
		{
			name: "missing exportPattern",
			req:  &BundleAddRequest{Name: "Resx bundle", Format: "crowdin-resx", SourcePatterns: []string{"/master"}},
			err:  "exportPattern is required",
		},
		{
			name:  "valid request",
			req:   &BundleAddRequest{Name: "Resx bundle", Format: "crowdin-resx", SourcePatterns: []string{"/master"}, ExportPattern: "translations"},
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

func TestBundleAddRequestMarshalJSON(t *testing.T) {
	tests := []struct {
		name     string
		req      *BundleAddRequest
		expected string
	}{
		{
			name: "omitted optional boolean pointers",
			req: &BundleAddRequest{
				Name:           "Resx bundle",
				Format:         "crowdin-resx",
				SourcePatterns: []string{"/master"},
				ExportPattern:  "translations",
			},
			expected: `{"name":"Resx bundle","format":"crowdin-resx","sourcePatterns":["/master"],"ignorePatterns":null,"exportPattern":"translations"}`,
		},
		{
			name: "specified optional boolean pointers",
			req: &BundleAddRequest{
				Name:                         "Resx bundle",
				Format:                       "crowdin-resx",
				SourcePatterns:               []string{"/master"},
				ExportPattern:                "translations",
				IsMultilingual:               toPtr(true),
				IncludeProjectSourceLanguage: toPtr(false),
				LabelIDs:                     []int{1, 2},
				ExcludeLabelIDs:              []int{3},
			},
			expected: `{"name":"Resx bundle","format":"crowdin-resx","sourcePatterns":["/master"],"ignorePatterns":null,"exportPattern":"translations","isMultilingual":true,"includeProjectSourceLanguage":false,"labelIds":[1,2],"excludeLabelIds":[3]}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			b, err := json.Marshal(tt.req)
			assert.NoError(t, err)
			assert.JSONEq(t, tt.expected, string(b))
		})
	}
}
