package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestBranchesListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opt  *BranchesListOptions
		out  string
	}{
		{
			name: "nil options",
			opt:  nil,
		},
		{
			name: "empty options",
			opt:  &BranchesListOptions{},
		},
		{
			name: "with name",
			opt:  &BranchesListOptions{Name: "test"},
			out:  "name=test",
		},
		{
			name: "with order by",
			opt:  &BranchesListOptions{OrderBy: "createdAt desc,name,priority"},
			out:  "orderBy=createdAt+desc%2Cname%2Cpriority",
		},
		{
			name: "with all options",
			opt:  &BranchesListOptions{Name: "test", OrderBy: "createdAt desc,name,priority"},
			out:  "name=test&orderBy=createdAt+desc%2Cname%2Cpriority",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v, ok := tt.opt.Values()
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

func TestBranchesAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *BranchesAddRequest
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
			req:  &BranchesAddRequest{},
			err:  "name is required",
		},
		{
			name: "missing fields (name)",
			req:  &BranchesAddRequest{Title: "Master branch"},
			err:  "name is required",
		},
		{
			name: "valid request",
			req: &BranchesAddRequest{Name: "master", Title: "Master branch",
				ExportPattern: "%three_letters_code%", Priority: "normal"},
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

func TestBranchesMergeRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *BranchesMergeRequest
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
			req:  &BranchesMergeRequest{},
			err:  "sourceBranchId is required",
		},
		{
			name: "missing fields (sourceBranchId)",
			req:  &BranchesMergeRequest{SourceBranchID: 0},
			err:  "sourceBranchId is required",
		},
		{
			name:  "valid request",
			req:   &BranchesMergeRequest{SourceBranchID: 1, DeleteAfterMerge: toPtr(true), AcceptSourceChanges: toPtr(false), DryRun: toPtr(false)},
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

func TestBranchesCloneRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *BranchesCloneRequest
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
			req:  &BranchesCloneRequest{},
			err:  "name is required",
		},
		{
			name: "missing fields (name)",
			req:  &BranchesCloneRequest{Title: "Master branch"},
			err:  "name is required",
		},
		{
			name:  "valid request",
			req:   &BranchesCloneRequest{Name: "master", Title: "Master branch"},
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
