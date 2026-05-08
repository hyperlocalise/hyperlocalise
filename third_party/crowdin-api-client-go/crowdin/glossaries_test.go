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

func TestGlossariesService_GetConcept(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		glossaryID = 1
		conceptID  = 2

		path = fmt.Sprintf("/api/v2/glossaries/%d/concepts/%d", glossaryID, conceptID)
	)

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"userId": 6,
				"glossaryId": 6,
				"subject": "general",
				"definition": "Some definition",
				"translatable": true,
				"note": "Any kind of note, such as a usage note, explanation, or instruction",
				"url": "www.example.com",
				"figure": "www.example.com/image.png",
				"languagesDetails": [
					{
						"languageId": "en",
						"userId": 12,
						"definition": "Some definition",
						"note": "Some note",
						"createdAt": "2023-09-19T14:14:00+00:00",
						"updatedAt": "2023-09-19T14:14:00+00:00"
					}
				],
				"createdAt": "2023-09-23T07:19:47+00:00",
				"updatedAt": "2023-09-23T07:19:47+00:00"
			}
		}`)
	})

	concept, resp, err := client.Glossaries.GetConcept(context.Background(), glossaryID, conceptID)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Concept{
		ID:           2,
		UserID:       6,
		GlossaryID:   6,
		Subject:      "general",
		Definition:   "Some definition",
		Translatable: true,
		Note:         "Any kind of note, such as a usage note, explanation, or instruction",
		URL:          "www.example.com",
		Figure:       "www.example.com/image.png",
		LanguagesDetails: []*model.ConceptLanguagesDetails{
			{
				LanguageID: "en",
				UserID:     12,
				Definition: "Some definition",
				Note:       "Some note",
				CreatedAt:  "2023-09-19T14:14:00+00:00",
				UpdatedAt:  "2023-09-19T14:14:00+00:00",
			},
		},
		CreatedAt: "2023-09-23T07:19:47+00:00",
		UpdatedAt: "2023-09-23T07:19:47+00:00",
	}
	assert.Equal(t, expected, concept)
}

func TestGlossariesService_ListConcepts(t *testing.T) {
	tests := []struct {
		name          string
		opts          *model.ConceptsListOptions
		expectedQuery string
	}{
		{
			name:          "nil options",
			opts:          nil,
			expectedQuery: "",
		},
		{
			name:          "empty options",
			opts:          &model.ConceptsListOptions{},
			expectedQuery: "",
		},
		{
			name: "all options",
			opts: &model.ConceptsListOptions{
				OrderBy:     "createdAt desc,name",
				ListOptions: model.ListOptions{Offset: 10, Limit: 25},
			},
			expectedQuery: "?limit=25&offset=10&orderBy=createdAt+desc%2Cname",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for glossaryID, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/glossaries/%d/concepts", glossaryID)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodGet)
				testURL(t, r, path+tt.expectedQuery)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 2
							}
						},
						{
							"data": {
								"id": 4
							}
						}
					],
					"pagination": {
						"offset": 10,
						"limit": 25
					}
				}`)
			})

			concepts, resp, err := client.Glossaries.ListConcepts(context.Background(), glossaryID, tt.opts)
			require.NoError(t, err)

			expected := []*model.Concept{{ID: 2}, {ID: 4}}
			assert.Len(t, concepts, 2)
			assert.Equal(t, expected, concepts)

			assert.Equal(t, 10, resp.Pagination.Offset)
			assert.Equal(t, 25, resp.Pagination.Limit)
		})
	}
}

func TestGlossariesService_ListConcepts_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/glossaries/1/concepts", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Glossaries.ListConcepts(context.Background(), 2, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestGlossariesService_UpdateConcept(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		glossaryID = 1
		conceptID  = 2

		path = fmt.Sprintf("/api/v2/glossaries/%d/concepts/%d", glossaryID, conceptID)
	)

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPut)
		testURL(t, r, path)
		testJSONBody(t, r, `{
			"subject": "general",
			"definition": "This is a sample definition.",
			"translatable": true,
			"note": "Any concept-level note information",
			"url": "www.example.com",
			"figure": "www.example.com/image.png",
			"languagesDetails": [
			  	{
					"languageId": "en",
					"definition": "This is a sample definition.",
					"note": "Any kind of note, such as a usage note, explanation, or instruction."
			  	}
			]
		}`)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"userId": 6,
				"glossaryId": 6,
				"subject": "general",
				"definition": "Some definition",
				"translatable": true,
				"note": "Any kind of note, such as a usage note, explanation, or instruction",
				"url": "www.example.com",
				"figure": "www.example.com/image.png",
				"languagesDetails": [
						{
							"languageId": "en",
							"userId": 12,
							"definition": "Some definition",
							"note": "Some note",
							"createdAt": "2023-09-19T14:14:00+00:00",
							"updatedAt": "2023-09-19T14:14:00+00:00"
						}
				],
				"createdAt": "2023-09-23T07:19:47+00:00",
				"updatedAt": "2023-09-23T07:19:47+00:00"
			}
		}`)
	})

	req := &model.ConceptUpdateRequest{
		Subject:      "general",
		Definition:   "This is a sample definition.",
		Translatable: ToPtr(true),
		Note:         "Any concept-level note information",
		URL:          "www.example.com",
		Figure:       "www.example.com/image.png",
		LanguagesDetails: []*model.LanguagesDetails{
			{
				LanguageID: "en",
				Definition: "This is a sample definition.",
				Note:       "Any kind of note, such as a usage note, explanation, or instruction.",
			},
		},
	}
	concept, resp, err := client.Glossaries.UpdateConcept(context.Background(), glossaryID, conceptID, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Concept{
		ID:           2,
		UserID:       6,
		GlossaryID:   6,
		Subject:      "general",
		Definition:   "Some definition",
		Translatable: true,
		Note:         "Any kind of note, such as a usage note, explanation, or instruction",
		URL:          "www.example.com",
		Figure:       "www.example.com/image.png",
		LanguagesDetails: []*model.ConceptLanguagesDetails{
			{
				LanguageID: "en",
				UserID:     12,
				Definition: "Some definition",
				Note:       "Some note",
				CreatedAt:  "2023-09-19T14:14:00+00:00",
				UpdatedAt:  "2023-09-19T14:14:00+00:00",
			},
		},
		CreatedAt: "2023-09-23T07:19:47+00:00",
		UpdatedAt: "2023-09-23T07:19:47+00:00",
	}
	assert.Equal(t, expected, concept)
}

func TestGlossariesService_DeleteConcept(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		glossaryID = 1
		conceptID  = 2

		path = fmt.Sprintf("/api/v2/glossaries/%d/concepts/%d", glossaryID, conceptID)
	)

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Glossaries.DeleteConcept(context.Background(), glossaryID, conceptID)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestGlossariesService_GetGlossary(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	glossaryID := 1
	path := fmt.Sprintf("/api/v2/glossaries/%d", glossaryID)

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"name": "Be My Eyes iOS's Glossary",
				"groupId": 2,
				"userId": 2,
				"terms": 25,
				"languageId": "fr",
				"languageIds": ["ro"],
				"defaultProjectIds": [2],
				"projectIds": [6],
				"webUrl": "https://example.crowdin.com/u/glossaries/1",
				"createdAt": "2023-09-16T13:42:04+00:00"
			}
		}`)
	})

	glossary, resp, err := client.Glossaries.GetGlossary(context.Background(), glossaryID)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Glossary{
		ID:                2,
		Name:              "Be My Eyes iOS's Glossary",
		GroupID:           2,
		UserID:            2,
		Terms:             25,
		LanguageID:        "fr",
		LanguageIDs:       []string{"ro"},
		DefaultProjectIDs: []int{2},
		ProjectIDs:        []int{6},
		WebURL:            "https://example.crowdin.com/u/glossaries/1",
		CreatedAt:         "2023-09-16T13:42:04+00:00",
	}
	assert.Equal(t, expected, glossary)
}

func TestGlossariesService_ListGlossaries(t *testing.T) {
	tests := []struct {
		name          string
		opts          *model.GlossariesListOptions
		expectedQuery string
	}{
		{
			name:          "nil options",
			opts:          nil,
			expectedQuery: "",
		},
		{
			name:          "empty options",
			opts:          &model.GlossariesListOptions{},
			expectedQuery: "",
		},
		{
			name: "groupId = 0",
			opts: &model.GlossariesListOptions{
				GroupID: ToPtr(0),
			},
			expectedQuery: "?groupId=0",
		},
		{
			name: "all options",
			opts: &model.GlossariesListOptions{
				OrderBy:     "createdAt desc,name",
				GroupID:     ToPtr(1),
				ListOptions: model.ListOptions{Offset: 10, Limit: 25},
			},
			expectedQuery: "?groupId=1&limit=25&offset=10&orderBy=createdAt+desc%2Cname",
		},
	}

	for _, tt := range tests {
		client, mux, teardown := setupClient()
		defer teardown()

		t.Run(tt.name, func(t *testing.T) {
			path := "/api/v2/glossaries"
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodGet)
				testURL(t, r, path+tt.expectedQuery)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 1,
								"name": "Glossary 1"
							}
						},
						{
							"data": {
								"id": 2,
								"name": "Glossary 2"
							}
						}
					],
					"pagination": {
						"offset": 10,
						"limit": 25
					}
				}`)
			})

			glossaries, resp, err := client.Glossaries.ListGlossaries(context.Background(), tt.opts)
			require.NoError(t, err)

			expected := []*model.Glossary{{ID: 1, Name: "Glossary 1"}, {ID: 2, Name: "Glossary 2"}}
			assert.Len(t, glossaries, 2)
			assert.Equal(t, expected, glossaries)

			assert.Equal(t, 10, resp.Pagination.Offset)
			assert.Equal(t, 25, resp.Pagination.Limit)
		})
	}
}

func TestGlossariesService_ListGlossaries_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/glossaries", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Glossaries.ListGlossaries(context.Background(), nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestGlossariesService_DeleteGlossary(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	glossaryID := 1
	path := fmt.Sprintf("/api/v2/glossaries/%d", glossaryID)

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Glossaries.DeleteGlossary(context.Background(), glossaryID)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestGlossariesService_AddGlossary(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/glossaries"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"name":"Be My Eyes iOS's Glossary","languageId":"fr","groupId":0}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"name": "Be My Eyes iOS's Glossary",
				"groupId": 2,
				"userId": 2,
				"terms": 25,
				"languageId": "fr",
				"languageIds": ["ro"],
				"defaultProjectIds": [2],
				"projectIds": [6],
				"webUrl": "https://example.crowdin.com/u/glossaries/1",
				"createdAt": "2023-09-16T13:42:04+00:00"
			}
		}`)
	})

	req := &model.GlossaryAddRequest{
		Name:       "Be My Eyes iOS's Glossary",
		LanguageID: "fr",
		GroupID:    ToPtr(0),
	}
	glossary, resp, err := client.Glossaries.AddGlossary(context.Background(), req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Glossary{
		ID:                2,
		Name:              "Be My Eyes iOS's Glossary",
		GroupID:           2,
		UserID:            2,
		Terms:             25,
		LanguageID:        "fr",
		LanguageIDs:       []string{"ro"},
		DefaultProjectIDs: []int{2},
		ProjectIDs:        []int{6},
		WebURL:            "https://example.crowdin.com/u/glossaries/1",
		CreatedAt:         "2023-09-16T13:42:04+00:00",
	}
	assert.Equal(t, expected, glossary)
}

func TestGlossariesService_EditGlossary(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/glossaries/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/name","value":"Updated Glossary"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"name": "Updated Glossary",
				"groupId": 2,
				"userId": 2,
				"terms": 25,
				"languageId": "fr",
				"languageIds": ["ro"],
				"defaultProjectIds": [2],
				"projectIds": [6],
				"webUrl": "https://example.crowdin.com/u/glossaries/1",
				"createdAt": "2023-09-16T13:42:04+00:00"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/name",
			Value: "Updated Glossary",
		},
	}
	glossary, resp, err := client.Glossaries.EditGlossary(context.Background(), 1, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Glossary{
		ID:                2,
		Name:              "Updated Glossary",
		GroupID:           2,
		UserID:            2,
		Terms:             25,
		LanguageID:        "fr",
		LanguageIDs:       []string{"ro"},
		DefaultProjectIDs: []int{2},
		ProjectIDs:        []int{6},
		WebURL:            "https://example.crowdin.com/u/glossaries/1",
		CreatedAt:         "2023-09-16T13:42:04+00:00",
	}
	assert.Equal(t, expected, glossary)
}

func TestGlossariesService_ExportGlossary(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/glossaries/1/exports"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"format":"csv","exportFields":["term","definition","partOfSpeech"]}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"identifier": "5ed2ce93-6d47-4402-9e66-516ca835cb20",
				"status": "created",
				"progress": 0,
				"attributes": {
					"format": "csv",
					"exportFields": [
						"term",
						"description",
						"partOfSpeech"
					]
				},
				"createdAt": "2023-09-23T07:06:43+00:00",
				"updatedAt": "2023-09-23T07:06:43+00:00",
				"startedAt": "2023-08-24T14:15:22Z",
				"finishedAt": "2023-08-24T14:15:22Z"
			}
		}`)
	})

	exportReq := &model.GlossaryExportRequest{
		Format:       "csv",
		ExportFields: []string{"term", "definition", "partOfSpeech"},
	}
	exportData, resp, err := client.Glossaries.ExportGlossary(context.Background(), 1, exportReq)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.GlossaryExport{
		Identifier: "5ed2ce93-6d47-4402-9e66-516ca835cb20",
		Status:     "created",
		Progress:   0,
		Attributes: struct {
			Format       string   `json:"format"`
			ExportFields []string `json:"exportFields"`
		}{
			Format:       "csv",
			ExportFields: []string{"term", "description", "partOfSpeech"},
		},
		CreatedAt:  "2023-09-23T07:06:43+00:00",
		UpdatedAt:  "2023-09-23T07:06:43+00:00",
		StartedAt:  "2023-08-24T14:15:22Z",
		FinishedAt: "2023-08-24T14:15:22Z",
	}
	assert.Equal(t, expected, exportData)
}

func TestGlossariesService_CheckGlossaryExportStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		glossaryID = 1
		exportID   = "5ed2ce93-6d47-4402-9e66-516ca835cb20"

		path = fmt.Sprintf("/api/v2/glossaries/%d/exports/%s", glossaryID, exportID)
	)

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"identifier": "5ed2ce93-6d47-4402-9e66-516ca835cb20",
				"status": "created",
				"progress": 0,
				"attributes": {
					"format": "csv",
					"exportFields": [
						"term",
						"description",
						"partOfSpeech"
					]
				},
				"createdAt": "2023-09-23T07:06:43+00:00",
				"updatedAt": "2023-09-23T07:06:43+00:00",
				"startedAt": "2023-08-24T14:15:22Z",
				"finishedAt": "2023-08-24T14:15:22Z"
			}
		}`)
	})

	export, resp, err := client.Glossaries.CheckGlossaryExportStatus(context.Background(), glossaryID, exportID)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.GlossaryExport{
		Identifier: "5ed2ce93-6d47-4402-9e66-516ca835cb20",
		Status:     "created",
		Progress:   0,
		Attributes: struct {
			Format       string   `json:"format"`
			ExportFields []string `json:"exportFields"`
		}{
			Format:       "csv",
			ExportFields: []string{"term", "description", "partOfSpeech"},
		},
		CreatedAt:  "2023-09-23T07:06:43+00:00",
		UpdatedAt:  "2023-09-23T07:06:43+00:00",
		StartedAt:  "2023-08-24T14:15:22Z",
		FinishedAt: "2023-08-24T14:15:22Z",
	}
	assert.Equal(t, expected, export)
}

func TestGlossariesService_DownloadGlossary(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		glossaryID = 1
		exportID   = "5ed2ce93-6d47-4402-9e66-516ca835cb20"

		path = fmt.Sprintf("/api/v2/glossaries/%d/exports/%s/download", glossaryID, exportID)
	)

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"url": "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff",
				"expireIn": "2023-09-20T10:31:21+00:00"
			}
		}`)
	})

	downloadLink, resp, err := client.Glossaries.DownloadGlossary(context.Background(), glossaryID, exportID)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.DownloadLink{
		URL:      "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff",
		ExpireIn: "2023-09-20T10:31:21+00:00",
	}
	assert.Equal(t, expected, downloadLink)
}

func TestGlossariesService_ImportGlossary(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/glossaries/1/imports"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"storageId":36,"scheme":{"description_en":1,"term_en":0},"firstLineContainsHeader":false}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"identifier": "c050fba2-200e-4ce1-8de4-f7ba8eb58732",
				"status": "created",
				"progress": 0,
				"attributes": {
					"storageId": 36,
					"scheme": {
						"term_en": 0,
						"description_en": 1
					},
					"firstLineContainsHeader": false
				},
				"createdAt": "2023-09-23T12:17:54+00:00",
				"updatedAt": "2023-09-23T12:17:54+00:00",
				"startedAt": "2023-08-24T14:15:22Z",
				"finishedAt": "2023-08-24T14:15:22Z"
			}
		}`)
	})

	req := &model.GlossaryImportRequest{
		StorageID: 36,
		Scheme: map[string]int{
			"term_en":        0,
			"description_en": 1,
		},
		FirstLineContainsHeader: ToPtr(false),
	}
	glossaryImport, resp, err := client.Glossaries.ImportGlossary(context.Background(), 1, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.GlossaryImport{
		Identifier: "c050fba2-200e-4ce1-8de4-f7ba8eb58732",
		Status:     "created",
		Progress:   0,
		Attributes: struct {
			StorageID               int            `json:"storageId"`
			Scheme                  map[string]int `json:"scheme"`
			FirstLineContainsHeader bool           `json:"firstLineContainsHeader"`
		}{
			StorageID: 36,
			Scheme: map[string]int{
				"term_en":        0,
				"description_en": 1,
			},
			FirstLineContainsHeader: false,
		},
		CreatedAt:  "2023-09-23T12:17:54+00:00",
		UpdatedAt:  "2023-09-23T12:17:54+00:00",
		StartedAt:  "2023-08-24T14:15:22Z",
		FinishedAt: "2023-08-24T14:15:22Z",
	}
	assert.Equal(t, expected, glossaryImport)
}

func TestGlossariesService_CheckGlossaryImportStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		glossaryID = 1
		importID   = 2

		path = fmt.Sprintf("/api/v2/glossaries/%d/imports/%d", glossaryID, importID)
	)

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"identifier": "c050fba2-200e-4ce1-8de4-f7ba8eb58732",
				"status": "created",
				"progress": 0,
				"attributes": {
					"storageId": 36,
					"scheme": {
						"term_en": 0,
						"description_en": 1
					},
					"firstLineContainsHeader": true
				},
				"createdAt": "2023-23T12:17:54+00:00",
				"updatedAt": "2023-09-23T12:17:54+00:00",
				"startedAt": "2023-08-24T14:15:22Z",
				"finishedAt": "2023-08-24T14:15:22Z"
			}
		}`)
	})

	glossaryImport, resp, err := client.Glossaries.CheckGlossaryImportStatus(context.Background(), glossaryID, importID)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.GlossaryImport{
		Identifier: "c050fba2-200e-4ce1-8de4-f7ba8eb58732",
		Status:     "created",
		Progress:   0,
		Attributes: struct {
			StorageID               int            `json:"storageId"`
			Scheme                  map[string]int `json:"scheme"`
			FirstLineContainsHeader bool           `json:"firstLineContainsHeader"`
		}{
			StorageID: 36,
			Scheme: map[string]int{
				"term_en":        0,
				"description_en": 1,
			},
			FirstLineContainsHeader: true,
		},
		CreatedAt:  "2023-23T12:17:54+00:00",
		UpdatedAt:  "2023-09-23T12:17:54+00:00",
		StartedAt:  "2023-08-24T14:15:22Z",
		FinishedAt: "2023-08-24T14:15:22Z",
	}
	assert.Equal(t, expected, glossaryImport)
}

func TestGlossariesService_ConcordanceSearch(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/projects/1/glossaries/concordance"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"sourceLanguageId":"en","targetLanguageId":"de","expressions":["Welcome!","Save as...","View","About..."]}`+"\n")

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"glossary": {
							"id": 2,
							"name": "Be My Eyes iOS's Glossary"
						},
						"concept": {
							"id": 2,
							"subject": "general",
							"definition": "Some definition",
							"translatable": true,
							"note": "Any kind of note, such as a usage note, explanation, or instruction",
							"url": "https://example.com/base-url",
							"figure": "https://example.com/figure-url"
						},
						"sourceTerms": [
							{
								"id": 2,
								"userId": 6,
								"glossaryId": 6,
								"languageId": "fr",
								"text": "Voir",
								"description": "use for pages only (check screenshots)",
								"partOfSpeech": "verb",
								"status": "preferred",
								"type": "abbreviation",
								"gender": "masculine",
								"note": "Any kind of note, such as a usage note, explanation, or instruction",
								"url": "https://example.com/base-url",
								"conceptId": 6,
								"lemma": "voir",
								"createdAt": "2023-09-23T07:19:47+00:00",
								"updatedAt": "2023-09-23T07:19:47+00:00"
							}
						],
						"targetTerms": [
							{
								"id": 2,
								"userId": 6,
								"glossaryId": 6,
								"languageId": "fr",
								"text": "Voir",
								"description": "use for pages only (check screenshots)",
								"partOfSpeech": "verb",
								"status": "preferred",
								"type": "abbreviation",
								"gender": "masculine",
								"note": "Any kind of note, such as a usage note, explanation, or instruction",
								"url": "https://example.com/base-url",
								"conceptId": 6,
								"lemma": "voir",
								"createdAt": "2023-09-23T07:19:47+00:00",
								"updatedAt": "2023-09-23T07:19:47+00:00"
							}
						]
					}
				}
			],
			"pagination": {
				"offset": 10,
				"limit": 25
			}
		}`)
	})

	req := &model.GlossaryConcordanceSearchRequest{
		SourceLanguageID: "en",
		TargetLanguageID: "de",
		Expressions: []string{
			"Welcome!",
			"Save as...",
			"View",
			"About...",
		},
	}
	searches, resp, err := client.Glossaries.ConcordanceSearch(context.Background(), 1, req)
	require.NoError(t, err)

	expected := []*model.ConcordanceSearch{
		{
			Glossary: &model.ConcordanceSearchGlossary{
				ID:   2,
				Name: "Be My Eyes iOS's Glossary",
			},
			Concept: &model.ConcordanceSearchConcept{
				ID:           2,
				Subject:      "general",
				Definition:   "Some definition",
				Translatable: true,
				Note:         "Any kind of note, such as a usage note, explanation, or instruction",
				URL:          "https://example.com/base-url",
				Figure:       "https://example.com/figure-url",
			},
			SourceTerms: []*model.Term{
				{
					ID:           2,
					UserID:       6,
					GlossaryID:   6,
					LanguageID:   "fr",
					Text:         "Voir",
					Description:  "use for pages only (check screenshots)",
					PartOfSpeech: "verb",
					Status:       "preferred",
					Type:         "abbreviation",
					Gender:       "masculine",
					Note:         "Any kind of note, such as a usage note, explanation, or instruction",
					URL:          "https://example.com/base-url",
					ConceptID:    6,
					Lemma:        "voir",
					CreatedAt:    "2023-09-23T07:19:47+00:00",
					UpdatedAt:    "2023-09-23T07:19:47+00:00",
				},
			},
			TargetTerms: []*model.Term{
				{
					ID:           2,
					UserID:       6,
					GlossaryID:   6,
					LanguageID:   "fr",
					Text:         "Voir",
					Description:  "use for pages only (check screenshots)",
					PartOfSpeech: "verb",
					Status:       "preferred",
					Type:         "abbreviation",
					Gender:       "masculine",
					Note:         "Any kind of note, such as a usage note, explanation, or instruction",
					URL:          "https://example.com/base-url",
					ConceptID:    6,
					Lemma:        "voir",
					CreatedAt:    "2023-09-23T07:19:47+00:00",
					UpdatedAt:    "2023-09-23T07:19:47+00:00",
				},
			},
		},
	}
	assert.Equal(t, expected, searches)

	assert.Equal(t, 10, resp.Pagination.Offset)
	assert.Equal(t, 25, resp.Pagination.Limit)
}

func TestGlossariesService_ConcordanceSearch_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/glossaries/concordance", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Glossaries.ConcordanceSearch(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestGlossariesService_GetTerm(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		glossaryID = 1
		termID     = 1

		path = fmt.Sprintf("/api/v2/glossaries/%d/terms/%d", glossaryID, termID)
	)

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"userId": 6,
				"glossaryId": 6,
				"languageId": "fr",
				"text": "Voir",
				"description": "use for pages only (check screenshots)",
				"partOfSpeech": "verb",
				"status": "preferred",
				"type": "abbreviation",
				"gender": "masculine",
				"note": "Any kind of note, such as a usage note, explanation, or instruction",
				"url": "https://example.com/base-url",
				"conceptId": 6,
				"lemma": "voir",
				"createdAt": "2023-09-23T07:19:47+00:00",
				"updatedAt": "2023-09-23T07:19:47+00:00"
			}
		}`)
	})

	term, resp, err := client.Glossaries.GetTerm(context.Background(), glossaryID, termID)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Term{
		ID:           2,
		UserID:       6,
		GlossaryID:   6,
		LanguageID:   "fr",
		Text:         "Voir",
		Description:  "use for pages only (check screenshots)",
		PartOfSpeech: "verb",
		Status:       "preferred",
		Type:         "abbreviation",
		Gender:       "masculine",
		Note:         "Any kind of note, such as a usage note, explanation, or instruction",
		URL:          "https://example.com/base-url",
		ConceptID:    6,
		Lemma:        "voir",
		CreatedAt:    "2023-09-23T07:19:47+00:00",
		UpdatedAt:    "2023-09-23T07:19:47+00:00",
	}
	assert.Equal(t, expected, term)
}

func TestGlossariesService_ListTerms(t *testing.T) {
	tests := []struct {
		name          string
		opts          *model.TermsListOptions
		expectedQuery string
	}{
		{
			name:          "nil options",
			opts:          nil,
			expectedQuery: "",
		},
		{
			name:          "empty options",
			opts:          &model.TermsListOptions{},
			expectedQuery: "",
		},
		{
			name: "all options",
			opts: &model.TermsListOptions{
				OrderBy:     "createdAt desc,text",
				UserID:      1,
				LanguageID:  "fr",
				ConceptID:   1,
				ListOptions: model.ListOptions{Offset: 10, Limit: 25},
			},
			expectedQuery: "?conceptId=1&languageId=fr&limit=25&offset=10&orderBy=createdAt+desc%2Ctext&userId=1",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for glossaryID, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/glossaries/%d/terms", glossaryID)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodGet)
				testURL(t, r, path+tt.expectedQuery)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 2
							}
						},
						{
							"data": {
								"id": 4
							}
						},
						{
							"data": {
								"id": 6
							}
						}
					],
					"pagination": {
						"offset": 10,
						"limit": 25
					}
				}`)
			})
		})

		terms, resp, err := client.Glossaries.ListTerms(context.Background(), glossaryID, tt.opts)
		require.NoError(t, err)

		expected := []*model.Term{{ID: 2}, {ID: 4}, {ID: 6}}
		assert.Equal(t, expected, terms)
		assert.Len(t, terms, 3)

		assert.Equal(t, 10, resp.Pagination.Offset)
		assert.Equal(t, 25, resp.Pagination.Limit)
	}
}

func TestGlossariesService_ListTerms_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/glossaries/1/terms", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Glossaries.ListTerms(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestGlossariesService_AddTerm(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/glossaries/1/terms"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testJSONBody(t, r, `{
			"languageId": "fr",
			"text": "Voir",
			"description": "use for pages only (check screenshots)",
			"partOfSpeech": "verb",
			"status": "preferred",
			"type": "abbreviation",
			"gender": "masculine",
			"note": "string",
			"url": "https://example.com/base-url",
			"conceptId": 1
		}`)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"userId": 6,
				"glossaryId": 6,
				"languageId": "fr",
				"text": "Voir",
				"description": "use for pages only (check screenshots)",
				"partOfSpeech": "verb",
				"status": "preferred",
				"type": "abbreviation",
				"gender": "masculine",
				"note": "Any kind of note, such as a usage note, explanation, or instruction",
				"url": "https://example.com/base-url",
				"conceptId": 6,
				"lemma": "voir",
				"createdAt": "2023-09-23T07:19:47+00:00",
				"updatedAt": "2023-09-23T07:19:47+00:00"
			}
		}`)
	})

	req := &model.TermAddRequest{
		LanguageID:   "fr",
		Text:         "Voir",
		Description:  "use for pages only (check screenshots)",
		PartOfSpeech: "verb",
		Status:       "preferred",
		Type:         "abbreviation",
		Gender:       "masculine",
		Note:         "string",
		URL:          "https://example.com/base-url",
		ConceptID:    1,
	}
	term, resp, err := client.Glossaries.AddTerm(context.Background(), 1, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Term{
		ID:           2,
		UserID:       6,
		GlossaryID:   6,
		LanguageID:   "fr",
		Text:         "Voir",
		Description:  "use for pages only (check screenshots)",
		PartOfSpeech: "verb",
		Status:       "preferred",
		Type:         "abbreviation",
		Gender:       "masculine",
		Note:         "Any kind of note, such as a usage note, explanation, or instruction",
		URL:          "https://example.com/base-url",
		ConceptID:    6,
		Lemma:        "voir",
		CreatedAt:    "2023-09-23T07:19:47+00:00",
		UpdatedAt:    "2023-09-23T07:19:47+00:00",
	}
	assert.Equal(t, expected, term)
}

func TestGlossariesService_EditTerm(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		glossaryID = 1
		termID     = 2

		path = fmt.Sprintf("/api/v2/glossaries/%d/terms/%d", glossaryID, termID)
	)

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/text","value":"Voir"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"userId": 6,
				"glossaryId": 6,
				"languageId": "fr",
				"text": "Voir",
				"description": "use for pages only (check screenshots)",
				"partOfSpeech": "verb",
				"status": "preferred",
				"type": "abbreviation",
				"gender": "masculine",
				"note": "Any kind of note, such as a usage note, explanation, or instruction",
				"url": "Base URL",
				"conceptId": 6,
				"lemma": "voir",
				"createdAt": "2023-09-23T07:19:47+00:00",
				"updatedAt": "2023-09-23T07:19:47+00:00"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/text",
			Value: "Voir",
		},
	}
	term, resp, err := client.Glossaries.EditTerm(context.Background(), glossaryID, termID, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Term{
		ID:           2,
		UserID:       6,
		GlossaryID:   6,
		LanguageID:   "fr",
		Text:         "Voir",
		Description:  "use for pages only (check screenshots)",
		PartOfSpeech: "verb",
		Status:       "preferred",
		Type:         "abbreviation",
		Gender:       "masculine",
		Note:         "Any kind of note, such as a usage note, explanation, or instruction",
		URL:          "Base URL",
		ConceptID:    6,
		Lemma:        "voir",
		CreatedAt:    "2023-09-23T07:19:47+00:00",
		UpdatedAt:    "2023-09-23T07:19:47+00:00",
	}
	assert.Equal(t, expected, term)
}

func TestGlossariesService_ClearGlossary(t *testing.T) {
	tests := []struct {
		name          string
		opts          *model.ClearGlossaryOptions
		expectedQuery string
	}{
		{
			name:          "nil options",
			opts:          nil,
			expectedQuery: "",
		},
		{
			name:          "empty options",
			opts:          &model.ClearGlossaryOptions{},
			expectedQuery: "",
		},
		{
			name: "all options",
			opts: &model.ClearGlossaryOptions{
				LanguageID: "fr",
				ConceptID:  1,
			},
			expectedQuery: "?conceptId=1&languageId=fr",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for glossaryID, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/glossaries/%d/terms", glossaryID)

			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodDelete)
				testURL(t, r, path+tt.expectedQuery)

				w.WriteHeader(http.StatusNoContent)
			})

			resp, err := client.Glossaries.ClearGlossary(context.Background(), glossaryID, tt.opts)
			require.NoError(t, err)
			assert.Equal(t, http.StatusNoContent, resp.StatusCode)
		})
	}
}

func TestGlossariesService_DeleteTerm(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		glossaryID = 1
		termID     = 2

		path = fmt.Sprintf("/api/v2/glossaries/%d/terms/%d", glossaryID, termID)
	)

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Glossaries.DeleteTerm(context.Background(), glossaryID, termID)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}
