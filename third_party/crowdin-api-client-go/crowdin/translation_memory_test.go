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

func TestTranslationMemoryService_GetTM(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/tms/4"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)
		fmt.Fprint(w, `{
			"data": {
				"id": 4,
				"userId": 2,
				"name": "Knowledge Base's TM",
				"languageId": "fr",
				"languageIds": ["el"],
				"segmentsCount": 21,
				"defaultProjectIds": [2],
				"projectIds": [2],
				"webUrl": "https://crowdin.com/profile/username/resources/traslation-memory/1",
				"createdAt": "2023-09-16T13:42:04+00:00"
			}
		}`)
	})

	tm, resp, err := client.TranslationMemory.GetTM(context.Background(), 4)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.TranslationMemory{
		ID:                4,
		UserID:            2,
		Name:              "Knowledge Base's TM",
		LanguageID:        "fr",
		LanguageIDs:       []string{"el"},
		SegmentsCount:     21,
		DefaultProjectIDs: []int{2},
		ProjectIDs:        []int{2},
		WebURL:            "https://crowdin.com/profile/username/resources/traslation-memory/1",
		CreatedAt:         "2023-09-16T13:42:04+00:00",
	}
	assert.Equal(t, expected, tm)
}

func TestTranslationMemoryService_ListTMs(t *testing.T) {
	tests := []struct {
		name     string
		opts     *model.TranslationMemoriesListOptions
		expected string
	}{
		{
			name:     "nil options",
			opts:     nil,
			expected: "",
		},
		{
			name:     "empty options",
			opts:     &model.TranslationMemoriesListOptions{},
			expected: "",
		},
		{
			name: "with options",
			opts: &model.TranslationMemoriesListOptions{
				OrderBy: "createdAt desc,name",
				UserID:  2,
				ListOptions: model.ListOptions{
					Offset: 10,
					Limit:  25,
				},
			},
			expected: "?limit=25&offset=10&orderBy=createdAt+desc%2Cname&userId=2",
		},
	}

	for _, tt := range tests {
		client, mux, teardown := setupClient()
		defer teardown()

		mux.HandleFunc("/api/v2/tms", func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, http.MethodGet)
			testURL(t, r, "/api/v2/tms"+tt.expected)

			fmt.Fprint(w, `{
				"data": [
					{
						"data": {
							"id": 4,
							"userId": 2,
							"name": "Knowledge Base's TM",
							"languageId": "fr",
							"languageIds": ["el"],
							"segmentsCount": 21,
							"defaultProjectIds": [2],
							"projectIds": [2],
							"webUrl": "https://crowdin.com/profile/username/resources/traslation-memory/1",
							"createdAt": "2023-09-16T13:42:04+00:00"
						}
					}
				],
				"pagination": {
					"offset": 10,
					"limit": 25
				}
			}`)
		})

		tms, resp, err := client.TranslationMemory.ListTMs(context.Background(), tt.opts)
		require.NoError(t, err)

		expected := []*model.TranslationMemory{
			{
				ID:                4,
				UserID:            2,
				Name:              "Knowledge Base's TM",
				LanguageID:        "fr",
				LanguageIDs:       []string{"el"},
				SegmentsCount:     21,
				DefaultProjectIDs: []int{2},
				ProjectIDs:        []int{2},
				WebURL:            "https://crowdin.com/profile/username/resources/traslation-memory/1",
				CreatedAt:         "2023-09-16T13:42:04+00:00",
			},
		}
		assert.Len(t, expected, 1)
		assert.Equal(t, expected, tms)

		assert.Equal(t, 10, resp.Pagination.Offset)
		assert.Equal(t, 25, resp.Pagination.Limit)
	}
}

func TestTranslationMemoryService_ListTMs_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/tms", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.TranslationMemory.ListTMs(context.Background(), nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestTranslationMemoryService_AddTM(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/tms"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"name":"Knowledge Base's TM","languageId":"fr"}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 4,
				"userId": 2,
				"name": "Knowledge Base's TM",
				"languageId": "fr",
				"languageIds": ["el"],
				"segmentsCount": 21,
				"defaultProjectIds": [2],
				"projectIds": [2],
				"webUrl": "https://crowdin.com/profile/username/resources/traslation-memory/1",
				"createdAt": "2023-09-16T13:42:04+00:00"
			}
		}`)
	})

	req := &model.TranslationMemoryAddRequest{
		Name:       "Knowledge Base's TM",
		LanguageID: "fr",
	}
	tm, resp, err := client.TranslationMemory.AddTM(context.Background(), req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.TranslationMemory{
		ID:                4,
		UserID:            2,
		Name:              "Knowledge Base's TM",
		LanguageID:        "fr",
		LanguageIDs:       []string{"el"},
		SegmentsCount:     21,
		DefaultProjectIDs: []int{2},
		ProjectIDs:        []int{2},
		WebURL:            "https://crowdin.com/profile/username/resources/traslation-memory/1",
		CreatedAt:         "2023-09-16T13:42:04+00:00",
	}
	assert.Equal(t, expected, tm)
}

func TestTranslationMemoryService_EditTM(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/tms/123"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/name","value":"Updated TM"}]`+"\n")

		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{
			"data": {
				"id": 123,
				"userId": 2,
				"name": "Updated TM",
				"languageId": "fr",
				"languageIds": ["el"],
				"segmentsCount": 21,
				"defaultProjectIds": [2],
				"projectIds": [2],
				"webUrl": "https://crowdin.com/profile/username/resources/traslation-memory/1",
				"createdAt": "2023-09-16T13:42:04+00:00"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/name",
			Value: "Updated TM",
		},
	}
	tm, resp, err := client.TranslationMemory.EditTM(context.Background(), 123, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.TranslationMemory{
		ID:                123,
		UserID:            2,
		Name:              "Updated TM",
		LanguageID:        "fr",
		LanguageIDs:       []string{"el"},
		SegmentsCount:     21,
		DefaultProjectIDs: []int{2},
		ProjectIDs:        []int{2},
		WebURL:            "https://crowdin.com/profile/username/resources/traslation-memory/1",
		CreatedAt:         "2023-09-16T13:42:04+00:00",
	}
	assert.Equal(t, expected, tm)
}

func TestTranslationMemoryService_DeleteTM(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/tms/123"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.TranslationMemory.DeleteTM(context.Background(), 123)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestTranslationMemoryService_ClearTM(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/tms/4/segments"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.TranslationMemory.ClearTM(context.Background(), 4)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestTranslationMemoryService_ExportTM(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/tms/4/exports"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"sourceLanguageId":"en","targetLanguageId":"de","format":"csv"}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"identifier": "51fb3506-4127-4ba8-8296-f97dc7e3e0c3",
				"status": "finished",
				"progress": 100,
				"attributes": {
					"sourceLanguageId": "en",
					"targetLanguageId": "de",
					"format": "csv"
				},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00",
				"startedAt": "2023-09-23T11:26:54+00:00",
				"finishedAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	req := &model.TranslationMemoryExportRequest{
		SourceLanguageID: "en",
		TargetLanguageID: "de",
		Format:           model.TMExportFormatCSV,
	}
	export, resp, err := client.TranslationMemory.ExportTM(context.Background(), 4, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.TranslationMemoryExport{
		Identifier: "51fb3506-4127-4ba8-8296-f97dc7e3e0c3",
		Status:     "finished",
		Progress:   100,
		Attributes: struct {
			SourceLanguageID string `json:"sourceLanguageId"`
			TargetLanguageID string `json:"targetLanguageId"`
			Format           string `json:"format"`
		}{
			SourceLanguageID: "en",
			TargetLanguageID: "de",
			Format:           "csv",
		},
		CreatedAt:  "2023-09-23T11:26:54+00:00",
		UpdatedAt:  "2023-09-23T11:26:54+00:00",
		StartedAt:  "2023-09-23T11:26:54+00:00",
		FinishedAt: "2023-09-23T11:26:54+00:00",
	}
	assert.Equal(t, expected, export)
}

func TestTranslationMemoryService_CheckTMExportStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	exportID := "52fb3506-4127-4ba8-8296-f97dc7e3e0c3"
	path := "/api/v2/tms/4/exports/" + exportID
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"identifier": "52fb3506-4127-4ba8-8296-f97dc7e3e0c3",
				"status": "finished",
				"progress": 100,
				"attributes": {
					"sourceLanguageId": "en",
					"targetLanguageId": "de",
					"format": "csv"
				},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00",
				"startedAt": "2023-09-23T11:26:54+00:00",
				"finishedAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	export, resp, err := client.TranslationMemory.CheckTMExportStatus(context.Background(), 4, exportID)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.TranslationMemoryExport{
		Identifier: exportID,
		Status:     "finished",
		Progress:   100,
		Attributes: struct {
			SourceLanguageID string `json:"sourceLanguageId"`
			TargetLanguageID string `json:"targetLanguageId"`
			Format           string `json:"format"`
		}{
			SourceLanguageID: "en",
			TargetLanguageID: "de",
			Format:           "csv",
		},
		CreatedAt:  "2023-09-23T11:26:54+00:00",
		UpdatedAt:  "2023-09-23T11:26:54+00:00",
		StartedAt:  "2023-09-23T11:26:54+00:00",
		FinishedAt: "2023-09-23T11:26:54+00:00",
	}
	assert.Equal(t, expected, export)
}

func TestTranslationMemoryService_DownloadTM(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	tmID := 4
	exportID := "53fb3506-4127-4ba8-8296-f97dc7e3e0c3"
	path := fmt.Sprintf("/api/v2/tms/%d/exports/%s/download", tmID, exportID)
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

	downloadLink, resp, err := client.TranslationMemory.DownloadTM(context.Background(), tmID, exportID)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.DownloadLink{
		URL:      "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff",
		ExpireIn: "2023-09-20T10:31:21+00:00",
	}
	assert.Equal(t, expected, downloadLink)
}

func TestTranslationMemoryService_ImportTM(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/tms/4/imports"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"storageId":1,"firstLineContainsHeader":false,"scheme":{"de":1,"en":0,"pl":2,"uk":4}}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"identifier": "b5215a34-1305-4b21-8054-fc2eb252842f",
				"status": "created",
				"progress": 0,
				"attributes": {
					"tmId": 10,
					"storageId": 28,
					"firstLineContainsHeader": true,
					"scheme": {
						"en": 0,
						"de": 2
					}
				},
				"createdAt": "2023-09-23T11:51:08+00:00",
				"updatedAt": "2023-09-23T11:51:08+00:00",
				"startedAt": "2023-09-23T11:51:08+00:00",
				"finishedAt": null
			}
		}`)
	})

	req := &model.TranslationMemoryImportRequest{
		StorageID:               1,
		FirstLineContainsHeader: ToPtr(false),
		Scheme: map[string]int{
			"en": 0,
			"de": 1,
			"pl": 2,
			"uk": 4,
		},
	}
	importData, resp, err := client.TranslationMemory.ImportTM(context.Background(), 4, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.TranslationMemoryImport{
		Identifier: "b5215a34-1305-4b21-8054-fc2eb252842f",
		Status:     "created",
		Progress:   0,
		Attributes: struct {
			TMID                    int            `json:"tmId"`
			StorageID               int            `json:"storageId"`
			FirstLineContainsHeader bool           `json:"firstLineContainsHeader"`
			Scheme                  map[string]int `json:"scheme"`
		}{
			TMID:                    10,
			StorageID:               28,
			FirstLineContainsHeader: true,
			Scheme: map[string]int{
				"en": 0,
				"de": 2,
			},
		},
		CreatedAt:  "2023-09-23T11:51:08+00:00",
		UpdatedAt:  "2023-09-23T11:51:08+00:00",
		StartedAt:  "2023-09-23T11:51:08+00:00",
		FinishedAt: "",
	}
	assert.Equal(t, expected, importData)
}

func TestTranslationMemoryService_CheckTMImportStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	tmID := 4
	importID := "54fb3506-4127-4ba8-8296-f97dc7e3e0c3"
	path := fmt.Sprintf("/api/v2/tms/%d/imports/%s", tmID, importID)
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"identifier": "b5215a34-1305-4b21-8054-fc2eb252842f",
				"status": "created",
				"progress": 0,
				"attributes": {
					"tmId": 10,
					"storageId": 28,
					"firstLineContainsHeader": true,
					"scheme": {
					"en": 0,
					"de": 2
					}
				},
				"createdAt": "2023-09-23T11:51:08+00:00",
				"updatedAt": "2023-09-23T11:51:08+00:00",
				"startedAt": "2023-09-23T11:51:08+00:00",
				"finishedAt": null
			}
		}`)
	})

	importData, resp, err := client.TranslationMemory.CheckTMImportStatus(context.Background(), tmID, importID)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.TranslationMemoryImport{
		Identifier: "b5215a34-1305-4b21-8054-fc2eb252842f",
		Status:     "created",
		Progress:   0,
		Attributes: struct {
			TMID                    int            `json:"tmId"`
			StorageID               int            `json:"storageId"`
			FirstLineContainsHeader bool           `json:"firstLineContainsHeader"`
			Scheme                  map[string]int `json:"scheme"`
		}{
			TMID:                    10,
			StorageID:               28,
			FirstLineContainsHeader: true,
			Scheme: map[string]int{
				"en": 0,
				"de": 2,
			},
		},
		CreatedAt:  "2023-09-23T11:51:08+00:00",
		UpdatedAt:  "2023-09-23T11:51:08+00:00",
		StartedAt:  "2023-09-23T11:51:08+00:00",
		FinishedAt: "",
	}
	assert.Equal(t, expected, importData)
}

func TestTranslationMemoryService_ConcordanceSearch(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/projects/1/tms/concordance"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"sourceLanguageId":"en","targetLanguageId":"de","autoSubstitution":true,"minRelevant":60,"expressions":["Welcome!","Save as...","View","About..."]}`+"\n")

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"tm": {
							"id": 4,
							"name": "Knowledge Base's TM"
						},
						"recordId": 34,
						"source": "Welcome!",
						"target": "Ласкаво просимо!",
						"relevant": 100,
						"substituted": "62→100",
						"updatedAt": "2023-09-28T12:29:34+00:00"
					}
				}
			],
			"pagination": {
				"offset": 0,
				"limit": 25
			}
		}`)
	})

	req := &model.TMConcordanceSearchRequest{
		SourceLanguageID: "en",
		TargetLanguageID: "de",
		AutoSubstitution: ToPtr(true),
		MinRelevant:      60,
		Expressions: []string{
			"Welcome!",
			"Save as...",
			"View",
			"About...",
		},
	}
	tmList, resp, err := client.TranslationMemory.ConcordanceSearch(context.Background(), 1, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := []*model.TMConcordanceSearch{
		{
			TM: struct {
				ID   int    `json:"id"`
				Name string `json:"name"`
			}{
				ID:   4,
				Name: "Knowledge Base's TM",
			},
			RecordID:    34,
			Source:      "Welcome!",
			Target:      "Ласкаво просимо!",
			Relevant:    100,
			Substituted: "62→100",
			UpdatedAt:   "2023-09-28T12:29:34+00:00",
		},
	}
	assert.Equal(t, expected, tmList)
}

func TestTranslationMemoryService_ConcordanceSearch_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/tms/concordance", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.TranslationMemory.ConcordanceSearch(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestTranslationMemoryService_GetTMSegment(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		tmID      = 4
		segmentID = 10

		path = fmt.Sprintf("/api/v2/tms/%d/segments/%d", tmID, segmentID)
	)
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
			  "id": 4,
			  "records": [
					{
						"id": 1,
						"languageId": "uk",
						"text": "Перекладений текст",
						"usageCount": 13,
						"createdBy": 1,
						"updatedBy": 1,
						"createdAt": "2023-09-16T13:48:04+00:00",
						"updatedAt": "2023-09-16T13:48:04+00:00"
					}
			  	]
			}
		}`)
	})

	tmSegment, resp, err := client.TranslationMemory.GetTMSegment(context.Background(), tmID, segmentID)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.TMSegment{
		ID: 4,
		Records: []*model.TMSegmentRecord{
			{
				ID:         1,
				LanguageID: "uk",
				Text:       "Перекладений текст",
				UsageCount: 13,
				CreatedBy:  1,
				UpdatedBy:  1,
				CreatedAt:  "2023-09-16T13:48:04+00:00",
				UpdatedAt:  "2023-09-16T13:48:04+00:00",
			},
		},
	}
	assert.Equal(t, expected, tmSegment)
}

func TestTranslationMemoryService_ListTMSegments(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	tests := []struct {
		name     string
		opts     *model.TMSegmentsListOptions
		expected string
	}{
		{
			name:     "nil options",
			opts:     nil,
			expected: "",
		},
		{
			name:     "empty options",
			opts:     &model.TMSegmentsListOptions{},
			expected: "",
		},
		{
			name: "with options",
			opts: &model.TMSegmentsListOptions{
				OrderBy: "createdAt desc",
				CroQL:   "croql",
				ListOptions: model.ListOptions{
					Offset: 10,
					Limit:  25,
				},
			},
			expected: "?croql=croql&limit=25&offset=10&orderBy=createdAt+desc",
		},
	}

	for tmID, tt := range tests {
		path := fmt.Sprintf("/api/v2/tms/%d/segments", tmID)
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, http.MethodGet)
			testURL(t, r, path+tt.expected)

			fmt.Fprint(w, `{
				"data": [
					{
						"data": {
							"id": 4,
							"records": [
								{
									"id": 1,
									"languageId": "uk",
									"text": "Перекладений текст",
									"usageCount": 13,
									"createdBy": 1,
									"updatedBy": 1,
									"createdAt": "2019-09-16T13:48:04+00:00",
									"updatedAt": "2019-09-16T13:48:04+00:00"
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

		segments, resp, err := client.TranslationMemory.ListTMSegments(context.Background(), tmID, tt.opts)
		require.NoError(t, err)

		expected := []*model.TMSegment{
			{
				ID: 4,
				Records: []*model.TMSegmentRecord{
					{
						ID:         1,
						LanguageID: "uk",
						Text:       "Перекладений текст",
						UsageCount: 13,
						CreatedBy:  1,
						UpdatedBy:  1,
						CreatedAt:  "2019-09-16T13:48:04+00:00",
						UpdatedAt:  "2019-09-16T13:48:04+00:00",
					},
				},
			},
		}
		assert.Equal(t, expected, segments)
		assert.Len(t, expected, 1)

		assert.Equal(t, 10, resp.Pagination.Offset)
		assert.Equal(t, 25, resp.Pagination.Limit)
	}
}

func TestTranslationMemoryService_ListTMSegments_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/tms/2/segments", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.TranslationMemory.ListTMSegments(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestTranslationMemoryService_CreateTMSegment(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/tms/4/segments"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"records":[{"languageId":"uk","text":"Перекладений текст"}]}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 4,
				"records": [
					{
						"id": 1,
						"languageId": "uk",
						"text": "Перекладений текст",
						"usageCount": 13,
						"createdBy": 1,
						"updatedBy": 1,
						"createdAt": "2023-09-16T13:48:04+00:00",
						"updatedAt": "2023-09-16T13:48:04+00:00"
					}
				]
			}
		}`)
	})

	req := &model.TMSegmentCreateRequest{
		Records: []*model.TMSegmentCreateRecord{
			{
				LanguageID: "uk",
				Text:       "Перекладений текст",
			},
		},
	}
	segment, resp, err := client.TranslationMemory.CreateTMSegment(context.Background(), 4, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.TMSegment{
		ID: 4,
		Records: []*model.TMSegmentRecord{
			{
				ID:         1,
				LanguageID: "uk",
				Text:       "Перекладений текст",
				UsageCount: 13,
				CreatedBy:  1,
				UpdatedBy:  1,
				CreatedAt:  "2023-09-16T13:48:04+00:00",
				UpdatedAt:  "2023-09-16T13:48:04+00:00",
			},
		},
	}
	assert.Equal(t, expected, segment)
}

func TestTranslationMemoryService_EditTMSegment(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	tests := []struct {
		name string
		req  []*model.UpdateRequest
		body string
	}{
		{
			name: "add record",
			req: []*model.UpdateRequest{
				{
					Op:    "add",
					Path:  "/records",
					Value: map[string]interface{}{"languageId": "uk", "text": "Перекладений текст"},
				},
			},
			body: `[{"op":"add","path":"/records","value":{"languageId":"uk","text":"Перекладений текст"}}]` + "\n",
		},
		{
			name: "replace record",
			req: []*model.UpdateRequest{
				{
					Op:    "replace",
					Path:  "/records/1/text",
					Value: "Updated Text",
				},
			},
			body: `[{"op":"replace","path":"/records/1/text","value":"Updated Text"}]` + "\n",
		},
		{
			name: "remove record",
			req: []*model.UpdateRequest{
				{
					Op:   "remove",
					Path: "/records/1",
				},
			},
			body: `[{"op":"remove","path":"/records/1"}]` + "\n",
		},
	}

	for segmentID, tt := range tests {
		path := fmt.Sprintf("/api/v2/tms/4/segments/%d", segmentID)
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, http.MethodPatch)
			testURL(t, r, path)
			testBody(t, r, tt.body)

			fmt.Fprint(w, `{
				"data": {
					"id": 4,
					"records": [
						{
							"id": 1,
							"languageId": "uk",
							"text": "Перекладений текст",
							"usageCount": 13,
							"createdBy": 1,
							"updatedBy": 1,
							"createdAt": "2023-09-16T13:48:04+00:00",
							"updatedAt": "2023-09-16T13:48:04+00:00"
						}
					]
				}
			}`)
		})

		tmSegment, resp, err := client.TranslationMemory.EditTMSegment(context.Background(), 4, segmentID, tt.req)
		require.NoError(t, err)
		assert.NotNil(t, resp)

		expected := &model.TMSegment{
			ID: 4,
			Records: []*model.TMSegmentRecord{
				{
					ID:         1,
					LanguageID: "uk",
					Text:       "Перекладений текст",
					UsageCount: 13,
					CreatedBy:  1,
					UpdatedBy:  1,
					CreatedAt:  "2023-09-16T13:48:04+00:00",
					UpdatedAt:  "2023-09-16T13:48:04+00:00",
				},
			},
		}
		assert.Equal(t, expected, tmSegment)
	}
}

func TestTranslationMemoryService_DeleteTMSegment(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/tms/4/segments/123"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.TranslationMemory.DeleteTMSegment(context.Background(), 4, 123)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}
