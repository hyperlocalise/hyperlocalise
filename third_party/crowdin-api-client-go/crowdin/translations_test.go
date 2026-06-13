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

func TestTranslationsService_PreTranslationStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/pre-translations/9e7de270-4f83-41cb-b606-2f90631f26e2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"identifier": "9e7de270-4f83-41cb-b606-2f90631f26e2",
				"status": "created",
				"progress": 90,
				"attributes": {
					"languageIds": ["uk"],
					"fileIds": [742],
					"method": "tm",
					"engineId": 1,
					"aiPromptId": 2,
					"autoApproveOption": "all",
					"duplicateTranslations": true,
					"skipApprovedTranslations": true,
					"translateUntranslatedOnly": true,
					"translateWithPerfectMatchOnly": true,
					"translateWithSoftMatchOnly": true,
					"fallbackLanguages": {
						"es": ["en"]
					},
					"labelIds": [3],
					"excludeLabelIds": [4]
				},
				"createdAt": "2023-09-20T14:05:50+00:00",
				"updatedAt": "2023-09-20T14:05:50+00:00",
				"startedAt": "2023-08-24T14:15:22Z",
				"finishedAt": "2023-08-24T14:15:22Z",
				"eta": "10s"
			}
		}`)
	})

	status, resp, err := client.Translations.PreTranslationStatus(context.Background(), 1, "9e7de270-4f83-41cb-b606-2f90631f26e2")
	require.NoError(t, err)

	expected := &model.PreTranslation{
		Identifier: "9e7de270-4f83-41cb-b606-2f90631f26e2",
		Status:     "created",
		Progress:   90,
		Attributes: &model.PreTranslationAttributes{
			LanguageIDs:                   []string{"uk"},
			FileIDs:                       []int{742},
			Method:                        ToPtr("tm"),
			EngineID:                      ToPtr(1),
			AIPromptID:                    ToPtr(2),
			AutoApproveOption:             ToPtr("all"),
			DuplicateTranslations:         ToPtr(true),
			SkipApprovedTranslations:      ToPtr(true),
			TranslateUntranslatedOnly:     ToPtr(true),
			TranslateWithPerfectMatchOnly: ToPtr(true),
			TranslateWithSoftMatchOnly:    ToPtr(true),
			FallbackLanguages: map[string][]string{
				"es": {"en"},
			},
			LabelIDs:        []int{3},
			ExcludeLabelIDs: []int{4},
		},
		CreatedAt:  "2023-09-20T14:05:50+00:00",
		UpdatedAt:  "2023-09-20T14:05:50+00:00",
		StartedAt:  "2023-08-24T14:15:22Z",
		FinishedAt: "2023-08-24T14:15:22Z",
		ETA:        "10s",
	}
	assert.Equal(t, expected, status)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestTranslationsService_PreTranslationReport(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/pre-translations/9e7de270-4f83-41cb-b606-2f90631f26e2/reports"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
    			"data": {
    				"languages": [
    					{
    						"id": "es",
    						"files": [
    							{
    								"id": "10191",
    								"statistics": {
    									"phrases": 6,
    									"words": 13
    								}
    							}
    						],
    						"skipped": {
    							"translation_eq_source": 2,
    							"qa_check": 1,
    							"hidden_strings": 0,
    							"ai_error": 6
    						},
    						"skippedQaCheckCategories": {
    							"duplicate": 1,
    							"spellcheck": 1
    						}
    					}
    				],
    				"preTranslateType": "ai"
    			}
    		}`)
	})

	report, resp, err := client.Translations.PreTranslationReport(context.Background(), 1, "9e7de270-4f83-41cb-b606-2f90631f26e2")
	require.NoError(t, err)

	expected := &model.PreTranslationReport{
		Languages: []*model.LanguageReport{
			{
				ID: "es",
				Files: []*model.LanguageReportFile{
					{
						ID: "10191",
						Statistics: &model.LanguageReportStatistics{
							Phrases: 6,
							Words:   13,
						},
					},
				},
				Skipped: &model.LanguageReportSkipped{
					TranslationEQSource: 2,
					QACheck:             1,
					HiddenStrings:       0,
					AIError:             6,
				},
				SkippedQaCheckCategories: &model.LanguageReportSkippedQaCheckCategories{
					Duplicate:  1,
					Spellcheck: 1,
				},
			},
		},
		PreTranslateType: "ai",
	}

	assert.Equal(t, expected, report)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestTranslationsService_ListPreTranslations(t *testing.T) {
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
			name: "with options",
			opts: &model.ListOptions{
				Offset: 10,
				Limit:  25,
			},
			expectedQuery: "?limit=25&offset=10",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for projectID, tt := range tests {
		path := fmt.Sprintf("/api/v2/projects/%d/pre-translations", projectID)
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, http.MethodGet)
			testURL(t, r, path+tt.expectedQuery)

			fmt.Fprint(w, `{
				"data": [
					{
						"data": {
							"identifier": "9e7de270-4f83-41cb-b606-603627bfac41",
							"status": "finished",
							"progress": 100,
							"attributes": {
								"method": "tm",
								"branchIds": [2],
								"languageIds": ["en", "de"],
								"engineId": null,
								"aiPromptId": null,
								"excludeLabelIds": null,
								"autoApproveOption": null,
								"fallbackLanguages": null,
								"duplicateTranslations": null,
								"skipApprovedTranslations": null,
								"translateUntranslatedOnly": null,
								"translateWithPerfectMatchOnly": null
							},
							"createdAt": "2024-11-10T19:14:37+00:00",
							"updatedAt": "2024-11-10T19:14:45+00:00",
							"startedAt": "2024-11-10T19:14:37+00:00",
							"finishedAt": "2024-11-10T19:14:45+00:00"
						}
					}
				],
				"pagination": {
					"offset": 0,
					"limit": 25
				}
			}`)
		})

		preTranslations, resp, err := client.Translations.ListPreTranslations(context.Background(), projectID, tt.opts)
		require.NoError(t, err)

		expected := []*model.PreTranslation{
			{
				Identifier: "9e7de270-4f83-41cb-b606-603627bfac41",
				Status:     "finished",
				Progress:   100,
				Attributes: &model.PreTranslationAttributes{
					BranchIDs:                     []int{2},
					LanguageIDs:                   []string{"en", "de"},
					FileIDs:                       nil,
					Method:                        ToPtr("tm"),
					EngineID:                      nil,
					AIPromptID:                    nil,
					AutoApproveOption:             nil,
					DuplicateTranslations:         nil,
					SkipApprovedTranslations:      nil,
					TranslateUntranslatedOnly:     nil,
					TranslateWithPerfectMatchOnly: nil,
					FallbackLanguages:             nil,
					LabelIDs:                      nil,
					ExcludeLabelIDs:               nil,
				},
				CreatedAt:  "2024-11-10T19:14:37+00:00",
				UpdatedAt:  "2024-11-10T19:14:45+00:00",
				StartedAt:  "2024-11-10T19:14:37+00:00",
				FinishedAt: "2024-11-10T19:14:45+00:00",
			},
		}
		assert.Len(t, expected, 1)
		assert.Equal(t, expected, preTranslations)

		assert.Equal(t, 0, resp.Pagination.Offset)
		assert.Equal(t, 25, resp.Pagination.Limit)
	}
}

func TestTranslationsService_EditPreTranslations(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/pre-translations/9e7de270-4f83-41cb-b606-2f90631f26e2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/status","value":"created"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"identifier": "9e7de270-4f83-41cb-b606-2f90631f26e2",
				"status": "created",
				"progress": 90,
				"attributes": {
					"languageIds": ["uk"],
					"fileIds": [742],
					"method": "tm",
					"autoApproveOption": "all",
					"duplicateTranslations": true,
					"skipApprovedTranslations": true,
					"translateUntranslatedOnly": true,
					"translateWithPerfectMatchOnly": true
				},
				"createdAt": "2023-09-20T14:05:50+00:00",
				"updatedAt": "2023-09-20T14:05:50+00:00",
				"startedAt": "2023-08-24T14:15:22Z",
				"finishedAt": "2023-08-24T14:15:22Z"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/status",
			Value: "created",
		},
	}
	distribution, resp, err := client.Translations.EditPreTranslation(context.Background(), 1, "9e7de270-4f83-41cb-b606-2f90631f26e2", req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.PreTranslation{
		Identifier: "9e7de270-4f83-41cb-b606-2f90631f26e2",
		Status:     "created",
		Progress:   90,
		Attributes: &model.PreTranslationAttributes{
			LanguageIDs:                   []string{"uk"},
			FileIDs:                       []int{742},
			Method:                        ToPtr("tm"),
			AutoApproveOption:             ToPtr("all"),
			DuplicateTranslations:         ToPtr(true),
			SkipApprovedTranslations:      ToPtr(true),
			TranslateUntranslatedOnly:     ToPtr(true),
			TranslateWithPerfectMatchOnly: ToPtr(true),
		},
		CreatedAt:  "2023-09-20T14:05:50+00:00",
		UpdatedAt:  "2023-09-20T14:05:50+00:00",
		StartedAt:  "2023-08-24T14:15:22Z",
		FinishedAt: "2023-08-24T14:15:22Z",
	}
	assert.Equal(t, expected, distribution)
}

func TestTranslationsService_ApplyPreTranslation(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/pre-translations"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)

		expectedReqBody := `{
			"languageIds": ["uk"],
			"fileIds": [742],
			"method": "tm",
			"engineId": 1,
			"autoApproveOption": "all",
			"duplicateTranslations": true,
			"skipApprovedTranslations": true,
			"translateUntranslatedOnly": false,
			"translateWithPerfectMatchOnly": true,
			"translateWithSoftMatchOnly": true,
			"fallbackLanguages": {
			  	"languageId": ["uk"]
			},
			"labelIds": [1],
			"excludeLabelIds": [2]
		}`
		testJSONBody(t, r, expectedReqBody)

		w.WriteHeader(http.StatusAccepted)
		fmt.Fprint(w, `{
			"data": {
				"identifier": "9e7de270-4f83-41cb-b606-2f90631f26e2",
				"status": "created",
				"progress": 90,
				"attributes": {
					"languageIds": ["uk"],
					"fileIds": [742],
					"method": "tm",
					"engineId": 1,
					"autoApproveOption": "all",
					"duplicateTranslations": true,
					"skipApprovedTranslations": true,
					"translateUntranslatedOnly": false,
					"translateWithPerfectMatchOnly": true,
					"translateWithSoftMatchOnly": true,
					"fallbackLanguages": {
						"languageId": ["uk"]
					},
					"labelIds": [1],
					"excludeLabelIds": [2]
				},
				"createdAt": "2023-09-20T14:05:50+00:00",
				"updatedAt": "2023-09-20T14:05:50+00:00",
				"startedAt": "2023-08-24T14:15:22Z",
				"finishedAt": "2023-08-24T14:15:22Z"
			}
		}`)
	})

	req := &model.PreTranslationRequest{
		LanguageIDs:                   []string{"uk"},
		FileIDs:                       []int{742},
		Method:                        "tm",
		EngineID:                      ToPtr(1),
		AutoApproveOption:             "all",
		DuplicateTranslations:         ToPtr(true),
		SkipApprovedTranslations:      ToPtr(true),
		TranslateUntranslatedOnly:     ToPtr(false),
		TranslateWithPerfectMatchOnly: ToPtr(true),
		TranslateWithSoftMatchOnly:    ToPtr(true),
		FallbackLanguages: map[string][]string{
			"languageId": {"uk"},
		},
		LabelIDs:        []int{1},
		ExcludeLabelIDs: []int{2},
	}
	preTranslation, resp, err := client.Translations.ApplyPreTranslation(context.Background(), 1, req)
	require.NoError(t, err)

	expected := &model.PreTranslation{
		Identifier: "9e7de270-4f83-41cb-b606-2f90631f26e2",
		Status:     "created",
		Progress:   90,
		Attributes: &model.PreTranslationAttributes{
			LanguageIDs:                   []string{"uk"},
			FileIDs:                       []int{742},
			Method:                        ToPtr("tm"),
			EngineID:                      ToPtr(1),
			AIPromptID:                    nil,
			AutoApproveOption:             ToPtr("all"),
			DuplicateTranslations:         ToPtr(true),
			SkipApprovedTranslations:      ToPtr(true),
			TranslateUntranslatedOnly:     ToPtr(false),
			TranslateWithPerfectMatchOnly: ToPtr(true),
			TranslateWithSoftMatchOnly:    ToPtr(true),
			FallbackLanguages: map[string][]string{
				"languageId": {"uk"},
			},
			LabelIDs:        []int{1},
			ExcludeLabelIDs: []int{2},
		},
		CreatedAt:  "2023-09-20T14:05:50+00:00",
		UpdatedAt:  "2023-09-20T14:05:50+00:00",
		StartedAt:  "2023-08-24T14:15:22Z",
		FinishedAt: "2023-08-24T14:15:22Z",
	}
	assert.Equal(t, expected, preTranslation)
	assert.Equal(t, http.StatusAccepted, resp.StatusCode)
}

func TestTranslationsService_ApplyPreTranslation_WithRequiredFields(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/pre-translations", func(w http.ResponseWriter, r *http.Request) {
		testBody(t, r, `{"languageIds":["uk"],"fileIds":[742]}`+"\n")
		fmt.Fprint(w, `{}`)
	})

	req := &model.PreTranslationRequest{
		LanguageIDs: []string{"uk"},
		FileIDs:     []int{742},
	}
	_, _, err := client.Translations.ApplyPreTranslation(context.Background(), 1, req)
	require.NoError(t, err)
}

func TestTranslationsService_BuildProjectDirectoryTranslation(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/translations/builds/directories/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)

		expectedReqBody := `{
			"targetLanguageIds": ["uk"],
			"skipUntranslatedStrings": false,
			"skipUntranslatedFiles": false,
			"preserveFolderHierarchy": false,
			"labelIds": [10],
			"exportWithMinApprovalsCount": 0,
			"exportStringsThatPassedWorkflow": true
		}`
		testJSONBody(t, r, expectedReqBody)

		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"projectId": 2,
				"status": "finished",
				"progress": 100,
				"createdAt": "2023-09-19T15:10:43+00:00",
				"updatedAt": "2023-09-19T15:10:46+00:00",
				"finishedAt": "2023-09-19T15:10:46+00:00"
			}
		}`)
	})

	req := &model.BuildProjectDirectoryTranslationRequest{
		TargetLanguageIDs:               []string{"uk"},
		SkipUntranslatedStrings:         ToPtr(false),
		SkipUntranslatedFiles:           ToPtr(false),
		ExportApprovedOnly:              ToPtr(false),
		ExportWithMinApprovalsCount:     ToPtr(0),
		ExportStringsThatPassedWorkflow: ToPtr(true),
		PreserveFolderHierarchy:         ToPtr(false),
		LabelIDs:                        []int{10},
	}
	buildTranslation, resp, err := client.Translations.BuildProjectDirectoryTranslation(context.Background(), 1, 2, req)
	require.NoError(t, err)

	expected := &model.BuildProjectDirectoryTranslation{
		ID:         2,
		ProjectID:  2,
		Status:     "finished",
		Progress:   100,
		CreatedAt:  "2023-09-19T15:10:43+00:00",
		UpdatedAt:  "2023-09-19T15:10:46+00:00",
		FinishedAt: "2023-09-19T15:10:46+00:00",
	}
	assert.Equal(t, expected, buildTranslation)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
}

func TestTranslationsService_BuildProjectFileTranslation(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const (
		etag = "ebd69a1b7e4c23e6d17891a491c94f832e0c82e4692dedb35a6cd1e624b62"
		path = "/api/v2/projects/1/translations/builds/files/2"
	)
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testHeader(t, r, "If-None-Match", etag)

		expectedReqBody := `{
			"targetLanguageId": "uk",
			"skipUntranslatedStrings": true,
			"skipUntranslatedFiles": false,
			"exportWithMinApprovalsCount": 0,
			"exportStringsThatPassedWorkflow": true
		}`
		testJSONBody(t, r, expectedReqBody)

		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{
			"data": {
				"url": "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff?response-content-disposition=attachment",
				"expireIn": "2023-09-20T10:31:21+00:00",
				"etag": "ebd69a1b7e4c23e6d17891a491c94f832e0c82e4692dedb35a6cd1e624b62"
			}
		}`)
	})

	req := &model.BuildProjectFileTranslationRequest{
		TargetLanguageID:                "uk",
		SkipUntranslatedStrings:         ToPtr(true),
		SkipUntranslatedFiles:           ToPtr(false),
		ExportApprovedOnly:              ToPtr(false),
		ExportWithMinApprovalsCount:     ToPtr(0),
		ExportStringsThatPassedWorkflow: ToPtr(true),
	}
	downloadLink, resp, err := client.Translations.BuildProjectFileTranslation(context.Background(), 1, 2, req, etag)
	require.NoError(t, err)

	expected := &model.DownloadLink{
		URL:      "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff?response-content-disposition=attachment",
		ExpireIn: "2023-09-20T10:31:21+00:00",
		Etag:     ToPtr(etag),
	}
	assert.Equal(t, expected, downloadLink)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestTranslationsService_BuildProjectFileTranslation_WithRequiredFields(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/translations/builds/files/2", func(w http.ResponseWriter, r *http.Request) {
		testBody(t, r, `{"targetLanguageId":"uk"}`+"\n")
		testHeader(t, r, "If-None-Match", "")

		fmt.Fprint(w, `{}`)
	})

	req := &model.BuildProjectFileTranslationRequest{TargetLanguageID: "uk"}
	_, _, err := client.Translations.BuildProjectFileTranslation(context.Background(), 1, 2, req, "")
	require.NoError(t, err)
}

func TestTranslationsService_ListProjectBuilds(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	cases := []struct {
		name     string
		opts     *model.TranslationsBuildsListOptions
		expected string
	}{
		{
			name:     "nil options",
			opts:     nil,
			expected: "",
		},
		{
			name:     "empty options",
			opts:     &model.TranslationsBuildsListOptions{},
			expected: "",
		},
		{
			name: "with options",
			opts: &model.TranslationsBuildsListOptions{
				BranchID:    1,
				ListOptions: model.ListOptions{Limit: 10, Offset: 5},
			},
			expected: "?branchId=1&limit=10&offset=5",
		},
	}

	for projectID, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/projects/%d/translations/builds", projectID)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodGet)
				testURL(t, r, path+tt.expected)

				fmt.Fprint(w, `{
				"data": [
					{
						"data": {
							"id": 2,
							"projectId": 2,
							"status": "finished",
							"progress": 100,
							"createdAt": "2023-09-19T15:10:43+00:00",
							"updatedAt": "2023-09-19T15:10:46+00:00",
							"finishedAt": "2023-09-19T15:10:46+00:00",
							"attributes": {
								"branchId": 1,
								"targetLanguageIds": ["en"],
								"skipUntranslatedStrings": false,
								"skipUntranslatedFiles": false,
								"exportWithMinApprovalsCount": 0,
								"exportStringsThatPassedWorkflow": true,
								"labelIds": [30]
							}
						}
					}
				],
				"pagination": {
					"offset": 5,
					"limit": 10
				}
			}`)
			})

			builds, resp, err := client.Translations.ListProjectBuilds(context.Background(), projectID, tt.opts)
			require.NoError(t, err)

			expected := []*model.TranslationsProjectBuild{
				{
					ID:         2,
					ProjectID:  2,
					Status:     "finished",
					Progress:   100,
					CreatedAt:  "2023-09-19T15:10:43+00:00",
					UpdatedAt:  "2023-09-19T15:10:46+00:00",
					FinishedAt: "2023-09-19T15:10:46+00:00",
					Attributes: &model.BuildAttributes{
						BranchID:                        ToPtr(1),
						TargetLanguageIDs:               []string{"en"},
						SkipUntranslatedStrings:         ToPtr(false),
						SkipUntranslatedFiles:           ToPtr(false),
						ExportWithMinApprovalsCount:     ToPtr(0),
						ExportStringsThatPassedWorkflow: ToPtr(true),
						LabelIDs:                        []int{30},
					},
				},
			}
			assert.Equal(t, expected, builds)

			expectedPagination := model.Pagination{Offset: 5, Limit: 10}
			assert.Equal(t, expectedPagination, resp.Pagination)
		})
	}
}

func TestTranslationsService_ListProjectBuilds_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/translations/build", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Translations.ListProjectBuilds(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestTranslationsService_BuildProjectTranslation(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	cases := []struct {
		name     string
		req      model.BuildProjectTranslationRequester
		expected string
	}{
		{
			name: "CrowdinTranslationCreateProjectBuildForm",
			req: &model.BuildProjectRequest{
				BranchID:                1,
				TargetLanguageIDs:       []string{"uk"},
				SkipUntranslatedStrings: ToPtr(true),
				SkipUntranslatedFiles:   ToPtr(false),
				ExportApprovedOnly:      ToPtr(true),
				LabelIDs:                []int{20},

				ExportStringsThatPassedWorkflow: ToPtr(false),
			},
			expected: `{
				"branchId": 1,
				"targetLanguageIds": ["uk"],
				"skipUntranslatedStrings": true,
				"skipUntranslatedFiles": false,
				"exportWithMinApprovalsCount": 1,
				"exportStringsThatPassedWorkflow": false,
				"labelIds": [20]
			}`,
		},
		{
			name: "TranslationCreateProjectPseudoBuildForm",
			req: &model.PseudoBuildProjectRequest{
				Pseudo:               ToPtr(true),
				BranchID:             1,
				Prefix:               "pseudo",
				Suffix:               "pseudo",
				LengthTransformation: ToPtr(0),
				CharTransformation:   "european",
			},
			expected: `{
				"pseudo": true,
				"branchId": 1,
				"prefix": "pseudo",
				"suffix": "pseudo",
				"lengthTransformation": 0,
				"charTransformation": "european"
			}`,
		},
	}

	for projectID, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/projects/%d/translations/builds", projectID)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodPost)
				testURL(t, r, path)
				testJSONBody(t, r, tt.expected)

				w.WriteHeader(http.StatusCreated)
				fmt.Fprint(w, `{
					"data": {
						"id": 2,
						"projectId": 2,
						"status": "finished",
						"progress": 100,
						"createdAt": "2023-09-19T15:10:43+00:00",
						"updatedAt": "2023-09-19T15:10:46+00:00",
						"finishedAt": "2023-09-19T15:10:46+00:00",
						"attributes": {
							"branchId": 1,
							"targetLanguageIds": ["en"],
							"skipUntranslatedStrings": false,
							"skipUntranslatedFiles": false,
							"exportWithMinApprovalsCount": 0,
							"exportStringsThatPassedWorkflow": true,
							"labelIds": [30]
						}
					}
				}`)
			})

			build, resp, err := client.Translations.BuildProjectTranslation(context.Background(), projectID, tt.req)
			require.NoError(t, err)

			expected := &model.TranslationsProjectBuild{
				ID:         2,
				ProjectID:  2,
				Status:     "finished",
				Progress:   100,
				CreatedAt:  "2023-09-19T15:10:43+00:00",
				UpdatedAt:  "2023-09-19T15:10:46+00:00",
				FinishedAt: "2023-09-19T15:10:46+00:00",

				Attributes: &model.BuildAttributes{
					BranchID:                        ToPtr(1),
					TargetLanguageIDs:               []string{"en"},
					SkipUntranslatedStrings:         ToPtr(false),
					SkipUntranslatedFiles:           ToPtr(false),
					ExportWithMinApprovalsCount:     ToPtr(0),
					ExportStringsThatPassedWorkflow: ToPtr(true),
					LabelIDs:                        []int{30},
				},
			}
			assert.Equal(t, expected, build)
			assert.Equal(t, http.StatusCreated, resp.StatusCode)
		})
	}
}

func TestTranslationsService_BuildProjectTranslation_WithValidationError(t *testing.T) {
	cases := []struct {
		name          string
		req           model.BuildProjectTranslationRequester
		expectedError string
	}{
		{
			name:          "nil request",
			req:           nil,
			expectedError: "body cannot be nil",
		},
		{
			name: "skipUntranslatedStrings and skipUntranslatedFiles are true",
			req: &model.BuildProjectRequest{
				SkipUntranslatedStrings: ToPtr(true),
				SkipUntranslatedFiles:   ToPtr(true),
			},
			expectedError: "`skipUntranslatedStrings` and `skipUntranslatedFiles` must not be true at the same request",
		},
		{
			name: "exportWithMinApprovalsCount and exportStringsThatPassedWorkflow are true",
			req: &model.BuildProjectRequest{
				ExportWithMinApprovalsCount:     ToPtr(1),
				ExportStringsThatPassedWorkflow: ToPtr(true),
			},
			expectedError: "`exportWithMinApprovalsCount` and `exportStringsThatPassedWorkflow` must not be true at the same request",
		},
		{
			name: "lengthTransformation is out of range",
			req: &model.PseudoBuildProjectRequest{
				LengthTransformation: ToPtr(1000),
			},
			expectedError: "lengthTransformation must be from -50 to 100",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for projectID, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/projects/%d/translations/builds", projectID)
			mux.HandleFunc(path, func(w http.ResponseWriter, _ *http.Request) {
				fmt.Fprint(w, `{}`)
			})

			_, _, err := client.Translations.BuildProjectTranslation(context.Background(), projectID, tt.req)
			assert.EqualError(t, err, tt.expectedError)
		})
	}
}

func TestTranslationsService_UploadTranslations(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/translations/uk"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testJSONBody(t, r, `{
			"storageId": 34,
			"fileId": 56,
			"importEqSuggestions": true,
			"autoApproveImported": false,
			"translateHidden": false,
			"addToTm": false,
			"markAddedAsDone": true
		}`)

		fmt.Fprint(w, `{
			"data": {
				"projectId": 8,
				"storageId": 34,
				"languageId": "uk",
				"fileId": 56
			}
		}`)
	})

	req := &model.UploadTranslationsRequest{
		StorageID:           34,
		FileID:              56,
		ImportEqSuggestions: ToPtr(true),
		AutoApproveImported: ToPtr(false),
		TranslateHidden:     ToPtr(false),
		AddToTM:             ToPtr(false),
		MarkAddedAsDone:     ToPtr(true),
	}
	assert.NoError(t, req.Validate())

	t.Run("validation error", func(t *testing.T) {
		req := &model.UploadTranslationsRequest{
			StorageID: 34,
			FileID:    56,
			BranchID:  78,
		}
		assert.Error(t, req.Validate())

		req = &model.UploadTranslationsRequest{
			StorageID:   34,
			FileID:      56,
			DirectoryID: 90,
		}
		assert.Error(t, req.Validate())

		req = &model.UploadTranslationsRequest{
			StorageID:   34,
			BranchID:    78,
			DirectoryID: 90,
		}
		assert.NoError(t, req.Validate())
	})
	uploadTranslations, resp, err := client.Translations.UploadTranslations(context.Background(), 1, "uk", req)
	require.NoError(t, err)

	expected := &model.UploadTranslations{
		ProjectID:  8,
		StorageID:  34,
		LanguageID: "uk",
		FileID:     56,
	}
	assert.Equal(t, expected, uploadTranslations)
	require.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestTranslationsService_DownloadProjectTranslations(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/translations/builds/2/download"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"url": "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff?response-content-disposition=attachment",
				"expireIn": "2023-09-20T10:31:21+00:00"
			}
		}`)
	})

	downloadLink, resp, err := client.Translations.DownloadProjectTranslations(context.Background(), 1, 2)
	require.NoError(t, err)

	expected := &model.DownloadLink{
		URL:      "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff?response-content-disposition=attachment",
		ExpireIn: "2023-09-20T10:31:21+00:00",
	}
	assert.Equal(t, expected, downloadLink)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestTranslationsService_CheckBuildStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/translations/builds/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"projectId": 2,
				"status": "finished",
				"progress": 100,
				"createdAt": "2023-09-19T15:10:43+00:00",
				"updatedAt": "2023-09-19T15:10:46+00:00",
				"finishedAt": "2023-09-19T15:10:46+00:00",
				"attributes": {
					"branchId": 1,
					"targetLanguageIds": ["en"],
					"skipUntranslatedStrings": false,
					"skipUntranslatedFiles": false,
					"exportWithMinApprovalsCount": 0,
					"exportStringsThatPassedWorkflow": true,
					"labelIds": [30]
				}
			}
		}`)
	})

	build, resp, err := client.Translations.CheckBuildStatus(context.Background(), 1, 2)
	require.NoError(t, err)

	expected := &model.TranslationsProjectBuild{
		ID:         2,
		ProjectID:  2,
		Status:     "finished",
		Progress:   100,
		CreatedAt:  "2023-09-19T15:10:43+00:00",
		UpdatedAt:  "2023-09-19T15:10:46+00:00",
		FinishedAt: "2023-09-19T15:10:46+00:00",
		Attributes: &model.BuildAttributes{
			BranchID:                        ToPtr(1),
			TargetLanguageIDs:               []string{"en"},
			SkipUntranslatedStrings:         ToPtr(false),
			SkipUntranslatedFiles:           ToPtr(false),
			ExportWithMinApprovalsCount:     ToPtr(0),
			ExportStringsThatPassedWorkflow: ToPtr(true),
			LabelIDs:                        []int{30},
		},
	}
	assert.Equal(t, expected, build)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestTranslationsService_CancelBuild(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/translations/builds/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Translations.CancelBuild(context.Background(), 1, 2)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestTranslationsService_ExportProjectTranslation(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/translations/exports"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)

		expectedReqBody := `{
			"targetLanguageId": "uk",
			"format": "xliff",
			"labelIds": [1],
			"branchIds": [2],
			"directoryIds": [3],
			"fileIds": [4],
			"skipUntranslatedStrings": false,
			"skipUntranslatedFiles": false
		}`
		testJSONBody(t, r, expectedReqBody)

		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{
			"data": {
				"url": "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff?response-content-disposition",
				"expireIn": "2023-09-20T10:31:21+00:00"
			}
		}`)
	})

	req := &model.ExportTranslationRequest{
		TargetLanguageID:        "uk",
		Format:                  "xliff",
		LabelIDs:                []int{1},
		BranchIDs:               []int{2},
		DirectoryIDs:            []int{3},
		FileIDs:                 []int{4},
		SkipUntranslatedStrings: ToPtr(false),
		SkipUntranslatedFiles:   ToPtr(false),
		ExportApprovedOnly:      ToPtr(false),
	}
	downloadLink, resp, err := client.Translations.ExportProjectTranslation(context.Background(), 1, req)
	require.NoError(t, err)

	expected := &model.DownloadLink{
		URL:      "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff?response-content-disposition",
		ExpireIn: "2023-09-20T10:31:21+00:00",
	}
	assert.Equal(t, expected, downloadLink)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}
