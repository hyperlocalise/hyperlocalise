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

func TestBundlesService_Get(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/bundles/3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "Resx bundle",
				"format": "crowdin-resx",
				"sourcePatterns": [
					"/master"
				],
				"ignorePatterns": [
					"/masterBranch"
				],
				"exportPattern": "strings-two_letters_code%.resx",
				"isMultilingual": false,
				"includeProjectSourceLanguage": false,
				"labelIds": [13, 27],
				"webUrl": "https://crowdin.com/project/test/translations#bundles:100",
				"excludeLabelIds": [5, 8],
				"createdAt": "2023-09-20T11:11:05+00:00",
				"updatedAt": "2023-09-20T12:22:20+00:00"
			}
		}`)
	})

	bundle, resp, err := client.Bundles.Get(context.Background(), 2, 3)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Bundle{
		ID:                           1,
		Name:                         "Resx bundle",
		Format:                       "crowdin-resx",
		SourcePatterns:               []string{"/master"},
		IgnorePatterns:               []string{"/masterBranch"},
		ExportPattern:                "strings-two_letters_code%.resx",
		IsMultilingual:               false,
		IncludeProjectSourceLanguage: false,
		LabelIDs:                     []int{13, 27},
		ExcludeLabelIDs:              []int{5, 8},
		WebURL:                       "https://crowdin.com/project/test/translations#bundles:100",
		CreatedAt:                    "2023-09-20T11:11:05+00:00",
		UpdatedAt:                    "2023-09-20T12:22:20+00:00",
	}
	assert.Equal(t, expected, bundle)
}

func TestBundlesService_Get_NotFound(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/bundles/11111"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		http.Error(w, `{"error": {"code": 404, "message": "Bundle Not Found"}}`, http.StatusNotFound)
	})

	bundle, resp, err := client.Bundles.Get(context.Background(), 2, 11111)
	require.Error(t, err)

	var errResponse *model.ErrorResponse
	assert.ErrorAs(t, err, &errResponse)
	assert.Equal(t, "404 Bundle Not Found", errResponse.Error())

	assert.Nil(t, bundle)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestBundlesService_List(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/bundles"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path+"?limit=25&offset=1")

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 1,
						"name": "Resx bundle",
						"format": "crowdin-resx",
						"sourcePatterns": [
							"/master"
						],
						"ignorePatterns": [
							"/masterBranch"
						],
						"exportPattern": "strings-two_letters_code%.resx",
						"isMultilingual": false,
						"includeProjectSourceLanguage": false,
						"labelIds": [13, 27],
						"excludeLabelIds": [5, 8],
						"webUrl": "https://crowdin.com/project/test/translations#bundles:100",
						"createdAt": "2023-09-20T11:11:05+00:00",
						"updatedAt": "2023-09-20T12:22:20+00:00"
					}
				}
			],
			"pagination": {
				"offset": 1,
				"limit": 25
			}
		}`)
	})

	opts := &model.ListOptions{Limit: 25, Offset: 1}
	bundle, resp, err := client.Bundles.List(context.Background(), 2, opts)
	require.NoError(t, err)

	expected := []*model.Bundle{
		{
			ID:                           1,
			Name:                         "Resx bundle",
			Format:                       "crowdin-resx",
			SourcePatterns:               []string{"/master"},
			IgnorePatterns:               []string{"/masterBranch"},
			ExportPattern:                "strings-two_letters_code%.resx",
			IsMultilingual:               false,
			IncludeProjectSourceLanguage: false,
			LabelIDs:                     []int{13, 27},
			ExcludeLabelIDs:              []int{5, 8},
			WebURL:                       "https://crowdin.com/project/test/translations#bundles:100",
			CreatedAt:                    "2023-09-20T11:11:05+00:00",
			UpdatedAt:                    "2023-09-20T12:22:20+00:00",
		},
	}
	assert.Equal(t, expected, bundle)

	assert.Equal(t, 1, resp.Pagination.Offset)
	assert.Equal(t, 25, resp.Pagination.Limit)
}

func TestBundlesService_List_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/bundles", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Bundles.List(context.Background(), 2, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestBundlesService_Add(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/bundles"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testJSONBody(t, r, `{
			"name":"Resx bundle",
			"format":"crowdin-resx",
			"sourcePatterns":["/master"],
			"ignorePatterns":["/masterBranch"],
			"exportPattern":"strings-two_letters_code%.resx",
			"isMultilingual":false,
			"includeProjectSourceLanguage":false,
			"labelIds":[13,27],
			"excludeLabelIds":[5,8]
		}`)

		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "Resx bundle",
				"format": "crowdin-resx",
				"sourcePatterns": [
					"/master"
				],
				"ignorePatterns": [
					"/masterBranch"
				],
				"exportPattern": "strings-two_letters_code%.resx",
				"isMultilingual": false,
				"includeProjectSourceLanguage": false,
				"labelIds": [13, 27],
				"excludeLabelIds": [5, 8],
				"webUrl": "https://crowdin.com/project/test/translations#bundles:100",
				"createdAt": "2023-09-20T11:11:05+00:00",
				"updatedAt": "2023-09-20T12:22:20+00:00"
			}
		}`)
	})

	req := &model.BundleAddRequest{
		Name:                         "Resx bundle",
		Format:                       "crowdin-resx",
		SourcePatterns:               []string{"/master"},
		IgnorePatterns:               []string{"/masterBranch"},
		ExportPattern:                "strings-two_letters_code%.resx",
		IsMultilingual:               ToPtr(false),
		IncludeProjectSourceLanguage: ToPtr(false),
		LabelIDs:                     []int{13, 27},
		ExcludeLabelIDs:              []int{5, 8},
	}
	bundle, resp, err := client.Bundles.Add(context.Background(), 2, req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	expected := &model.Bundle{
		ID:                           1,
		Name:                         "Resx bundle",
		Format:                       "crowdin-resx",
		SourcePatterns:               []string{"/master"},
		IgnorePatterns:               []string{"/masterBranch"},
		ExportPattern:                "strings-two_letters_code%.resx",
		IsMultilingual:               false,
		IncludeProjectSourceLanguage: false,
		LabelIDs:                     []int{13, 27},
		ExcludeLabelIDs:              []int{5, 8},
		WebURL:                       "https://crowdin.com/project/test/translations#bundles:100",
		CreatedAt:                    "2023-09-20T11:11:05+00:00",
		UpdatedAt:                    "2023-09-20T12:22:20+00:00",
	}
	assert.Equal(t, expected, bundle)
}

func TestBundlesService_Edit(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/bundles/3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/name","value":"New Resx bundle"}]`+"\n")

		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "New Resx bundle",
				"format": "crowdin-resx",
				"sourcePatterns": [
					"/master"
				],
				"ignorePatterns": [
					"/masterBranch"
				],
				"exportPattern": "strings-two_letters_code%.resx",
				"isMultilingual": false,
				"includeProjectSourceLanguage": false,
				"labelIds": [13, 27],
				"excludeLabelIds": [5, 8],
				"webUrl": "https://crowdin.com/project/test/translations#bundles:100",
				"createdAt": "2023-09-20T11:11:05+00:00",
				"updatedAt": "2023-09-20T12:22:20+00:00"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/name",
			Value: "New Resx bundle",
		},
	}
	bundle, resp, err := client.Bundles.Edit(context.Background(), 2, 3, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Bundle{
		ID:                           1,
		Name:                         "New Resx bundle",
		Format:                       "crowdin-resx",
		SourcePatterns:               []string{"/master"},
		IgnorePatterns:               []string{"/masterBranch"},
		ExportPattern:                "strings-two_letters_code%.resx",
		IsMultilingual:               false,
		IncludeProjectSourceLanguage: false,
		LabelIDs:                     []int{13, 27},
		ExcludeLabelIDs:              []int{5, 8},
		WebURL:                       "https://crowdin.com/project/test/translations#bundles:100",
		CreatedAt:                    "2023-09-20T11:11:05+00:00",
		UpdatedAt:                    "2023-09-20T12:22:20+00:00",
	}
	assert.Equal(t, expected, bundle)
}

func TestBundlesService_Export(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/bundles/3/exports"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)

		w.WriteHeader(http.StatusAccepted)
		fmt.Fprint(w, `{
			"data": {
				"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
				"status": "finished",
				"progress": 100,
				"attributes": {
					"bundleId": 38
				},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00",
				"startedAt": "2023-09-23T11:26:54+00:00",
				"finishedAt": "2023-09-23T11:26:54+00:00",
				"eta": "1 second"
			}
		}`)
	})

	export, resp, err := client.Bundles.Export(context.Background(), 2, 3)
	require.NoError(t, err)
	assert.Equal(t, http.StatusAccepted, resp.StatusCode)

	expected := &model.BundleExport{
		Identifier: "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
		Status:     "finished",
		Progress:   100,
		Attributes: struct {
			BundleID int `json:"bundleId"`
		}{BundleID: 38},
		CreatedAt:  "2023-09-23T11:26:54+00:00",
		UpdatedAt:  "2023-09-23T11:26:54+00:00",
		StartedAt:  "2023-09-23T11:26:54+00:00",
		FinishedAt: "2023-09-23T11:26:54+00:00",
	}
	assert.Equal(t, expected, export)
}

func TestBundlesService_Delete(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/bundles/3"

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Bundles.Delete(context.Background(), 2, 3)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestBundlesService_Download(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/bundles/3/exports/50fb3506-4127-4ba8-8296-f97dc7e3e0c3/download"
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

	downloadLink, resp, err := client.Bundles.Download(context.Background(), 2, 3, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3")
	require.NoError(t, err)
	assert.NotNil(t, resp)
	assert.Equal(t, "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff", downloadLink.URL)
	assert.Equal(t, "2023-09-20T10:31:21+00:00", downloadLink.ExpireIn)
}

func TestBundlesService_CheckExportStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/bundles/3/exports/50fb3506-4127-4ba8-8296-f97dc7e3e0c3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
				"status": "finished",
				"progress": 100,
				"attributes": {
					"bundleId": 38
				},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00",
				"startedAt": "2023-09-23T11:26:54+00:00",
				"finishedAt": "2023-09-23T11:26:54+00:00",
				"eta": "1 second"
			}
		}`)
	})

	status, resp, err := client.Bundles.CheckExportStatus(context.Background(), 2, 3, "50fb3506-4127-4ba8-8296-f97dc7e3e0c3")
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.BundleExport{
		Identifier: "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
		Status:     "finished",
		Progress:   100,
		Attributes: struct {
			BundleID int `json:"bundleId"`
		}{BundleID: 38},
		CreatedAt:  "2023-09-23T11:26:54+00:00",
		UpdatedAt:  "2023-09-23T11:26:54+00:00",
		StartedAt:  "2023-09-23T11:26:54+00:00",
		FinishedAt: "2023-09-23T11:26:54+00:00",
	}
	assert.Equal(t, expected, status)
}

func TestBundlesService_ListFiles(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/bundles/3/files"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path+"?limit=3&offset=10")

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 44
					}
				},
				{
					"data": {
						"id": 46
					}
				},
				{
					"data": {
						"id": 48
					}
				}
			],
			"pagination": {
				"offset": 10,
				"limit": 3
			}
		}`)
	})

	opts := &model.ListOptions{Limit: 3, Offset: 10}
	files, resp, err := client.Bundles.ListFiles(context.Background(), 2, 3, opts)
	require.NoError(t, err)

	expected := []*model.File{{ID: 44}, {ID: 46}, {ID: 48}}
	assert.Equal(t, expected, files)

	assert.Equal(t, 10, resp.Pagination.Offset)
	assert.Equal(t, 3, resp.Pagination.Limit)
}

func TestBundlesService_ListFiles_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/bundles/3/files", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Bundles.ListFiles(context.Background(), 2, 3, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestBundlesService_ListBranches(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/bundles/3/branches"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path+"?limit=3&offset=10")

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 34,
						"projectId": 2,
						"name": "develop-master",
						"title": "Master branch",
						"createdAt": "2023-09-16T13:48:04+00:00",
						"updatedAt": "2023-09-19T13:25:27+00:00"
					}
				},
				{
					"data": {
						"id": 36,
						"projectId": 2,
						"name": "develop-master-2",
						"title": "Test branch",
						"createdAt": "2023-09-16T13:48:04+00:00",
						"updatedAt": "2023-09-19T13:25:27+00:00"
					}
				}
			],
			"pagination": {
				"offset": 10,
				"limit": 3
			}
		}`)
	})

	opts := &model.ListOptions{Limit: 3, Offset: 10}
	branches, resp, err := client.Bundles.ListBranches(context.Background(), 2, 3, opts)
	require.NoError(t, err)

	expected := []*model.Branch{
		{
			ID:        34,
			ProjectID: 2,
			Name:      "develop-master",
			Title:     "Master branch",
			CreatedAt: "2023-09-16T13:48:04+00:00",
			UpdatedAt: "2023-09-19T13:25:27+00:00",
		},
		{
			ID:        36,
			ProjectID: 2,
			Name:      "develop-master-2",
			Title:     "Test branch",
			CreatedAt: "2023-09-16T13:48:04+00:00",
			UpdatedAt: "2023-09-19T13:25:27+00:00",
		},
	}
	assert.Equal(t, expected, branches)

	assert.Equal(t, 10, resp.Pagination.Offset)
	assert.Equal(t, 3, resp.Pagination.Limit)
}

func TestBundlesService_ListBranches_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/bundles/3/branches", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Bundles.ListBranches(context.Background(), 2, 3, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}
