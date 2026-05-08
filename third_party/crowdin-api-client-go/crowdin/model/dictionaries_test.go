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
