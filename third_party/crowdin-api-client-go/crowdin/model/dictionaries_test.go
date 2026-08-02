package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestDictionariesListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *DictionariesListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &DictionariesListOptions{},
		},
		{
			name: "with language IDs",
			opts: &DictionariesListOptions{LanguageIDs: []string{"en", "fr"}},
			out:  "languageIds=en%2Cfr",
		},
		{
			name: "with limit and offset",
			opts: &DictionariesListOptions{
				ListOptions: ListOptions{Limit: 10, Offset: 20},
			},
			out:  "limit=10&offset=20",
		},
		{
			name: "with language IDs, limit and offset",
			opts: &DictionariesListOptions{
				LanguageIDs: []string{"en", "fr"},
				ListOptions: ListOptions{Limit: 10, Offset: 20},
			},
			out:  "languageIds=en%2Cfr&limit=10&offset=20",
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
