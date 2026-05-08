package crowdin

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDictionariesService_List(t *testing.T) {
	tests := []struct {
		name          string
		opts          *model.DictionariesListOptions
		expectedQuery string
	}{
		{
			name:          "nil options",
			opts:          nil,
			expectedQuery: "",
		},
		{
			name:          "empty options",
			opts:          &model.DictionariesListOptions{},
			expectedQuery: "",
		},
		{
			name:          "with options",
			opts:          &model.DictionariesListOptions{LanguageIDs: []string{"en", "uk"}},
			expectedQuery: "?languageIds=en%2Cuk",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for projectID, tt := range tests {
		path := fmt.Sprintf("/api/v2/projects/%d/dictionaries", projectID)
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, http.MethodGet)
			testURL(t, r, path+tt.expectedQuery)

			fmt.Fprint(w, `{
				"data": [
					{
						"data": {
							"languageId": "en",
							"words": [
								"string"
							]
						}
					},
					{
						"data": {
							"languageId": "uk",
							"words": [
								"string"
							]
						}
					}
				],
				"pagination": {
					"offset": 1,
					"limit": 25
				}
			}`)
		})

		dict, resp, err := client.Dictionaries.List(context.Background(), projectID, tt.opts)
		require.NoError(t, err)

		expected := []*model.Dictionary{
			{
				LanguageID: "en",
				Words:      []string{"string"},
			},
			{
				LanguageID: "uk",
				Words:      []string{"string"},
			},
		}
		assert.Equal(t, expected, dict)

		assert.Equal(t, 1, resp.Pagination.Offset)
		assert.Equal(t, 25, resp.Pagination.Limit)
	}
}

func TestDictionariesService_List_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/dictionaries", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Dictionaries.List(context.Background(), 2, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestDictionariesService_Edit(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/dictionaries/en"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"add","path":"/words/0","value":"string"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"languageId": "en",
				"words": [
					"string"
				]
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "add",
			Path:  "/words/0",
			Value: "string",
		},
	}
	dict, resp, err := client.Dictionaries.Edit(context.Background(), 2, "en", req)
	require.NoError(t, err)

	assert.NotNil(t, resp)
	assert.Equal(t, "en", dict.LanguageID)
	assert.Equal(t, []string{"string"}, dict.Words)
}
