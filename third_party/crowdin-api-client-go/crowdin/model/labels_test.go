package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestLabelsListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *LabelsListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &LabelsListOptions{},
		},
		{
			name: "with options",
			opts: &LabelsListOptions{
				OrderBy: "title desc,id",
				ListOptions: ListOptions{
					Limit:  10,
					Offset: 5,
				},
			},
			out: "limit=10&offset=5&orderBy=title+desc%2Cid",
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

func TestLabelAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *LabelAddRequest
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
			req:  &LabelAddRequest{},
			err:  "title is required",
		},
		{
			name:  "valid request",
			req:   &LabelAddRequest{Title: "label"},
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

func TestAssignToStringsRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *AssignToStringsRequest
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
			req:  &AssignToStringsRequest{},
			err:  "stringIds cannot be empty",
		},
		{
			name: "missing string IDs",
			req:  &AssignToStringsRequest{StringIDs: []int{}},
			err:  "stringIds cannot be empty",
		},
		{
			name:  "valid request",
			req:   &AssignToStringsRequest{StringIDs: []int{1, 2, 3}},
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

func TestAssignToScreenshotsRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *AssignToScreenshotsRequest
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
			req:  &AssignToScreenshotsRequest{},
			err:  "screenshotIds cannot be empty",
		},
		{
			name: "missing screenshot IDs",
			req:  &AssignToScreenshotsRequest{ScreenshotIDs: []int{}},
			err:  "screenshotIds cannot be empty",
		},
		{
			name:  "valid request",
			req:   &AssignToScreenshotsRequest{ScreenshotIDs: []int{1, 2, 3}},
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
