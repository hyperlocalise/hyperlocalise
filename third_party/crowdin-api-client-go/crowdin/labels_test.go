package crowdin

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLabelsService_Get(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/labels/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 34,
				"title": "main"
			}
		}`)
	})

	label, resp, err := client.Labels.Get(context.Background(), 1, 2)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	assert.Equal(t, "main", label.Title)
	assert.Equal(t, 34, label.ID)
}

func TestLabelsService_Get_NotFound(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/labels/404"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)
		http.Error(w, `{"error": {"code": 404, "message": "Label Not Found"}}`, http.StatusNotFound)
	})

	label, resp, err := client.Labels.Get(context.Background(), 1, 404)

	require.Error(t, err)
	assert.Nil(t, label)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)

	var e *model.ErrorResponse
	assert.True(t, errors.As(err, &e))
}

func TestLabelsService_List(t *testing.T) {
	tests := []struct {
		name     string
		opts     *model.LabelsListOptions
		expected string
	}{
		{
			name:     "nil options",
			opts:     nil,
			expected: "",
		},
		{
			name:     "empty options",
			opts:     &model.LabelsListOptions{},
			expected: "",
		},
		{
			name: "with options",
			opts: &model.LabelsListOptions{
				OrderBy:     "title desc",
				ListOptions: model.ListOptions{Offset: 1, Limit: 25},
			},
			expected: "?limit=25&offset=1&orderBy=title+desc",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for projectID, tt := range tests {
		path := fmt.Sprintf("/api/v2/projects/%d/labels", projectID)
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, "GET")
			testURL(t, r, path+tt.expected)

			fmt.Fprint(w, `{
				"data": [
					{
						"data": {
							"id": 34,
							"title": "main"
						}
					},
					{
						"data": {
							"id": 36,
							"title": "test"
						}
					}
				],
				"pagination": {
					"offset": 1,
					"limit": 25
				}
			}`)
		})

		labels, resp, err := client.Labels.List(context.Background(), projectID, tt.opts)
		require.NoError(t, err)

		expected := []*model.Label{
			{
				ID:    34,
				Title: "main",
			},
			{
				ID:    36,
				Title: "test",
			},
		}
		assert.Equal(t, expected, labels)
		assert.Len(t, labels, 2)

		assert.NotNil(t, resp)
		assert.Equal(t, 1, resp.Pagination.Offset)
		assert.Equal(t, 25, resp.Pagination.Limit)
	}
}

func TestLabelsService_List_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/labels", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Labels.List(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestLabelsService_Add(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/labels"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "POST")
		testURL(t, r, path)
		testBody(t, r, `{"title":"main"}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 34,
				"title": "main"
			}
		}`)
	})

	label, resp, err := client.Labels.Add(context.Background(), 1, &model.LabelAddRequest{Title: "main"})
	require.NoError(t, err)
	assert.NotNil(t, resp)

	assert.Equal(t, "main", label.Title)
	assert.Equal(t, 34, label.ID)
}

func TestLabelsService_Edit(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/labels/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "PATCH")
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/title","value":"main"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 34,
				"title": "main"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/title",
			Value: "main",
		},
	}
	label, resp, err := client.Labels.Edit(context.Background(), 1, 2, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	assert.Equal(t, "main", label.Title)
	assert.Equal(t, 34, label.ID)
}

func TestLabelsService_Delete(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/labels/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "DELETE")
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Labels.Delete(context.Background(), 1, 2)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestLabelsService_AssignToStrings(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/labels/2/strings"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "POST")
		testURL(t, r, path)
		testBody(t, r, `{"stringIds":[3,4]}`+"\n")

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
					"id": 2814,
					"projectId": 2,
					"branchId": 12,
					"identifier": "name",
					"text": "Not all videos are shown to users. See more",
					"type": "text",
					"context": "shown on main page",
					"maxLength": 35,
					"isHidden": false,
					"isDuplicate": true,
					"masterStringId": 1,
					"hasPlurals": false,
					"isIcu": false,
					"labelIds": [3],
					"webUrl": "https://example.crowdin.com/editor/1/all/en-pl?filter=basic&value=0&view=comfortable#2",
					"createdAt": "2023-09-20T12:43:57+00:00",
					"updatedAt": "2023-09-20T13:24:01+00:00",
					"fields": {
						"fieldSlug": "fieldValue"
					},
					"fileId": 48,
					"directoryId": 14,
					"revision": 1
					}
				}
			],
			"pagination": {
				"offset": 0,
				"limit": 25
			}
		}`)
	})

	strings, resp, err := client.Labels.AssignToStrings(context.Background(), 1, 2, []int{3, 4})
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := []*model.SourceString{
		{
			ID:             2814,
			ProjectID:      2,
			BranchID:       ToPtr(12),
			Identifier:     "name",
			Text:           "Not all videos are shown to users. See more",
			Type:           "text",
			Context:        "shown on main page",
			MaxLength:      35,
			IsHidden:       false,
			IsDuplicate:    true,
			MasterStringID: ToPtr(1),
			LabelIDs:       []int{3},
			WebURL:         "https://example.crowdin.com/editor/1/all/en-pl?filter=basic&value=0&view=comfortable#2",
			CreatedAt:      ToPtr("2023-09-20T12:43:57+00:00"),
			UpdatedAt:      ToPtr("2023-09-20T13:24:01+00:00"),
			Fields: map[string]any{
				"fieldSlug": "fieldValue",
			},
			FileID:      ToPtr(48),
			DirectoryID: ToPtr(14),
			Revision:    ToPtr(1),
		},
	}
	assert.Equal(t, expected, strings)
}

func TestLabelsService_AssignToStrings_WithValidationErrors(t *testing.T) {
	tests := []struct {
		stringIDs   []int
		expectedErr string
	}{
		{
			stringIDs:   nil,
			expectedErr: "stringIds cannot be empty",
		},
		{
			stringIDs:   []int{},
			expectedErr: "stringIds cannot be empty",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for labelID, tt := range tests {
		mux.HandleFunc(fmt.Sprintf("/api/v2/projects/1/labels/%d/strings", labelID), func(w http.ResponseWriter, r *http.Request) {
			testBody(t, r, `{"stringIds":[0]}`+"\n")

			fmt.Fprint(w, `{}`)
		})

		_, _, err := client.Labels.AssignToStrings(context.Background(), 1, labelID, tt.stringIDs)
		assert.EqualError(t, err, tt.expectedErr)
	}
}

func TestLabelsService_UnassignFromStrings(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/labels/2/strings"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "DELETE")
		testURL(t, r, path+"?stringIds=3,4")

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 2814,
						"projectId": 2,
						"branchId": 12,
						"identifier": "name",
						"text": "Not all videos are shown to users. See more",
						"type": "text",
						"context": "shown on main page",
						"maxLength": 35,
						"isHidden": false,
						"isDuplicate": true,
						"masterStringId": 1,
						"hasPlurals": false,
						"isIcu": false,
						"labelIds": [3],
						"webUrl": "https://example.crowdin.com/editor/1/all/en-pl?filter=basic&value=0&view=comfortable#2",
						"createdAt": "2023-09-20T12:43:57+00:00",
						"updatedAt": "2023-09-20T13:24:01+00:00",
						"fileId": 48,
						"directoryId": 14,
						"revision": 1
					}
				}
			],
			"pagination": {
				"offset": 0,
				"limit": 25
			}
		}`)
	})

	strings, resp, err := client.Labels.UnassignFromStrings(context.Background(), 1, 2, []int{3, 4})
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := []*model.SourceString{
		{
			ID:             2814,
			ProjectID:      2,
			BranchID:       ToPtr(12),
			Identifier:     "name",
			Text:           "Not all videos are shown to users. See more",
			Type:           "text",
			Context:        "shown on main page",
			MaxLength:      35,
			IsHidden:       false,
			IsDuplicate:    true,
			MasterStringID: ToPtr(1),
			LabelIDs:       []int{3},
			WebURL:         "https://example.crowdin.com/editor/1/all/en-pl?filter=basic&value=0&view=comfortable#2",
			CreatedAt:      ToPtr("2023-09-20T12:43:57+00:00"),
			UpdatedAt:      ToPtr("2023-09-20T13:24:01+00:00"),
			FileID:         ToPtr(48),
			DirectoryID:    ToPtr(14),
			Revision:       ToPtr(1),
		},
	}
	assert.Equal(t, expected, strings)
}

func TestLabelsService_UnassignFromStrings_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/labels/2/strings", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Labels.UnassignFromStrings(context.Background(), 1, 2, []int{3, 4})
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestLabelsService_UnassignFromStrings_WithValidationErrors(t *testing.T) {
	tests := []struct {
		stringIDs   []int
		expectedErr string
	}{
		{
			stringIDs:   nil,
			expectedErr: "stringIDs cannot be empty",
		},
		{
			stringIDs:   []int{},
			expectedErr: "stringIDs cannot be empty",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for labelID, tt := range tests {
		mux.HandleFunc(fmt.Sprintf("/api/v2/projects/1/labels/%d/strings", labelID), func(w http.ResponseWriter, _ *http.Request) {
			fmt.Fprint(w, `{}`)
		})

		_, _, err := client.Labels.UnassignFromStrings(context.Background(), 1, labelID, tt.stringIDs)
		assert.EqualError(t, err, tt.expectedErr)
	}
}

func TestLabelsService_AssignToScreenshots(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/labels/2/screenshots"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "POST")
		testURL(t, r, path)
		testBody(t, r, `{"screenshotIds":[3,4]}`+"\n")

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 2,
						"userId": 6,
						"url": "https://production-enterprise-screenshots.downloads.crowdin.com/992000002/6/2/middle.jpg",
						"webUrl": "https://production-enterprise-screenshots.downloads.crowdin.com/992000002/6/2/middle.jpg",
						"name": "translate_with_siri.jpg",
						"size": {
							"width": 267,
							"height": 176
						},
						"tagsCount": 1,
						"tags": [
							{
								"id": 98,
								"screenshotId": 2,
								"stringId": 2822,
								"position": {
									"x": 474,
									"y": 147,
									"width": 490,
									"height": 99
								},
								"createdAt": "2023-09-23T09:35:31+00:00"
							}
						],
						"labels": [1],
						"labelIds": [1],
						"createdAt": "2023-09-23T09:29:19+00:00",
						"updatedAt": "2023-09-23T09:29:19+00:00"
					}
				}
			],
			"pagination": {
				"offset": 0,
				"limit": 25
			}
		}`)
	})

	screenshots, resp, err := client.Labels.AssignToScreenshots(context.Background(), 1, 2, []int{3, 4})
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := []*model.Screenshot{
		{
			ID:     2,
			UserID: 6,
			WebURL: "https://production-enterprise-screenshots.downloads.crowdin.com/992000002/6/2/middle.jpg",
			Name:   "translate_with_siri.jpg",
			Size: struct {
				Width  int `json:"width"`
				Height int `json:"height"`
			}{Width: 267, Height: 176},
			TagsCount: 1,
			Tags: []*model.Tag{
				{
					ID:           98,
					ScreenshotID: 2,
					StringID:     2822,
					Position: &model.TagPosition{
						X:      ToPtr(474),
						Y:      ToPtr(147),
						Width:  ToPtr(490),
						Height: ToPtr(99),
					},
					CreatedAt: "2023-09-23T09:35:31+00:00",
				},
			},
			LabelIDs:  []int{1},
			CreatedAt: "2023-09-23T09:29:19+00:00",
			UpdatedAt: "2023-09-23T09:29:19+00:00",
		},
	}
	assert.Equal(t, expected, screenshots)
}

func TestLabelsService_AssignToScreenshots_WithValidationErrors(t *testing.T) {
	tests := []struct {
		screenshotIDs []int
		expectedErr   string
	}{
		{
			screenshotIDs: nil,
			expectedErr:   "screenshotIds cannot be empty",
		},
		{
			screenshotIDs: []int{},
			expectedErr:   "screenshotIds cannot be empty",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for labelID, tt := range tests {
		mux.HandleFunc(fmt.Sprintf("/api/v2/projects/1/labels/%d/screenshots", labelID), func(w http.ResponseWriter, r *http.Request) {
			testBody(t, r, `{"screenshotIds":[0]}`+"\n")

			fmt.Fprint(w, `{}`)
		})

		_, _, err := client.Labels.AssignToScreenshots(context.Background(), 1, labelID, tt.screenshotIDs)
		assert.EqualError(t, err, tt.expectedErr)
	}
}

func TestLabelsService_UnassignFromScreenshots(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/labels/2/screenshots"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "DELETE")
		testURL(t, r, path+"?screenshotIds=1,2,3,4,5")

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 2,
						"userId": 6,
						"url": "https://production-enterprise-screenshots.downloads.crowdin.com/992000002/6/2/middle.jpg",
						"webUrl": "https://production-enterprise-screenshots.downloads.crowdin.com/992000002/6/2/middle.jpg",
						"name": "translate_with_siri.jpg",
						"size": {
							"width": 267,
							"height": 176
						},
						"tagsCount": 1,
						"tags": [
							{
								"id": 98,
								"screenshotId": 2,
								"stringId": 2822,
								"position": {
									"x": 474,
									"y": 147,
									"width": 490,
									"height": 99
								},
								"createdAt": "2023-09-23T09:35:31+00:00"
							}
						],
						"labels": [1],
						"labelIds": [1],
						"createdAt": "2023-09-23T09:29:19+00:00",
						"updatedAt": "2023-09-23T09:29:19+00:00"
					}
				}
			],
			"pagination": {
				"offset": 2,
				"limit": 25
			}
		}`)
	})

	strings, resp, err := client.Labels.UnassignFromScreenshots(context.Background(), 1, 2, []int{1, 2, 3, 4, 5})
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := []*model.Screenshot{
		{
			ID:     2,
			UserID: 6,
			WebURL: "https://production-enterprise-screenshots.downloads.crowdin.com/992000002/6/2/middle.jpg",
			Name:   "translate_with_siri.jpg",
			Size: struct {
				Width  int `json:"width"`
				Height int `json:"height"`
			}{Width: 267, Height: 176},
			TagsCount: 1,
			Tags: []*model.Tag{
				{
					ID:           98,
					ScreenshotID: 2,
					StringID:     2822,
					Position: &model.TagPosition{
						X:      ToPtr(474),
						Y:      ToPtr(147),
						Width:  ToPtr(490),
						Height: ToPtr(99),
					},
					CreatedAt: "2023-09-23T09:35:31+00:00",
				},
			},
			LabelIDs:  []int{1},
			CreatedAt: "2023-09-23T09:29:19+00:00",
			UpdatedAt: "2023-09-23T09:29:19+00:00",
		},
	}
	assert.Equal(t, expected, strings)
}

func TestLabelsService_UnassignFromScreenshots_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/labels/2/screenshots", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Labels.UnassignFromScreenshots(context.Background(), 1, 2, []int{1, 2})
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestLabelsService_UnassignFromScreenshots_WithValidationErrors(t *testing.T) {
	tests := []struct {
		screenshotIDs []int
		expectedErr   string
	}{
		{
			screenshotIDs: nil,
			expectedErr:   "screenshotIDs cannot be empty",
		},
		{
			screenshotIDs: []int{},
			expectedErr:   "screenshotIDs cannot be empty",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for labelID, tt := range tests {
		mux.HandleFunc(fmt.Sprintf("/api/v2/projects/1/labels/%d/screenshots", labelID), func(w http.ResponseWriter, _ *http.Request) {
			fmt.Fprint(w, `{}`)
		})

		_, _, err := client.Labels.UnassignFromScreenshots(context.Background(), 1, labelID, tt.screenshotIDs)
		assert.EqualError(t, err, tt.expectedErr)
	}
}
