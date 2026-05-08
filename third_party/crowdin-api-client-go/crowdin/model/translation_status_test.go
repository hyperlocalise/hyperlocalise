package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestProjectProgressListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *ProjectProgressListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &ProjectProgressListOptions{},
		},
		{
			name: "with all options",
			opts: &ProjectProgressListOptions{LanguageIDs: []string{"uk", "fr"},
				ListOptions: ListOptions{Limit: 10, Offset: 5}},
			out: "languageIds=uk%2Cfr&limit=10&offset=5",
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
				assert.Empty(t, v.Encode())
			}
		})
	}
}

func TestQACheckListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *QACheckListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &QACheckListOptions{},
		},
		{
			name: "with all options",
			opts: &QACheckListOptions{Category: []string{"variables", "tags"},
				Validation:  []string{"spellcheck", "escaped_quotes_check", "multiple_spaces_check"},
				LanguageIDs: []string{"uk", "fr"}},
			out: "category=variables%2Ctags&languageIds=uk%2Cfr&validation=spellcheck%2Cescaped_quotes_check%2Cmultiple_spaces_check",
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
				assert.Empty(t, v.Encode())
			}
		})
	}
}
