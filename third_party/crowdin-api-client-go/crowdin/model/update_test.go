package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestUpdateRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *UpdateRequest
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
			req:  &UpdateRequest{},
			err:  "invalid op: \"\", must be one of add, replace, remove, test",
		},
		{
			name: "invalid op",
			req:  &UpdateRequest{Op: "demo"},
			err:  "invalid op: \"demo\", must be one of add, replace, remove, test",
		},
		{
			name: "missing path",
			req:  &UpdateRequest{Op: OpAdd},
			err:  "path is required",
		},
		{
			name: "missing value",
			req:  &UpdateRequest{Op: OpAdd, Path: "/path"},
			err:  "value is required",
		},
		{
			name:  "valid add operation",
			req:   &UpdateRequest{Op: OpAdd, Path: "/path", Value: "value"},
			valid: true,
		},
		{
			name:  "valid replace operation",
			req:   &UpdateRequest{Op: OpReplace, Path: "/path", Value: map[string]string{"key": "value"}},
			valid: true,
		},
		{
			name:  "valid remove operation",
			req:   &UpdateRequest{Op: OpRemove, Path: "/path"},
			valid: true,
		},
		{
			name:  "valid test operation",
			req:   &UpdateRequest{Op: OpTest, Path: "/path", Value: "test"},
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
