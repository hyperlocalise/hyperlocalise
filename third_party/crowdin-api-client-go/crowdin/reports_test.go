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

func TestReportsService_GetArchive(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/users/35/reports/archives/12"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 12,
				"scopeType": "project",
				"scopeId": 35,
				"userId": 35,
				"name": "string",
				"webUrl": "https://crowdin.com/project/project-identifier/reports/archive/1",
				"scheme": {},
				"createdAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	archive, resp, err := client.Reports.GetArchive(context.Background(), 35, 12)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.ReportArchive{
		ID:        12,
		ScopeType: "project",
		ScopeID:   35,
		UserID:    35,
		Name:      "string",
		WebURL:    "https://crowdin.com/project/project-identifier/reports/archive/1",
		Scheme:    map[string]any{},
		CreatedAt: "2023-09-23T11:26:54+00:00",
	}
	assert.Equal(t, expected, archive)

	t.Run("enterprise client endpoint", func(t *testing.T) {
		path := "/api/v2/reports/archives/12"
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testURL(t, r, path)
			fmt.Fprint(w, `{}`)
		})
		_, _, err = client.Reports.GetArchive(context.Background(), 0, 12)
		require.NoError(t, err)
	})
}

func TestReportsService_ListArchive(t *testing.T) {
	tests := []struct {
		name          string
		opts          *model.ReportArchivesListOptions
		expectedQuery string
	}{
		{
			name:          "nil options",
			opts:          nil,
			expectedQuery: "",
		},
		{
			name:          "empty options",
			opts:          &model.ReportArchivesListOptions{},
			expectedQuery: "",
		},
		{
			name: "with options",
			opts: &model.ReportArchivesListOptions{
				ScopeType:   "project",
				ScopeID:     35,
				ListOptions: model.ListOptions{Offset: 10, Limit: 10},
			},
			expectedQuery: "?limit=10&offset=10&scopeId=35&scopeType=project",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for userID, tt := range tests {
		userID++
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/users/%d/reports/archives", userID)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, "GET")
				testURL(t, r, path+tt.expectedQuery)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 12,
								"scopeType": "project",
								"scopeId": 35,
								"userId": 35,
								"name": "string",
								"webUrl": "https://crowdin.com/project/project-identifier/reports/archive/1",
								"scheme": {},
								"createdAt": "2023-09-23T11:26:54+00:00"
							}
						}
					],
					"pagination": {
						"offset": 10,
						"limit": 10
					}
				}`)
			})

			archives, resp, err := client.Reports.ListArchives(context.Background(), userID, tt.opts)
			require.NoError(t, err)

			expected := []*model.ReportArchive{
				{
					ID:        12,
					ScopeType: "project",
					ScopeID:   35,
					UserID:    35,
					Name:      "string",
					WebURL:    "https://crowdin.com/project/project-identifier/reports/archive/1",
					Scheme:    map[string]any{},
					CreatedAt: "2023-09-23T11:26:54+00:00",
				},
			}
			assert.Equal(t, expected, archives)

			assert.Equal(t, 10, resp.Pagination.Offset)
			assert.Equal(t, 10, resp.Pagination.Limit)
		})
	}

	t.Run("enterprise client endpoint", func(t *testing.T) {
		path := "/api/v2/reports/archives"
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testURL(t, r, path)
			fmt.Fprint(w, `{}`)
		})
		_, _, err := client.Reports.ListArchives(context.Background(), 0, nil)
		require.NoError(t, err)
	})
}

func TestReportsService_ListArchive_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/users/1/reports/archives", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Reports.ListArchives(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestReportsService_DeleteArchive(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/users/35/reports/archives/12"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "DELETE")
		testURL(t, r, path)
		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Reports.DeleteArchive(context.Background(), 35, 12)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	t.Run("enterprise client endpoint", func(t *testing.T) {
		path := "/api/v2/reports/archives/12"
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testURL(t, r, path)
			fmt.Fprint(w, `{}`)
		})
		_, err := client.Reports.DeleteArchive(context.Background(), 0, 12)
		require.NoError(t, err)
	})
}

func TestReportsService_ExportArchive(t *testing.T) {
	tests := []struct {
		name string
		req  *model.ExportReportArchiveRequest
		body string
	}{
		{
			name: "with request",
			req:  &model.ExportReportArchiveRequest{Format: model.ReportFormatJSON},
			body: `{"format":"json"}`,
		},
		{
			name: "without request",
			req:  nil,
			body: `{"format":"xlsx"}`,
		},
		{
			name: "empty request",
			req:  &model.ExportReportArchiveRequest{},
			body: `{"format":"xlsx"}`,
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for userID, tt := range tests {
		userID++
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/users/%d/reports/archives/12/exports", userID)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, "POST")
				testURL(t, r, path)
				testBody(t, r, tt.body+"\n")

				fmt.Fprint(w, jsonReportStatus())
			})

			status, resp, err := client.Reports.ExportArchive(context.Background(), userID, 12, tt.req)
			require.NoError(t, err)
			assert.NotNil(t, resp)

			expected := &model.ReportStatus{
				Identifier: "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
				Status:     "finished",
				Progress:   100,
				Attributes: model.ReportStatusAttributes{
					Format:     "xlsx",
					ReportName: "costs-estimation",
					Schema:     map[string]any{},
				},
				CreatedAt:  "2023-09-23T11:26:54+00:00",
				UpdatedAt:  "2023-09-23T11:26:54+00:00",
				StartedAt:  "2023-09-23T11:26:54+00:00",
				FinishedAt: "2023-09-23T11:26:54+00:00",
			}
			assert.Equal(t, expected, status)
		})
	}

	t.Run("enterprise client endpoint", func(t *testing.T) {
		path := "/api/v2/reports/archives/12/exports"
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testURL(t, r, path)
			fmt.Fprint(w, `{}`)
		})
		_, _, err := client.Reports.ExportArchive(context.Background(), 0, 12, nil)
		require.NoError(t, err)
	})
}
func TestReportsService_CheckArchiveExportStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		userID    = 35
		archiveID = 12
		exportID  = "50fb3506-4127-4ba8-8296-f97dc7e3e0c3"

		path = fmt.Sprintf("/api/v2/users/%d/reports/archives/%d/exports/%s", userID, archiveID, exportID)
	)

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, path)

		fmt.Fprint(w, jsonReportStatus())
	})

	status, resp, err := client.Reports.CheckArchiveExportStatus(context.Background(), userID, archiveID, exportID)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.ReportStatus{
		Identifier: "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
		Status:     "finished",
		Progress:   100,
		Attributes: model.ReportStatusAttributes{
			Format:     "xlsx",
			ReportName: "costs-estimation",
			Schema:     map[string]any{},
		},
		CreatedAt:  "2023-09-23T11:26:54+00:00",
		UpdatedAt:  "2023-09-23T11:26:54+00:00",
		StartedAt:  "2023-09-23T11:26:54+00:00",
		FinishedAt: "2023-09-23T11:26:54+00:00",
	}
	assert.Equal(t, expected, status)

	t.Run("enterprise client endpoint", func(t *testing.T) {
		path := "/api/v2/reports/archives/12/exports/50fb3506-4127-4ba8-8296-f97dc7e3e0c3"
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testURL(t, r, path)
			fmt.Fprint(w, `{}`)
		})
		_, _, err := client.Reports.CheckArchiveExportStatus(context.Background(), 0, 12, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3")
		require.NoError(t, err)
	})
}

func TestReportsService_DownloadArchive(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		userID    = 35
		archiveID = 12
		exportID  = "50fb3506-4127-4ba8-8296-f97dc7e3e0c3"

		path = fmt.Sprintf("/api/v2/users/%d/reports/archives/%d/exports/%s/download", userID, archiveID, exportID)
	)

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"url": "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff",
				"expireIn": "2023-09-20T10:31:21+00:00"
			}
		}`)
	})

	downloadLink, resp, err := client.Reports.DownloadArchive(context.Background(), userID, archiveID, exportID)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.DownloadLink{
		URL:      "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff",
		ExpireIn: "2023-09-20T10:31:21+00:00",
	}
	assert.Equal(t, expected, downloadLink)

	t.Run("enterprise client endpoint", func(t *testing.T) {
		path := "/api/v2/reports/archives/12/exports/50fb3506-4127-4ba8-8296-f97dc7e3e0c3/download"
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testURL(t, r, path)
			fmt.Fprint(w, `{}`)
		})
		_, _, err := client.Reports.DownloadArchive(context.Background(), 0, 12, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3")
		require.NoError(t, err)
	})
}

func TestReportsService_Generate(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/reports"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "POST")
		testURL(t, r, path)
		testJSONBody(t, r, `{
			"name": "top-members",
			"schema": {
				"unit": "words",
				"languageId": "uk",
				"format": "xlsx",
				"dateFrom": "2023-09-23T07:00:14+00:00",
				"dateTo": "2023-09-27T07:00:14+00:00"
			}
		}`)

		fmt.Fprint(w, `{
			"data": {
				"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
				"status": "finished",
				"progress": 100,
				"attributes": {
					"format": "xlsx",
					"reportName": "top-members",
					"schema": {}
				},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00",
				"startedAt": "2023-09-23T11:26:54+00:00",
				"finishedAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	req := &model.ReportGenerateRequest{
		Name: model.ReportTopMembers,
		Schema: &model.TopMembersSchema{
			Unit:       model.ReportUnitWords,
			LanguageID: "uk",
			Format:     model.ReportFormatXLSX,
			DateFrom:   "2023-09-23T07:00:14+00:00",
			DateTo:     "2023-09-27T07:00:14+00:00",
		},
	}
	status, resp, err := client.Reports.Generate(context.Background(), 1, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	excepted := &model.ReportStatus{
		Identifier: "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
		Status:     "finished",
		Progress:   100,
		Attributes: model.ReportStatusAttributes{
			Format:     "xlsx",
			ReportName: "top-members",
			Schema:     map[string]any{},
		},
		CreatedAt:  "2023-09-23T11:26:54+00:00",
		UpdatedAt:  "2023-09-23T11:26:54+00:00",
		StartedAt:  "2023-09-23T11:26:54+00:00",
		FinishedAt: "2023-09-23T11:26:54+00:00",
	}
	assert.Equal(t, excepted, status)
}

func TestReportsService_CheckStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/123/reports/50fb3506-4127-4ba8-8296-f97dc7e3e0c3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, path)

		fmt.Fprint(w, jsonReportStatus())
	})

	status, resp, err := client.Reports.CheckStatus(context.Background(), 123, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3")
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.ReportStatus{
		Identifier: "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
		Status:     "finished",
		Progress:   100,
		Attributes: model.ReportStatusAttributes{
			Format:     "xlsx",
			ReportName: "costs-estimation",
			Schema:     map[string]any{},
		},
		CreatedAt:  "2023-09-23T11:26:54+00:00",
		UpdatedAt:  "2023-09-23T11:26:54+00:00",
		StartedAt:  "2023-09-23T11:26:54+00:00",
		FinishedAt: "2023-09-23T11:26:54+00:00",
	}
	assert.Equal(t, expected, status)
}

func TestReportsService_Download(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/123/reports/50fb3506-4127-4ba8-8296-f97dc7e3e0c3/download"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"url": "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff",
				"expireIn": "2023-09-20T10:31:21+00:00"
			}
		}`)
	})

	downloadLink, resp, err := client.Reports.Download(context.Background(), 123, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3")
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.DownloadLink{
		URL:      "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff",
		ExpireIn: "2023-09-20T10:31:21+00:00",
	}
	assert.Equal(t, expected, downloadLink)
}

func TestReportsService_GetSettingsTemplate(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/123/reports/settings-templates/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "Default template",
				"currency": "USD",
				"unit": "words",
				"config": {
					"baseRates": {
						"fullTranslation": 0.1,
						"proofread": 0.12
					},
					"individualRates": [
						{
							"languageIds": ["uk"],
							"userIds": [1],
							"fullTranslation": 0.1,
							"proofread": 0.12
						}
					],
					"netRateSchemes": {
						"tmMatch": [
							{
								"matchType": "perfect",
								"price": 0.1
							}
						],
						"mtMatch": [
							{
								"matchType": "100",
								"price": 0.1
							}
						],
						"suggestionMatch": [
							{
								"matchType": "100",
								"price": 0.1
							}
						]
					}
				},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00",
				"isPublic": true,
				"isGlobal": false
			}
		}`)
	})

	template, resp, err := client.Reports.GetSettingsTemplate(context.Background(), 123, 1)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.ReportSettingsTemplate{
		ID:       1,
		Name:     "Default template",
		Currency: "USD",
		Unit:     "words",
		Config: model.ReportSettingsTemplateConfig{
			BaseRates: &model.ReportBaseRates{FullTranslation: 0.1, Proofread: 0.12},
			IndividualRates: []*model.ReportIndividualRates{
				{
					LanguageIDs:     []string{"uk"},
					UserIDs:         []int{1},
					FullTranslation: 0.1,
					Proofread:       0.12,
				},
			},
			NetRateSchemes: &model.ReportNetRateSchemes{
				TMMatch:         []model.ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.1}},
				MTMatch:         []model.ReportNetRateSchemeMatch{{MatchType: "100", Price: 0.1}},
				SuggestionMatch: []model.ReportNetRateSchemeMatch{{MatchType: "100", Price: 0.1}},
			},
		},
		CreatedAt: "2023-09-23T11:26:54+00:00",
		UpdatedAt: "2023-09-23T11:26:54+00:00",
		IsPublic:  true,
		IsGlobal:  ToPtr(false),
	}
	assert.Equal(t, expected, template)

	t.Run("enterprise client endpoint", func(t *testing.T) {
		const path = "/api/v2/reports/settings-templates/1"
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testURL(t, r, path)
			fmt.Fprint(w, `{}`)
		})
		_, _, err = client.Reports.GetSettingsTemplate(context.Background(), 0, 1)
		require.NoError(t, err)
	})
}

func TestReportsService_ListSettingsTemplates(t *testing.T) {
	tests := []struct {
		name          string
		opts          *model.ReportSettingsTemplatesListOptions
		expectedQuery string
	}{
		{
			name:          "nil options",
			opts:          nil,
			expectedQuery: "",
		},
		{
			name:          "empty options",
			opts:          &model.ReportSettingsTemplatesListOptions{},
			expectedQuery: "",
		},
		{
			name: "with options",
			opts: &model.ReportSettingsTemplatesListOptions{
				ProjectID:   1,
				GroupID:     2,
				ListOptions: model.ListOptions{Offset: 10, Limit: 10},
			},
			expectedQuery: "?groupId=2&limit=10&offset=10&projectId=1",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for projectID, tt := range tests {
		projectID++
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/projects/%d/reports/settings-templates", projectID)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, "GET")
				testURL(t, r, path+tt.expectedQuery)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 1,
								"name": "Default template"
							}
						},
						{
							"data": {
								"id": 2,
								"name": "Custom template"
							}
						}
					],
					"pagination": {
						"offset": 10,
						"limit": 20
					}
				}`)
			})

			templates, resp, err := client.Reports.ListSettingsTemplates(context.Background(), projectID, tt.opts)

			require.NoError(t, err)
			assert.Equal(t, 10, resp.Pagination.Offset)
			assert.Equal(t, 20, resp.Pagination.Limit)
			assert.Equal(t, []*model.ReportSettingsTemplate{{ID: 1, Name: "Default template"}, {ID: 2, Name: "Custom template"}}, templates)
		})
	}

	t.Run("enterprise client endpoint", func(t *testing.T) {
		const path = "/api/v2/reports/settings-templates"
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testURL(t, r, path)
			fmt.Fprint(w, `{}`)
		})
		_, _, err := client.Reports.ListSettingsTemplates(context.Background(), 0, nil)
		require.NoError(t, err)
	})
}

func TestReportsService_ListSettingsTemplates_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/reports/settings-templates", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Reports.ListSettingsTemplates(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestReportsService_AddSettingsTemplate(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/reports/settings-templates"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "POST")
		testURL(t, r, path)
		testJSONBody(t, r, `{
			"name":"Default template",
			"currency":"USD",
			"unit":"words",
			"config":{
				"baseRates":{
					"fullTranslation":0.1,
					"proofread":0.12
				},
				"individualRates":[
					{
						"languageIds":["uk"],
						"userIds":[1],
						"fullTranslation":0.1,
						"proofread":0.12
					}
				],
				"netRateSchemes":{
					"tmMatch":[
						{
							"matchType":"perfect",
							"price":0.1
						}
					],
					"mtMatch":[
						{
							"matchType":"100",
							"price":0.1
						}
					],
					"suggestionMatch":[
						{
							"matchType":"100",
							"price":0.1
						}
					]
				}
			},
			"isPublic":false,
			"isGlobal":true
		}`)

		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "Default template"
			}
		}`)
	})

	req := &model.ReportSettingsTemplateAddRequest{
		Name:     "Default template",
		Currency: "USD",
		Unit:     model.ReportUnitWords,
		Config: &model.ReportSettingsTemplateConfig{
			BaseRates: &model.ReportBaseRates{
				FullTranslation: 0.1,
				Proofread:       0.12,
			},
			IndividualRates: []*model.ReportIndividualRates{
				{
					LanguageIDs:     []string{"uk"},
					UserIDs:         []int{1},
					FullTranslation: 0.1,
					Proofread:       0.12,
				},
			},
			NetRateSchemes: &model.ReportNetRateSchemes{
				TMMatch:         []model.ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.1}},
				MTMatch:         []model.ReportNetRateSchemeMatch{{MatchType: "100", Price: 0.1}},
				SuggestionMatch: []model.ReportNetRateSchemeMatch{{MatchType: "100", Price: 0.1}},
			},
		},
		IsPublic: ToPtr(false),
		IsGlobal: ToPtr(true),
	}
	template, resp, err := client.Reports.AddSettingsTemplate(context.Background(), 1, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.ReportSettingsTemplate{ID: 1, Name: "Default template"}
	assert.Equal(t, expected, template)

	t.Run("enterprise client endpoint", func(t *testing.T) {
		const path = "/api/v2/reports/settings-templates"
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testURL(t, r, path)
			fmt.Fprint(w, `{}`)
		})
		_, _, err = client.Reports.AddSettingsTemplate(context.Background(), 0, req)
		require.NoError(t, err)
	})
}

func TestReportsService_EditSettingsTemplate(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/reports/settings-templates/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "PATCH")
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/name","value":"New name"},{"op":"replace","path":"/currency","value":"USD"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"name": "New name",
				"currency": "USD"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    model.OpReplace,
			Path:  "/name",
			Value: "New name",
		},
		{
			Op:    model.OpReplace,
			Path:  "/currency",
			Value: "USD",
		},
	}
	template, resp, err := client.Reports.EditSettingsTemplate(context.Background(), 1, 2, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.ReportSettingsTemplate{ID: 2, Name: "New name", Currency: "USD"}
	assert.Equal(t, expected, template)

	t.Run("enterprise client endpoint", func(t *testing.T) {
		const path = "/api/v2/reports/settings-templates/2"
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testURL(t, r, path)
			fmt.Fprint(w, `{}`)
		})
		_, _, err = client.Reports.EditSettingsTemplate(context.Background(), 0, 2, req)
		require.NoError(t, err)
	})
}

func TestReportsService_DeleteSettingsTemplate(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/reports/settings-templates/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "DELETE")
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Reports.DeleteSettingsTemplate(context.Background(), 1, 2)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)

	t.Run("enterprise client endpoint", func(t *testing.T) {
		const path = "/api/v2/reports/settings-templates/2"
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testURL(t, r, path)
			fmt.Fprint(w, `{}`)
		})
		_, err = client.Reports.DeleteSettingsTemplate(context.Background(), 0, 2)
		require.NoError(t, err)
	})
}

func TestReportsService_CheckGroupReportStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/groups/35/reports/50fb3506-4127-4ba8-8296-f97dc7e3e0c3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, path)

		fmt.Fprint(w, jsonReportStatus())
	})

	status, resp, err := client.Reports.CheckGroupReportStatus(context.Background(), 35, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3")

	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.ReportStatus{
		Identifier: "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
		Status:     "finished",
		Progress:   100,
		Attributes: model.ReportStatusAttributes{
			Format:     "xlsx",
			ReportName: "costs-estimation",
			Schema:     map[string]any{},
		},
		CreatedAt:  "2023-09-23T11:26:54+00:00",
		UpdatedAt:  "2023-09-23T11:26:54+00:00",
		StartedAt:  "2023-09-23T11:26:54+00:00",
		FinishedAt: "2023-09-23T11:26:54+00:00",
	}
	assert.Equal(t, expected, status)
}

func TestReportsService_DownloadGroupReport(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/groups/35/reports/50fb3506-4127-4ba8-8296-f97dc7e3e0c3/download"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"url": "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff",
				"expireIn": "2023-09-20T10:31:21+00:00"
			}
		}`)
	})

	downloadLink, resp, err := client.Reports.DownloadGroupReport(context.Background(), 35, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3")

	require.NoError(t, err)
	assert.NotNil(t, resp)
	assert.Equal(t, "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff", downloadLink.URL)
	assert.Equal(t, "2023-09-20T10:31:21+00:00", downloadLink.ExpireIn)
}

func TestReportsService_GenerateGroupReport(t *testing.T) {
	const path = "/api/v2/groups/1/reports"

	t.Run("Group Translation Costs Post-Editing Report schema", func(t *testing.T) {
		client, mux, teardown := setupClient()
		defer teardown()

		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, "POST")
			testURL(t, r, path)
			testJSONBody(t, r, `{
				"name":"group-translation-costs-pe",
				"schema":{
					"projectIds":[1,2],
					"baseRates":{
						"fullTranslation":0.1,
						"proofread":0.12
					},
					"individualRates":[
						{
							"languageIds":["uk"],
							"userIds":[1],
							"fullTranslation":0.1,
							"proofread":0.12
						}
					],
					"netRateSchemes":{
						"tmMatch":[
							{
								"matchType":"perfect",
								"price":0.1
							}
						],
						"mtMatch":[
							{
								"matchType":"100",
								"price":0.1
							}
						],
						"suggestionMatch":[
							{
								"matchType":"100",
								"price":0.1
							}
						]
					}									
				}
			}`)

			fmt.Fprint(w, `{
				"data": {
					"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3"
				}
			}`)
		})

		req := &model.GroupReportGenerateRequest{
			Name: model.ReportGroupTranslationCostsPostEditing,
			Schema: &model.GroupTransactionCostsPostEditingSchema{
				ProjectIDs: []int{1, 2},
				BaseRates:  &model.ReportBaseRates{FullTranslation: 0.1, Proofread: 0.12},
				IndividualRates: []*model.ReportIndividualRates{
					{
						LanguageIDs:     []string{"uk"},
						UserIDs:         []int{1},
						FullTranslation: 0.1,
						Proofread:       0.12,
					},
				},
				NetRateSchemes: &model.ReportNetRateSchemes{
					TMMatch:         []model.ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.1}},
					MTMatch:         []model.ReportNetRateSchemeMatch{{MatchType: "100", Price: 0.1}},
					SuggestionMatch: []model.ReportNetRateSchemeMatch{{MatchType: "100", Price: 0.1}},
				},
			},
		}

		status, resp, err := client.Reports.GenerateGroupReport(context.Background(), 1, req)
		require.NoError(t, err)
		assert.NotNil(t, resp)
		assert.Equal(t, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3", status.Identifier)
	})

	t.Run("Group Top Members Report schema", func(t *testing.T) {
		client, mux, teardown := setupClient()
		defer teardown()

		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, "POST")
			testURL(t, r, path)
			testJSONBody(t, r, `{
				"name": "group-top-members",
				"schema": {
					"projectIds": [1,2]
				}
			}`)

			fmt.Fprint(w, `{
				"data": {
					"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3"
				}
			}`)
		})

		req := &model.GroupReportGenerateRequest{
			Name:   model.ReportGroupTopMembers,
			Schema: &model.GroupTopMembersSchema{ProjectIDs: []int{1, 2}},
		}
		status, resp, err := client.Reports.GenerateGroupReport(context.Background(), 1, req)

		require.NoError(t, err)
		assert.NotNil(t, resp)
		assert.Equal(t, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3", status.Identifier)
	})
}

func TestReportsService_GenerateOrganizationReport(t *testing.T) {
	const path = "/api/v2/reports"

	t.Run("Group Translation Costs Post-Editing Report schema", func(t *testing.T) {
		client, mux, teardown := setupClient()
		defer teardown()

		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, "POST")
			testURL(t, r, path)
			testJSONBody(t, r, `{
				"name":"group-translation-costs-pe",
				"schema":{
					"projectIds":[1,2],
					"unit":"words",
					"currency":"USD",
					"format":"xlsx",
					"baseRates":{
						"fullTranslation":0.1,
						"proofread":0.12
					},
					"individualRates":[
						{
							"languageIds":["uk"],
							"userIds":[1],
							"fullTranslation":0.1,
							"proofread":0.12
						}
					],
					"netRateSchemes":{
						"tmMatch":[
							{
								"matchType":"perfect",
								"price":0.1
							}
						],
						"mtMatch":[
							{
								"matchType":"100",
								"price":0.1
							}
						],
						"suggestionMatch":[
							{
								"matchType":"100",
								"price":0.1
							}
						]
					},
					"excludeApprovalsForEditedTranslations":false,
					"groupBy":"user",
					"dateFrom":"2023-09-23T11:26:54+00:00",
					"dateTo":"2023-09-23T11:26:54+00:00",
					"userIds":[1,2]					
				}
			}`)

			fmt.Fprint(w, `{
				"data": {
					"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3"
				}
			}`)
		})

		req := &model.GroupReportGenerateRequest{
			Name: model.ReportGroupTranslationCostsPostEditing,
			Schema: &model.GroupTransactionCostsPostEditingSchema{
				ProjectIDs: []int{1, 2},
				Unit:       model.ReportUnitWords,
				Currency:   "USD",
				Format:     model.ReportFormatXLSX,
				BaseRates:  &model.ReportBaseRates{FullTranslation: 0.1, Proofread: 0.12},
				IndividualRates: []*model.ReportIndividualRates{
					{
						LanguageIDs:     []string{"uk"},
						UserIDs:         []int{1},
						FullTranslation: 0.1,
						Proofread:       0.12,
					},
				},
				NetRateSchemes: &model.ReportNetRateSchemes{
					TMMatch:         []model.ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.1}},
					MTMatch:         []model.ReportNetRateSchemeMatch{{MatchType: "100", Price: 0.1}},
					SuggestionMatch: []model.ReportNetRateSchemeMatch{{MatchType: "100", Price: 0.1}},
				},
				ExcludeApprovalsForEditedTranslations: ToPtr(false),
				GroupBy:                               "user",
				DateFrom:                              "2023-09-23T11:26:54+00:00",
				DateTo:                                "2023-09-23T11:26:54+00:00",
				UserIDs:                               []int{1, 2},
			},
		}

		status, resp, err := client.Reports.GenerateOrganizationReport(context.Background(), req)
		require.NoError(t, err)
		assert.NotNil(t, resp)
		assert.Equal(t, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3", status.Identifier)
	})

	t.Run("Group Top Members Report schema", func(t *testing.T) {
		client, mux, teardown := setupClient()
		defer teardown()

		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, "POST")
			testURL(t, r, path)
			testJSONBody(t, r, `{
				"name": "group-top-members",
				"schema": {
					"projectIds": [1,2],
					"unit": "words",
					"languageId": "uk",
					"format": "json",
					"dateFrom": "2023-09-23T07:00:14+00:00",
					"dateTo": "2023-09-27T07:00:14+00:00"
				}
			}`)

			fmt.Fprint(w, `{
				"data": {
					"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3"
				}
			}`)
		})

		req := &model.GroupReportGenerateRequest{
			Name: model.ReportGroupTopMembers,
			Schema: &model.GroupTopMembersSchema{
				ProjectIDs: []int{1, 2},
				Unit:       model.ReportUnitWords,
				LanguageID: "uk",
				Format:     model.ReportFormatJSON,
				DateFrom:   "2023-09-23T07:00:14+00:00",
				DateTo:     "2023-09-27T07:00:14+00:00",
			},
		}

		status, resp, err := client.Reports.GenerateOrganizationReport(context.Background(), req)
		require.NoError(t, err)
		assert.NotNil(t, resp)
		assert.Equal(t, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3", status.Identifier)
	})
}

func TestReportsService_CheckOrganizationReportStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/reports/50fb3506-4127-4ba8-8296-f97dc7e3e0c3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, path)

		fmt.Fprint(w, jsonReportStatus())
	})

	status, resp, err := client.Reports.CheckOrganizationReportStatus(context.Background(), "50fb3506-4127-4ba8-8296-f97dc7e3e0c3")

	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.ReportStatus{
		Identifier: "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
		Status:     "finished",
		Progress:   100,
		Attributes: model.ReportStatusAttributes{
			Format:     "xlsx",
			ReportName: "costs-estimation",
			Schema:     map[string]any{},
		},
		CreatedAt:  "2023-09-23T11:26:54+00:00",
		UpdatedAt:  "2023-09-23T11:26:54+00:00",
		StartedAt:  "2023-09-23T11:26:54+00:00",
		FinishedAt: "2023-09-23T11:26:54+00:00",
	}
	assert.Equal(t, expected, status)
}

func TestReportsService_DownloadOrganizationReport(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	reportID := "50fb3506-4127-4ba8-8296-f97dc7e3e0c3"
	path := fmt.Sprintf("/api/v2/reports/%s/download", reportID)

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"url": "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff",
				"expireIn": "2023-09-20T10:31:21+00:00"
			}
		}`)
	})

	downloadLink, resp, err := client.Reports.DownloadOrganizationReport(context.Background(), reportID)

	require.NoError(t, err)
	assert.NotNil(t, resp)
	assert.Equal(t, "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff", downloadLink.URL)
	assert.Equal(t, "2023-09-20T10:31:21+00:00", downloadLink.ExpireIn)
}

func jsonReportStatus() string {
	return `{
		"data": {
			"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
			"status": "finished",
			"progress": 100,
			"attributes": {
				"format": "xlsx",
				"reportName": "costs-estimation",
				"schema": {}
			},
			"createdAt": "2023-09-23T11:26:54+00:00",
			"updatedAt": "2023-09-23T11:26:54+00:00",
			"startedAt": "2023-09-23T11:26:54+00:00",
			"finishedAt": "2023-09-23T11:26:54+00:00"
		}
	}`
}

func TestReportsService_GetUserSettingsTemplate(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/users/1/reports/settings-templates/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "Default template",
				"currency": "USD",
				"unit": "words",
				"config": {
					"baseRates": {
						"fullTranslation": 0.1,
						"proofread": 0.12
					},
					"individualRates": [
						{
							"languageIds": [
								"uk"
							],
							"userIds": [],
							"fullTranslation": 0.1,
							"proofread": 0.12
						}
					],
					"netRateSchemes": {
						"tmMatch": [
								{
									"matchType": "perfect",
									"price": 0.1
								}
							],
						"mtMatch": [
							{
								"matchType": "100",
								"price": 0.1
							}
						],
						"aiMatch": [
							{
								"matchType": "100",
								"price": 0.1
							}
						],
						"suggestionMatch": [
							{
								"matchType": "100",
								"price": 0.1
							}
						]
					}
				},
				"createdAt": "2024-09-23T11:26:54+00:00",
				"updatedAt": "2024-09-23T11:26:54+00:00"
			}
		}`)
	})

	template, resp, err := client.Reports.GetUserSettingsTemplate(context.Background(), 1, 1)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.ReportSettingsTemplate{
		ID:       1,
		Name:     "Default template",
		Currency: "USD",
		Unit:     "words",
		Config: model.ReportSettingsTemplateConfig{
			BaseRates: &model.ReportBaseRates{FullTranslation: 0.1, Proofread: 0.12},
			IndividualRates: []*model.ReportIndividualRates{
				{
					LanguageIDs:     []string{"uk"},
					UserIDs:         []int{},
					FullTranslation: 0.1,
					Proofread:       0.12,
				},
			},
			NetRateSchemes: &model.ReportNetRateSchemes{
				TMMatch:         []model.ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.1}},
				MTMatch:         []model.ReportNetRateSchemeMatch{{MatchType: "100", Price: 0.1}},
				SuggestionMatch: []model.ReportNetRateSchemeMatch{{MatchType: "100", Price: 0.1}},
			},
		},
		CreatedAt: "2024-09-23T11:26:54+00:00",
		UpdatedAt: "2024-09-23T11:26:54+00:00",
	}
	assert.Equal(t, expected, template)
}

func TestReportsService_ListUserSettingsTemplates(t *testing.T) {
	tests := []struct {
		name          string
		opts          *model.ListOptions
		expectedQuery string
	}{
		{
			name:          "nil options",
			opts:          nil,
			expectedQuery: "",
		},
		{
			name:          "empty options",
			opts:          &model.ListOptions{},
			expectedQuery: "",
		},
		{
			name:          "with options",
			opts:          &model.ListOptions{Offset: 10, Limit: 10},
			expectedQuery: "?limit=10&offset=10",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for userID, tt := range tests {
		userID++
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/users/%d/reports/settings-templates", userID)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, "GET")
				testURL(t, r, path+tt.expectedQuery)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 1,
								"name": "Default template"
							}
						},
						{
							"data": {
								"id": 2,
								"name": "Custom template"
							}
						}
					],
					"pagination": {
						"offset": 10,
						"limit": 20
					}
				}`)
			})

			templates, resp, err := client.Reports.ListUserSettingsTemplates(context.Background(), userID, tt.opts)

			require.NoError(t, err)
			assert.Equal(t, 10, resp.Pagination.Offset)
			assert.Equal(t, 20, resp.Pagination.Limit)
			assert.Equal(t, []*model.ReportSettingsTemplate{{ID: 1, Name: "Default template"}, {ID: 2, Name: "Custom template"}}, templates)
		})
	}
}

func TestReportsService_ListUserSettingsTemplates_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/users/1/reports/settings-templates", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Reports.ListUserSettingsTemplates(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestReportsService_AddUserSettingsTemplate(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/users/1/reports/settings-templates"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "POST")
		testURL(t, r, path)
		testJSONBody(t, r, `{
			"name":"Default template",
			"currency":"USD",
			"unit":"words",
			"config":{
				"baseRates":{
					"fullTranslation":0.1,
					"proofread":0.12
				},
				"individualRates":[
					{
						"languageIds":["uk"],
						"userIds":[1],
						"fullTranslation":0.1,
						"proofread":0.12
					}
				],
				"netRateSchemes":{
					"tmMatch":[
						{
							"matchType":"perfect",
							"price":0.1
						}
					],
					"mtMatch":[
						{
							"matchType":"100",
							"price":0.1
						}
					],
					"suggestionMatch":[
						{
							"matchType":"100",
							"price":0.1
						}
					]
				}
			}
		}`)

		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "Default template"
			}
		}`)
	})

	req := &model.ReportSettingsTemplateAddRequest{
		Name:     "Default template",
		Currency: "USD",
		Unit:     model.ReportUnitWords,
		Config: &model.ReportSettingsTemplateConfig{
			BaseRates: &model.ReportBaseRates{
				FullTranslation: 0.1,
				Proofread:       0.12,
			},
			IndividualRates: []*model.ReportIndividualRates{
				{
					LanguageIDs:     []string{"uk"},
					UserIDs:         []int{1},
					FullTranslation: 0.1,
					Proofread:       0.12,
				},
			},
			NetRateSchemes: &model.ReportNetRateSchemes{
				TMMatch:         []model.ReportNetRateSchemeMatch{{MatchType: "perfect", Price: 0.1}},
				MTMatch:         []model.ReportNetRateSchemeMatch{{MatchType: "100", Price: 0.1}},
				SuggestionMatch: []model.ReportNetRateSchemeMatch{{MatchType: "100", Price: 0.1}},
			},
		},
	}
	template, resp, err := client.Reports.AddUserSettingsTemplate(context.Background(), 1, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.ReportSettingsTemplate{ID: 1, Name: "Default template"}
	assert.Equal(t, expected, template)
}

func TestReportsService_EditUserSettingsTemplate(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/users/1/reports/settings-templates/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "PATCH")
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/name","value":"New name"},{"op":"replace","path":"/currency","value":"USD"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"name": "New name",
				"currency": "USD"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    model.OpReplace,
			Path:  "/name",
			Value: "New name",
		},
		{
			Op:    model.OpReplace,
			Path:  "/currency",
			Value: "USD",
		},
	}
	template, resp, err := client.Reports.EditUserSettingsTemplate(context.Background(), 1, 2, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.ReportSettingsTemplate{ID: 2, Name: "New name", Currency: "USD"}
	assert.Equal(t, expected, template)
}

func TestReportsService_DeleteUserSettingsTemplate(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/users/1/reports/settings-templates/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "DELETE")
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Reports.DeleteUserSettingsTemplate(context.Background(), 1, 2)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}
