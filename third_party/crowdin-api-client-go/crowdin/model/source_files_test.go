package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestDirectoryListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *DirectoryListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &DirectoryListOptions{},
		},
		{
			name: "with all options",
			opts: &DirectoryListOptions{OrderBy: "createdAt desc,name,priority", BranchID: 1, DirectoryID: 2,
				Filter: "filter", ListOptions: ListOptions{Offset: 1, Limit: 10}},
			out: "branchId=1&directoryId=2&filter=filter&limit=10&offset=1&orderBy=createdAt+desc%2Cname%2Cpriority",
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

func TestDirectoryAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *DirectoryAddRequest
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
			req:  &DirectoryAddRequest{},
			err:  "name is required"},
		{
			name: "one of branchId or directoryId is required",
			req:  &DirectoryAddRequest{Name: "main", BranchID: 1, DirectoryID: 2},
			err:  "branchId and directoryId cannot be used in the same request",
		},
		{
			name:  "valid request",
			req:   &DirectoryAddRequest{Name: "main", BranchID: 1, Title: "Main", Priority: "low"},
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

func TestFileListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *FileListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &FileListOptions{},
		},
		{
			name: "with all options",
			opts: &FileListOptions{OrderBy: "createdAt desc,name,priority", BranchID: 1, DirectoryID: 2,
				Filter: "filter", ListOptions: ListOptions{Offset: 1, Limit: 10}},
			out: "branchId=1&directoryId=2&filter=filter&limit=10&offset=1&orderBy=createdAt+desc%2Cname%2Cpriority",
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

func TestFileAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *FileAddRequest
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
			req:  &FileAddRequest{},
			err:  "storageId is required",
		},
		{
			name: "missing name",
			req:  &FileAddRequest{StorageID: 1},
			err:  "name is required",
		},
		{
			name: "one of branchId or directoryId is required",
			req:  &FileAddRequest{StorageID: 1, Name: "main", BranchID: 1, DirectoryID: 2},
			err:  "branchId and directoryId cannot be used in the same request",
		},
		{
			name: "valid request",
			req: &FileAddRequest{
				StorageID: 1,
				Name:      "main",
				BranchID:  1,
				Title:     "Main",
				Type:      "xml",
				Fields: map[string]any{
					"key_1": "value",
					"key_2": 2,
					"key_3": false,
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

func TestFileUpdateRestoreRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *FileUpdateRestoreRequest
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
			req:  &FileUpdateRestoreRequest{StorageID: 1, RevisionID: 1},
			err:  "use only one of revisionId or storageId",
		},
		{
			name: "revisionId or storageId is required",
			req:  &FileUpdateRestoreRequest{Name: "main"},
			err:  "one of revisionId or storageId is required",
		},
		{
			name:  "valid request",
			req:   &FileUpdateRestoreRequest{StorageID: 1, Name: "main"},
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

func TestReviewedBuildListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *ReviewedBuildListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &ReviewedBuildListOptions{},
		},
		{
			name: "with all options",
			opts: &ReviewedBuildListOptions{BranchID: 1},
			out:  "branchId=1",
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

func TestReviewedBuildRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *ReviewedBuildRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name:  "empty request",
			req:   &ReviewedBuildRequest{},
			valid: true,
		},
		{
			name:  "valid request",
			req:   &ReviewedBuildRequest{BranchID: 1},
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
