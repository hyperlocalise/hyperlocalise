package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestFieldsListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opt  *FieldsListOptions
		out  string
	}{
		{
			name: "nil options",
			opt:  nil,
		},
		{
			name: "empty options",
			opt:  &FieldsListOptions{},
		},
		{
			name: "with search",
			opt:  &FieldsListOptions{Search: "test"},
			out:  "search=test",
		},
		{
			name: "with entity",
			opt:  &FieldsListOptions{Entity: EntityProject},
			out:  "entity=project",
		},
		{
			name: "with type",
			opt:  &FieldsListOptions{Type: TypeText},
			out:  "type=text",
		},
		{
			name: "with all options",
			opt:  &FieldsListOptions{Search: "test", Entity: EntityFile, Type: TypeLabels},
			out:  "entity=file&search=test&type=labels",
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

func TestFieldAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *FieldAddRequest
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
			req:  &FieldAddRequest{},
			err:  "name is required",
		},
		{
			name: "missing slug",
			req:  &FieldAddRequest{Name: "Custom field"},
			err:  "slug is required",
		},
		{
			name: "missing type",
			req:  &FieldAddRequest{Name: "Custom field", Slug: "custom-field"},
			err:  "type is required",
		},
		{
			name: "missing entities",
			req:  &FieldAddRequest{Name: "Custom field", Slug: "custom-field", Type: TypeSelect},
			err:  "entities is required",
		},
		{
			name: "valid request",
			req: &FieldAddRequest{Name: "Custom field", Slug: "custom-field", Type: TypeSelect,
				Entities: []FieldEntity{EntityTask}, Description: "Custom field description", Config: FieldConfig{}},
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
