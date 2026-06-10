package model

import (
	"encoding/json"
	"strconv"
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

func TestPaginationUnmarshaling(t *testing.T) {
	tests := []struct {
		name   string
		offset int
	}{
		{
			name:   "first page",
			offset: 0,
		},
		{
			name:   "later page",
			offset: 10,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonResp := `{
				"data": [
					{
						"data": {
							"id": 1,
							"projectId": 2,
							"title": "label1"
						}
					}
				],
				"pagination": {
					"offset": ` + strconv.Itoa(tt.offset) + `,
					"limit": 25
				}
			}`

			var resp LabelsListResponse
			err := json.Unmarshal([]byte(jsonResp), &resp)
			assert.NoError(t, err)

			assert.NotNil(t, resp.Pagination)
			assert.Equal(t, tt.offset, resp.Pagination.Offset)
			assert.Equal(t, 25, resp.Pagination.Limit)
		})
	}
}
