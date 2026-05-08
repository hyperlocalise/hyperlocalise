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

func TestFieldsService_Get(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/fields/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"name": "Custom field",
				"slug": "custom-field",
				"description": "Custom field description",
				"type": "select",
				"config":{
					"options":[
						{
							"value":"option1",
							"label":"Option 1"
						}
					],
					"locations":[
						{
							"place":"projectCreateModal"
						}
					]
				},
				"entities": [
					"task"
				],
				"createdAt": "2023-09-23T09:04:29+00:00",
				"updatedAt": "2023-09-23T09:04:29+00:00"
			}
		}`)
	})

	field, resp, err := client.Fields.Get(context.Background(), 1)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Field{
		ID:          2,
		Name:        "Custom field",
		Slug:        "custom-field",
		Description: "Custom field description",
		Type:        "select",
		Config: &model.FieldConfig{
			Options: []model.FieldOption{
				{
					Value: "option1",
					Label: "Option 1",
				},
			},
			Locations: []model.FieldLocation{
				{
					Place: model.ProjectCreateModal,
				},
			},
		},
		Entities:  []string{"task"},
		CreatedAt: "2023-09-23T09:04:29+00:00",
		UpdatedAt: "2023-09-23T09:04:29+00:00",
	}
	assert.Equal(t, expected, field)
}

func TestFieldsService_List(t *testing.T) {
	tests := []struct {
		name          string
		opts          *model.FieldsListOptions
		expectedQuery string
	}{
		{
			name:          "nil options",
			opts:          nil,
			expectedQuery: "",
		},
		{
			name:          "empty options",
			opts:          &model.FieldsListOptions{},
			expectedQuery: "",
		},
		{
			name: "with options",
			opts: &model.FieldsListOptions{
				Search:      "custom",
				Entity:      model.EntityProject,
				Type:        model.TypeSelect,
				ListOptions: model.ListOptions{Offset: 1, Limit: 10},
			},
			expectedQuery: "?entity=project&limit=10&offset=1&search=custom&type=select",
		},
	}

	for _, tt := range tests {
		client, mux, teardown := setupClient()
		defer teardown()

		t.Run(tt.name, func(t *testing.T) {
			const path = "/api/v2/fields"
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, "GET")
				testURL(t, r, path+tt.expectedQuery)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 2,
								"name": "Custom field",
								"slug": "custom-field",
								"description": "Custom field description",
								"type": "select",
								"config": {},
								"entities": [
									"task"
								],
								"createdAt": "2023-09-23T09:04:29+00:00",
								"updatedAt": "2023-09-23T09:04:29+00:00"
							}
						}
					],
					"pagination": {
						"offset": 1,
						"limit": 25,
						"total": 25
					}
				}`)
			})

			fields, resp, err := client.Fields.List(context.Background(), tt.opts)
			require.NoError(t, err)

			expected := []*model.Field{
				{
					ID:          2,
					Name:        "Custom field",
					Slug:        "custom-field",
					Description: "Custom field description",
					Type:        "select",
					Config:      &model.FieldConfig{},
					Entities:    []string{"task"},
					CreatedAt:   "2023-09-23T09:04:29+00:00",
					UpdatedAt:   "2023-09-23T09:04:29+00:00",
				},
			}
			assert.Equal(t, expected, fields)

			assert.Equal(t, 1, resp.Pagination.Offset)
			assert.Equal(t, 25, resp.Pagination.Limit)
		})
	}
}

func TestFieldsService_List_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/fields", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Fields.List(context.Background(), nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestFieldsService_Add(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/fields"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "POST")
		testURL(t, r, path)
		testJSONBody(t, r, `{
			"name":"Custom field",
			"slug":"custom-field",
			"description":"Custom field description",
			"type":"select",
			"entities":["task"],
			"config":{
				"options":[
					{
						"value":"option1",
						"label":"Option 1"
					}
				],
				"locations":[
					{
						"place":"projectCreateModal"
					}
				]
			}
		}`)

		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "Custom field",
				"slug": "custom-field",
				"description": "Custom field description",
				"type": "select",
				"config": {},
				"entities": [
					"task"
				],
				"createdAt": "2023-09-23T09:04:29+00:00",
				"updatedAt": "2023-09-23T09:04:29+00:00"
			}
		}`)
	})

	req := &model.FieldAddRequest{
		Name:        "Custom field",
		Slug:        "custom-field",
		Description: "Custom field description",
		Type:        model.TypeSelect,
		Entities:    []model.FieldEntity{model.EntityTask},
		Config: model.FieldConfig{
			Options: []model.FieldOption{
				{
					Value: "option1",
					Label: "Option 1",
				},
			},
			Locations: []model.FieldLocation{
				{
					Place: model.ProjectCreateModal,
				},
			},
		},
	}
	field, resp, err := client.Fields.Add(context.Background(), req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Field{
		ID:          1,
		Name:        "Custom field",
		Slug:        "custom-field",
		Description: "Custom field description",
		Type:        "select",
		Config:      &model.FieldConfig{},
		Entities:    []string{"task"},
		CreatedAt:   "2023-09-23T09:04:29+00:00",
		UpdatedAt:   "2023-09-23T09:04:29+00:00",
	}
	assert.Equal(t, expected, field)
}

func TestFieldsService_Edit(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/fields/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "PATCH")
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/name","value":"Updated field"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "Updated field",
				"slug": "custom-field",
				"description": "Updated field description",
				"type": "select",
				"config": {},
				"entities": [
					"task"
				],
				"createdAt": "2023-09-23T09:04:29+00:00",
				"updatedAt": "2023-09-23T09:04:29+00:00"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/name",
			Value: "Updated field",
		},
	}
	field, resp, err := client.Fields.Edit(context.Background(), 1, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Field{
		ID:          1,
		Name:        "Updated field",
		Slug:        "custom-field",
		Description: "Updated field description",
		Type:        "select",
		Config:      &model.FieldConfig{},
		Entities:    []string{"task"},
		CreatedAt:   "2023-09-23T09:04:29+00:00",
		UpdatedAt:   "2023-09-23T09:04:29+00:00",
	}
	assert.Equal(t, expected, field)
}

func TestFieldsService_Delete(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/fields/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "DELETE")
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Fields.Delete(context.Background(), 1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}
