package model

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestManagerListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *ManagerListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &ManagerListOptions{},
		},
		{
			name: "with teams ID",
			opts: &ManagerListOptions{TeamIDs: []int{1, 2, 3}},
			out:  "teamIds=1%2C2%2C3",
		},
		{
			name: "with ordeby ID",
			opts: &ManagerListOptions{TeamIDs: []int{1, 2, 3}, OrderBy: "asc"},
			out:  "orderBy=asc&teamIds=1%2C2%2C3",
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

func TestManagerResponseUnmarshaling(t *testing.T) {
	jsonResp := `{
		"data": [
			{
				"data": {
					"id": 1,
					"user": {
						"id": 10,
						"username": "john_doe"
					}
				}
			}
		],
		"pagination": {
			"offset": 0,
			"limit": 25
		}
	}`

	var resp ManagerResponse
	err := json.Unmarshal([]byte(jsonResp), &resp)
	assert.NoError(t, err)
	assert.NotNil(t, resp.Pagination)
	assert.Equal(t, 0, resp.Pagination.Offset)
	assert.Equal(t, 25, resp.Pagination.Limit)
}
