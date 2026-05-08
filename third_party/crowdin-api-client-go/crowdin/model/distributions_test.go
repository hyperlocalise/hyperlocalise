package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDistributionAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *DistributionAddRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name: "empty name",
			req:  &DistributionAddRequest{},
			err:  "name is required",
		},
		{
			name: "empty bundleIds",
			req: &DistributionAddRequest{
				Name:       "Export Bundle",
				ExportMode: ExportModeBundle,
				FileIDs:    []int{24, 25, 38},
			},
			err: "bundleIds is required for bundle export mode",
		},
		{
			name: "empty fileIds",
			req: &DistributionAddRequest{
				Name:       "Export Bundle",
				ExportMode: ExportModeDefault,
			},
			err: "fileIds is required for default export mode",
		},
		{
			name: "valid request",
			req: &DistributionAddRequest{
				Name:       "Export Bundle",
				ExportMode: ExportModeBundle,
				BundleIDs:  []int{45, 62},
				FileIDs:    []int{24, 25, 38},
			},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				require.NoError(t, err)
			} else {
				require.EqualError(t, err, tt.err)
			}
		})
	}
}
