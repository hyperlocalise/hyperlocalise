package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestScreenshotListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *ScreenshotListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &ScreenshotListOptions{},
		},
		{
			name: "with all options",
			opts: &ScreenshotListOptions{OrderBy: "createdAt desc,name,tagsCount", StringID: 1, // TODO: StringID is deprecated
				LabelIDs: []string{"1", "2", "3"}, ExcludeLabelIDs: []string{"4", "5", "6"},
				ListOptions: ListOptions{Offset: 1, Limit: 10}},
			out: "excludeLabelIds=4%2C5%2C6&labelIds=1%2C2%2C3&limit=10&offset=1&orderBy=createdAt+desc%2Cname%2CtagsCount&stringId=1",
		},
		{
			name: "with all options",
			opts: &ScreenshotListOptions{OrderBy: "createdAt desc,name,tagsCount", StringIDs: []string{"1", "2", "3"},
				LabelIDs: []string{"1", "2", "3"}, ExcludeLabelIDs: []string{"4", "5", "6"},
				ListOptions: ListOptions{Offset: 1, Limit: 10}},
			out: "excludeLabelIds=4%2C5%2C6&labelIds=1%2C2%2C3&limit=10&offset=1&orderBy=createdAt+desc%2Cname%2CtagsCount&stringIds=1%2C2%2C3",
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

func TestScreenshotListOptionsValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *ScreenshotListOptions
		err   string
		valid bool
	}{
		{
			name: "invalid case - using both stringId and stringIds in the same request",
			req: &ScreenshotListOptions{OrderBy: "createdAt desc,name,tagsCount", StringID: 1, StringIDs: []string{"1", "2", "3"}, // TODO: StringID is deprecated
				LabelIDs: []string{"1", "2", "3"}, ExcludeLabelIDs: []string{"4", "5", "6"},
				ListOptions: ListOptions{Offset: 1, Limit: 10}},
			err: "stringId and stringIds cannot be used in the same request",
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

func TestScreenshotAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *ScreenshotAddRequest
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
			req:  &ScreenshotAddRequest{},
			err:  "storageId is required",
		},
		{
			name: "missing name",
			req:  &ScreenshotAddRequest{StorageID: 1},
			err:  "name is required",
		},
		{
			name: "one of fileId or branchId is required",
			req: &ScreenshotAddRequest{StorageID: 1, Name: "translate_with_siri.jpg", AutoTag: toPtr(true),
				FileID: 1, BranchID: 2},
			err: "must use either branchId, fileId, or directoryId",
		},
		{
			name: "one of branchId or directoryId is required",
			req: &ScreenshotAddRequest{StorageID: 1, Name: "translate_with_siri.jpg", AutoTag: toPtr(true),
				BranchID: 1, DirectoryID: 2},
			err: "must use either branchId, fileId, or directoryId",
		},
		{
			name: "one of directoryId or branchId is required",
			req: &ScreenshotAddRequest{StorageID: 1, Name: "translate_with_siri.jpg", AutoTag: toPtr(true),
				DirectoryID: 1, BranchID: 2},
			err: "must use either branchId, fileId, or directoryId",
		},
		{
			name: "one of branchId, fileId, or directoryId is required",
			req: &ScreenshotAddRequest{StorageID: 1, Name: "translate_with_siri.jpg", AutoTag: toPtr(true),
				DirectoryID: 1, BranchID: 2, FileID: 3},
			err: "must use either branchId, fileId, or directoryId",
		},
		{
			name: "valid request",
			req: &ScreenshotAddRequest{StorageID: 1, Name: "translate_with_siri.jpg", AutoTag: toPtr(true),
				FileID: 1, LabelIDs: []int{1, 2, 3}},
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

func TestScreenshotUpdateRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *ScreenshotUpdateRequest
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
			req:  &ScreenshotUpdateRequest{},
			err:  "storageId is required",
		},
		{
			name: "missing name",
			req:  &ScreenshotUpdateRequest{StorageID: 1},
			err:  "name is required",
		},
		{
			name:  "valid request",
			req:   &ScreenshotUpdateRequest{StorageID: 1, Name: "translate_with_siri.jpg"},
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

func TestTagAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *TagAddRequest
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
			req:  &TagAddRequest{},
			err:  "stringId is required",
		},
		{
			name: "valid request",
			req: &TagAddRequest{StringID: 1,
				Position: &TagPosition{X: toPtr(0), Y: toPtr(10), Width: toPtr(100), Height: toPtr(200)}},
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

func TestReplaceTagsRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   []*ReplaceTagsRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request is required",
		},
		{
			name: "missing stringId",
			req:  []*ReplaceTagsRequest{{StringID: 0}},
			err:  "stringId is required",
		},
		{
			name: "valid request",
			req: []*ReplaceTagsRequest{
				{StringID: 1, Position: &TagPosition{X: toPtr(0), Y: toPtr(10), Width: toPtr(100), Height: toPtr(200)}},
				{StringID: 2},
			},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for _, r := range tt.req {
				if err := r.Validate(); tt.valid {
					assert.NoError(t, err)
				} else {
					assert.EqualError(t, err, tt.err)
				}
			}
		})
	}
}

func TestAutoTagRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *AutoTagRequest
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
			req:  &AutoTagRequest{},
			err:  "autoTag is required",
		},
		{
			name: "one of fileId or directoryId is required",
			req:  &AutoTagRequest{AutoTag: toPtr(true), FileID: 1, DirectoryID: 2},
			err:  "must use either branchId, fileId, or directoryId",
		},
		{
			name: "one of branchId or directoryId is required",
			req:  &AutoTagRequest{AutoTag: toPtr(true), BranchID: 1, DirectoryID: 2},
			err:  "must use either branchId, fileId, or directoryId",
		},
		{
			name: "one of branchId or fileId is required",
			req:  &AutoTagRequest{AutoTag: toPtr(true), BranchID: 1, FileID: 2},
			err:  "must use either branchId, fileId, or directoryId",
		},
		{
			name:  "valid request",
			req:   &AutoTagRequest{AutoTag: toPtr(true), FileID: 1},
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
