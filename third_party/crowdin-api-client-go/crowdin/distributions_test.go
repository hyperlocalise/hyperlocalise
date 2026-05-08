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

func TestDistributionsService_List(t *testing.T) {
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
			name:          "all options",
			opts:          &model.ListOptions{Limit: 10, Offset: 5},
			expectedQuery: "?limit=10&offset=5",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for projectID, tt := range tests {
		path := fmt.Sprintf("/api/v2/projects/%d/distributions", projectID)
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, http.MethodGet)
			testURL(t, r, path+tt.expectedQuery)

			fmt.Fprint(w, `{
				"data": [
					{
						"data": {
							"hash": "50fb350641274ba88296f97dc7e3e0c3",
							"name": "Export Bundle",
							"bundleIds": [45, 62],
							"createdAt": "2023-09-16T13:48:04+00:00",
							"updatedAt": "2023-09-19T13:25:27+00:00",
							"exportMode": "bundle",
							"fileIds": [24, 25, 38],
							"manifestUrl": "https://distributions.crowdin.net/50fb350641274ba88296f97dc7e3e0c3/manifest.json"
						}						
					},
					{
						"data": {
							"hash": "50fb350641274ba88296f97dc7e3e0c4",
							"name": "Export Bundle",
							"bundleIds": [47],
							"createdAt": "2023-09-16T13:48:04+00:00",
							"updatedAt": "2023-09-19T13:25:27+00:00",
							"exportMode": "bundle",
							"fileIds": [25],
							"manifestUrl": "https://distributions.crowdin.net/50fb350641274ba88296f97dc7e3e0c3/manifest.json"
						}
					}
				],
				"pagination": {
					"offset": 1,
					"limit": 2
				}
			}`)
		})

		distributions, resp, err := client.Distributions.List(context.Background(), projectID, tt.opts)
		require.NoError(t, err)
		assert.NotNil(t, resp)

		expected := []*model.Distribution{
			{
				Hash:        "50fb350641274ba88296f97dc7e3e0c3",
				Name:        "Export Bundle",
				BundleIDs:   []int{45, 62},
				CreatedAt:   "2023-09-16T13:48:04+00:00",
				UpdatedAt:   "2023-09-19T13:25:27+00:00",
				ExportMode:  "bundle",
				FileIDs:     []int{24, 25, 38},
				ManifestURL: "https://distributions.crowdin.net/50fb350641274ba88296f97dc7e3e0c3/manifest.json",
			},
			{
				Hash:        "50fb350641274ba88296f97dc7e3e0c4",
				Name:        "Export Bundle",
				BundleIDs:   []int{47},
				CreatedAt:   "2023-09-16T13:48:04+00:00",
				UpdatedAt:   "2023-09-19T13:25:27+00:00",
				ExportMode:  "bundle",
				FileIDs:     []int{25},
				ManifestURL: "https://distributions.crowdin.net/50fb350641274ba88296f97dc7e3e0c3/manifest.json",
			},
		}
		require.Equal(t, expected, distributions)
	}
}

func TestDistributionsService_List_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/distributions", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Distributions.List(context.Background(), 2, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestDistributionsService_Get(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/distributions/50fb350641274ba88296f97dc7e3e0c3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"hash": "50fb350641274ba88296f97dc7e3e0c3",
				"name": "Export Bundle",
				"bundleIds": [45, 62],
				"createdAt": "2023-09-16T13:48:04+00:00",
				"updatedAt": "2023-09-19T13:25:27+00:00",
				"exportMode": "bundle",
				"fileIds": [24, 25, 38],
				"manifestUrl": "https://distributions.crowdin.net/50fb350641274ba88296f97dc7e3e0c3/manifest.json"
			}
		}`)
	})

	distribution, resp, err := client.Distributions.Get(context.Background(), 1, "50fb350641274ba88296f97dc7e3e0c3")
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Distribution{
		Hash:        "50fb350641274ba88296f97dc7e3e0c3",
		Name:        "Export Bundle",
		BundleIDs:   []int{45, 62},
		CreatedAt:   "2023-09-16T13:48:04+00:00",
		UpdatedAt:   "2023-09-19T13:25:27+00:00",
		ExportMode:  "bundle",
		FileIDs:     []int{24, 25, 38},
		ManifestURL: "https://distributions.crowdin.net/50fb350641274ba88296f97dc7e3e0c3/manifest.json",
	}
	require.Equal(t, expected, distribution)
}

func TestDistributionsService_Add(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/distributions"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"name":"Export Bundle","exportMode":"bundle","bundleIds":[45,62]}`+"\n")

		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, `{
			"data": {
				"hash": "50fb350641274ba88296f97dc7e3e0c3",
				"name": "Export Bundle",
				"bundleIds": [45, 62],
				"createdAt": "2023-09-16T13:48:04+00:00",
				"updatedAt": "2023-09-19T13:25:27+00:00",
				"exportMode": "bundle",
				"fileIds": [24, 25, 38],
				"manifestUrl": "https://distributions.crowdin.net/50fb350641274ba88296f97dc7e3e0c3/manifest.json"
			}
		}`)
	})

	req := &model.DistributionAddRequest{
		Name:       "Export Bundle",
		ExportMode: model.ExportModeBundle,
		BundleIDs:  []int{45, 62},
	}
	distribution, resp, err := client.Distributions.Add(context.Background(), 1, req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	expected := &model.Distribution{
		Hash:        "50fb350641274ba88296f97dc7e3e0c3",
		Name:        "Export Bundle",
		BundleIDs:   []int{45, 62},
		CreatedAt:   "2023-09-16T13:48:04+00:00",
		UpdatedAt:   "2023-09-19T13:25:27+00:00",
		ExportMode:  "bundle",
		FileIDs:     []int{24, 25, 38},
		ManifestURL: "https://distributions.crowdin.net/50fb350641274ba88296f97dc7e3e0c3/manifest.json",
	}
	assert.Equal(t, expected, distribution)
}

func TestDistributionsService_Edit(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/distributions/50fb350641274ba88296f97dc7e3e0c3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/exportMode","value":"bundle"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"hash": "50fb350641274ba88296f97dc7e3e0c3",
				"name": "Export Bundle",
				"bundleIds": [45, 62],
				"createdAt": "2023-09-16T13:48:04+00:00",
				"updatedAt": "2023-09-19T13:25:27+00:00",
				"exportMode": "bundle",
				"fileIds": [24, 25, 38],
				"manifestUrl": "https://distributions.crowdin.net/50fb350641274ba88296f97dc7e3e0c3/manifest.json"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/exportMode",
			Value: "bundle",
		},
	}
	distribution, resp, err := client.Distributions.Edit(context.Background(), 1, "50fb350641274ba88296f97dc7e3e0c3", req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Distribution{
		Hash:        "50fb350641274ba88296f97dc7e3e0c3",
		Name:        "Export Bundle",
		BundleIDs:   []int{45, 62},
		CreatedAt:   "2023-09-16T13:48:04+00:00",
		UpdatedAt:   "2023-09-19T13:25:27+00:00",
		ExportMode:  "bundle",
		FileIDs:     []int{24, 25, 38},
		ManifestURL: "https://distributions.crowdin.net/50fb350641274ba88296f97dc7e3e0c3/manifest.json",
	}
	assert.Equal(t, expected, distribution)
}

func TestDistributionsService_Delete(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/distributions/50fb350641274ba88296f97dc7e3e0c3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Distributions.Delete(context.Background(), 1, "50fb350641274ba88296f97dc7e3e0c3")
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestDistributionsService_GetRelease(t *testing.T) {
	tests := []struct {
		name     string
		jsonResp string
		expected *model.DistributionRelease
	}{
		{
			name: "all fields",
			jsonResp: `{
				"data": {
					"status": "success",
					"progress": 100,
					"currentLanguageId": "uk",
					"date": "2023-09-23T09:04:29+00:00",
					"currentFileId": 8
				}
			}`,
			expected: &model.DistributionRelease{
				Status:            "success",
				Progress:          100,
				CurrentLanguageID: "uk",
				Date:              "2023-09-23T09:04:29+00:00",
				CurrentFileID:     8,
			},
		},
		{
			name: "nullable fields",
			jsonResp: `{
				"data": {
					"status": null,
					"progress": null,
					"currentLanguageId": null,
					"date": null,
					"currentFileId": null
				}
			}`,
			expected: &model.DistributionRelease{},
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for projectID, tt := range tests {
		path := fmt.Sprintf("/api/v2/projects/%d/distributions/50fb350641274ba88296f97dc7e3e0c3/release", projectID)
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, http.MethodGet)
			testURL(t, r, path)

			fmt.Fprint(w, tt.jsonResp)
		})

		release, resp, err := client.Distributions.GetRelease(context.Background(), projectID, "50fb350641274ba88296f97dc7e3e0c3")
		require.NoError(t, err)
		assert.NotNil(t, resp)
		require.Equal(t, tt.expected, release)
	}
}

func TestDistributionsService_Release(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/distributions/50fb350641274ba88296f97dc7e3e0c3/release"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"status": "success",
				"progress": 100,
				"currentLanguageId": "uk",
				"date": "2023-09-23T09:04:29+00:00",
				"currentFileId": 8
			}
		}`)
	})

	release, resp, err := client.Distributions.Release(context.Background(), 1, "50fb350641274ba88296f97dc7e3e0c3")
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.DistributionRelease{
		Status:            "success",
		Progress:          100,
		CurrentLanguageID: "uk",
		Date:              "2023-09-23T09:04:29+00:00",
		CurrentFileID:     8,
	}
	require.Equal(t, expected, release)
}
