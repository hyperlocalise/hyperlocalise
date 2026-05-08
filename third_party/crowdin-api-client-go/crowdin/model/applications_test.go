package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInstallApplicationRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *InstallApplicationRequest
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
			req:  &InstallApplicationRequest{},
			err:  "url is required",
		},
		{
			name:  "valid request",
			req:   &InstallApplicationRequest{URL: "https://example.com/app/install"},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.req.Validate()
			if tt.valid {
				assert.NoError(t, err)
			} else {
				require.EqualError(t, err, tt.err)
			}
		})
	}
}
