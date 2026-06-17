package model

import (
	"encoding/json"
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
			opts: &ProjectProgressListOptions{
				LanguageIDs: []string{"uk", "fr"},
				ListOptions: ListOptions{Limit: 10, Offset: 5},
			},
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

func TestTranslationProgressResponseUnmarshaling(t *testing.T) {
	jsonResp := `{
		"data": [
			{
				"data": {
					"words": {"total": 100},
					"phrases": {"total": 10},
					"translationProgress": 50,
					"approvalProgress": 20
				}
			}
		],
		"pagination": {
			"offset": 0,
			"limit": 25
		}
	}`

	var resp TranslationProgressResponse
	err := json.Unmarshal([]byte(jsonResp), &resp)
	assert.NoError(t, err)
	assert.NotNil(t, resp.Pagination)
	assert.Equal(t, 0, resp.Pagination.Offset)
	assert.Equal(t, 25, resp.Pagination.Limit)
}

func TestQAChecksResponseUnmarshaling(t *testing.T) {
	jsonResp := `{
		"data": [
			{
				"data": {
					"stringId": 1,
					"languageId": "uk",
					"category": "variables"
				}
			}
		],
		"pagination": {
			"offset": 10,
			"limit": 50
		}
	}`

	var resp QAChecksResponse
	err := json.Unmarshal([]byte(jsonResp), &resp)
	assert.NoError(t, err)
	assert.NotNil(t, resp.Pagination)
	assert.Equal(t, 10, resp.Pagination.Offset)
	assert.Equal(t, 50, resp.Pagination.Limit)
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
			opts: &QACheckListOptions{
				Category:    []string{"variables", "tags"},
				Validation:  []string{"spellcheck", "escaped_quotes_check", "multiple_spaces_check"},
				LanguageIDs: []string{"uk", "fr"},
			},
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
