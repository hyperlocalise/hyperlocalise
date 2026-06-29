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
			name: "empty content in default mode",
			req: &DistributionAddRequest{
				Name:       "Export Bundle",
				ExportMode: ExportModeDefault,
			},
			err: "one of fileIds, branchIds or directoryIds is required for default export mode",
		},
		{
			name: "valid request in default mode with branchIds",
			req: &DistributionAddRequest{
				Name:       "Export Bundle",
				ExportMode: ExportModeDefault,
				BranchIDs:  []int{1, 2},
			},
			valid: true,
		},
		{
			name: "valid request in default mode with directoryIds",
			req: &DistributionAddRequest{
				Name:         "Export Bundle",
				ExportMode:   ExportModeDefault,
				DirectoryIDs: []int{3, 4},
			},
			valid: true,
		},
		{
			name: "valid request in bundle mode",
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
