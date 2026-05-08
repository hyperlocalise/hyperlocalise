package model

import (
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
