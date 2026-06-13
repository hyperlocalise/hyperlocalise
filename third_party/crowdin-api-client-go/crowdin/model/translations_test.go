package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

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
			name: "missing storageId",
			req:  &UploadTranslationsRequest{FileID: 1},
			err:  "storageId is required",
		},
		{
			name: "multi-set identifiers: file and branch",
			req:  &UploadTranslationsRequest{StorageID: 1, FileID: 1, BranchID: 1},
			err:  "fileId and branchId can not be used at the same request",
		},
		{
			name: "multi-set identifiers: file and directory",
			req:  &UploadTranslationsRequest{StorageID: 1, FileID: 1, DirectoryID: 1},
			err:  "fileId and directoryId can not be used at the same request",
		},
		{
			name:  "valid request with fileId",
			req:   &UploadTranslationsRequest{StorageID: 1, FileID: 1},
			valid: true,
		},
		{
			name:  "valid request with branchId",
			req:   &UploadTranslationsRequest{StorageID: 1, BranchID: 1},
			valid: true,
		},
		{
			name:  "valid request with directoryId",
			req:   &UploadTranslationsRequest{StorageID: 1, DirectoryID: 1},
			valid: true,
		},
		{
			name:  "valid request with branch and directory",
			req:   &UploadTranslationsRequest{StorageID: 1, BranchID: 1, DirectoryID: 1},
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
