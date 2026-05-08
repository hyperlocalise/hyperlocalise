package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *ListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &ListOptions{},
		},
		{
			name: "with limit",
			opts: &ListOptions{Limit: 10},
			out:  "limit=10",
		},
		{
			name: "with offset",
			opts: &ListOptions{Offset: 5},
			out:  "offset=5",
		},
		{
			name: "with all options",
			opts: &ListOptions{Limit: 10, Offset: 5},
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
