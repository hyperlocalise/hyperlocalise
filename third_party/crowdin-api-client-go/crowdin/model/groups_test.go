package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGroupsListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *GroupsListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &GroupsListOptions{},
		},
		{
			name: "with parent ID",
			opts: &GroupsListOptions{ParentID: 123},
			out:  "parentId=123",
		},
		{
			name: "with list options",
			opts: &GroupsListOptions{ListOptions: ListOptions{Limit: 10, Offset: 5}},
			out:  "limit=10&offset=5",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			val, ok := tt.opts.Values()
			if len(tt.out) > 0 {
				assert.True(t, ok)
				assert.Equal(t, tt.out, val.Encode())
			} else {
				assert.False(t, ok)
				assert.Empty(t, val)
			}
		})
	}
}

func TestGroupsAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *GroupsAddRequest
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
			req:  &GroupsAddRequest{},
			err:  "name is required",
		},
		{
			name:  "valid request",
			req:   &GroupsAddRequest{Name: "Group", ParentID: 1, Description: "Description"},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.Error(t, err)
				assert.EqualError(t, err, err.Error())
			}
		})
	}
}
