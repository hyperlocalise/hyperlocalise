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

func TestScreenshotsService_GetScreenshot(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
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
		}`)
	})

	screenshot, resp, err := client.Screenshots.GetScreenshot(context.Background(), 2, 3)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Screenshot{
		ID:     2,
		UserID: 6,
		WebURL: "https://production-enterprise-screenshots.downloads.crowdin.com/992000002/6/2/middle.jpg",
		Name:   "translate_with_siri.jpg",
		Size: struct {
			Width  int `json:"width"`
			Height int `json:"height"`
		}{
			Width:  267,
			Height: 176,
		},
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
	}
	assert.Equal(t, expected, screenshot)
}

func TestScreenshotsService_GetScreenshot_NotFound(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/11111"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		http.Error(w, `{"error": {"code": 404, "message": "Not Found"}}`, http.StatusNotFound)
	})

	mte, resp, err := client.Screenshots.GetScreenshot(context.Background(), 2, 11111)
	require.Error(t, err)

	var errResponse *model.ErrorResponse
	assert.ErrorAs(t, err, &errResponse)
	assert.Equal(t, "404 Not Found", errResponse.Error())

	assert.Nil(t, mte)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestScreenshotsService_ListScreenshot(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	tests := []struct {
		name          string
		opts          *model.ScreenshotListOptions
		expectedQuery string
	}{
		{
			name:          "nil options",
			opts:          nil,
			expectedQuery: "",
		},
		{
			name:          "empty options",
			opts:          &model.ScreenshotListOptions{},
			expectedQuery: "",
		},
		{
			name: "all options",
			opts: &model.ScreenshotListOptions{
				OrderBy:         "createdAt desc,name,tagsCount",
				StringID:        1, // TODO: StringID is deprecated
				LabelIDs:        []string{"1", "2", "3"},
				ExcludeLabelIDs: []string{"1", "2", "3"},
				ListOptions: model.ListOptions{
					Limit:  10,
					Offset: 20,
				},
			},
			expectedQuery: "?excludeLabelIds=1%2C2%2C3&labelIds=1%2C2%2C3&limit=10&offset=20&orderBy=createdAt+desc%2Cname%2CtagsCount&stringId=1",
		},
	}

	for projectID, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/projects/%d/screenshots", projectID)
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

			screenshots, resp, err := client.Screenshots.ListScreenshots(context.Background(), projectID, tt.opts)
			require.NoError(t, err)

			expected := []*model.Screenshot{{ID: 2}, {ID: 4}, {ID: 6}}
			assert.Equal(t, expected, screenshots)

			assert.Equal(t, 10, resp.Pagination.Offset)
			assert.Equal(t, 25, resp.Pagination.Limit)
		})
	}
}

func TestScreenshotsService_ListScreenshot_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/screenshots", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Screenshots.ListScreenshots(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestScreenshotsService_AddScreenshot(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testJSONBody(t, r, `{
			"storageId": 71,
			"name": "translate_with_siri.jpg",
			"autoTag": false,
			"fileId": 48,
			"labelIds": [1, 2, 5]
		}`)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"name": "translate_with_siri.jpg"
			}
		}`)
	})

	req := &model.ScreenshotAddRequest{
		StorageID: 71,
		Name:      "translate_with_siri.jpg",
		AutoTag:   ToPtr(false),
		FileID:    48,
		LabelIDs:  []int{1, 2, 5},
	}
	screenshot, resp, err := client.Screenshots.AddScreenshot(context.Background(), 2, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Screenshot{
		ID:   2,
		Name: "translate_with_siri.jpg",
	}
	assert.Equal(t, expected, screenshot)
}

func TestScreenshotsService_AddScreenshot_WithRequiredFields(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testBody(t, r, `{"storageId":2,"name":"translate_with_siri.jpg"}`+"\n")

		fmt.Fprint(w, `{}`)
	})

	req := &model.ScreenshotAddRequest{
		StorageID: 2,
		Name:      "translate_with_siri.jpg",
	}
	_, _, err := client.Screenshots.AddScreenshot(context.Background(), 2, req)
	require.NoError(t, err)
}

func TestScreenshotsService_UpdateScreenshot(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPut)
		testURL(t, r, path)
		testBody(t, r, `{"storageId":2,"name":"translate_with_siri.jpg"}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"name": "translate_with_siri.jpg"
			}
		}`)
	})

	req := &model.ScreenshotUpdateRequest{
		StorageID: 2,
		Name:      "translate_with_siri.jpg",
	}
	screenshot, resp, err := client.Screenshots.UpdateScreenshot(context.Background(), 2, 3, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Screenshot{
		ID:   2,
		Name: "translate_with_siri.jpg",
	}
	assert.Equal(t, expected, screenshot)
}

func TestScreenshotsService_EditScreenshot(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/name","value":"translate_with_siri.jpg"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"name": "translate_with_siri.jpg"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/name",
			Value: "translate_with_siri.jpg",
		},
	}
	screenshot, resp, err := client.Screenshots.EditScreenshot(context.Background(), 2, 3, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Screenshot{
		ID:   2,
		Name: "translate_with_siri.jpg",
	}
	assert.Equal(t, expected, screenshot)
}

func TestScreenshotsService_DeleteScreenshot(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Screenshots.DeleteScreenshot(context.Background(), 2, 3)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestScreenshotsService_GetTag(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3/tags/4"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
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
		}`)
	})

	tag, resp, err := client.Screenshots.GetTag(context.Background(), 2, 3, 4)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Tag{
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
	}
	assert.Equal(t, expected, tag)
}

func TestScreenshotsService_GetTag_NotFound(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3/tags/11111"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		http.Error(w, `{"error": {"code": 404, "message": "Tag Not Found"}}`, http.StatusNotFound)
	})

	mte, resp, err := client.Screenshots.GetTag(context.Background(), 2, 3, 11111)
	require.Error(t, err)

	var errResponse *model.ErrorResponse
	assert.ErrorAs(t, err, &errResponse)
	assert.Equal(t, "404 Tag Not Found", errResponse.Error())

	assert.Nil(t, mte)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestScreenshotsService_ListTags(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3/tags"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path+"?limit=25&offset=10")

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
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
				}
			],
			"pagination": {
				"offset": 10,
				"limit": 25
			}
		}`)
	})

	tags, resp, err := client.Screenshots.ListTags(context.Background(), 2, 3, &model.ListOptions{Limit: 25, Offset: 10})
	require.NoError(t, err)

	expected := []*model.Tag{
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
	}
	assert.Equal(t, expected, tags)

	assert.Equal(t, 10, resp.Pagination.Offset)
	assert.Equal(t, 25, resp.Pagination.Limit)
}

func TestScreenshotsService_ListTags_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/screenshots/2/tags", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Screenshots.ListTags(context.Background(), 1, 2, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestScreenshotsService_AddTag(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3/tags"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testJSONBody(t, r, `{
			"stringId": 2822,
			"position": {
				"x": 0,
				"y": 147,
				"width": 490,
				"height": 0
			}
		}`)

		fmt.Fprint(w, `{
			"data": {
				"id": 98,
				"screenshotId": 2,
				"stringId": 2822,
				"position": {
					"x": 0,
					"y": 147,
					"width": 490,
					"height": 0
				},
				"createdAt": "2023-09-23T09:35:31+00:00"
			}
		}`)
	})

	req := &model.TagAddRequest{
		StringID: 2822,
		Position: &model.TagPosition{
			X:      ToPtr(0),
			Y:      ToPtr(147),
			Width:  ToPtr(490),
			Height: ToPtr(0),
		},
	}
	tag, resp, err := client.Screenshots.AddTag(context.Background(), 2, 3, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Tag{
		ID:           98,
		ScreenshotID: 2,
		StringID:     2822,
		Position: &model.TagPosition{
			X:      ToPtr(0),
			Y:      ToPtr(147),
			Width:  ToPtr(490),
			Height: ToPtr(0),
		},
		CreatedAt: "2023-09-23T09:35:31+00:00",
	}
	assert.Equal(t, expected, tag)
}

func TestScreenshotsService_AddTag_WithRequiredFields(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3/tags"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testBody(t, r, `{"stringId":2}`+"\n")

		fmt.Fprint(w, `{}`)
	})

	req := &model.TagAddRequest{
		StringID: 2,
	}
	_, _, err := client.Screenshots.AddTag(context.Background(), 2, 3, req)
	require.NoError(t, err)
}

func TestScreenshotsService_ReplaceTags(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3/tags"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPut)
		testURL(t, r, path)
		testBody(t, r, `[{"stringId":2822,"position":{"x":0,"y":147,"width":490,"height":10}}]`+"\n")

		w.WriteHeader(http.StatusOK)
	})

	req := []*model.ReplaceTagsRequest{
		{
			StringID: 2822,
			Position: &model.TagPosition{
				X:      ToPtr(0),
				Y:      ToPtr(147),
				Width:  ToPtr(490),
				Height: ToPtr(10),
			},
		},
	}
	resp, err := client.Screenshots.ReplaceTags(context.Background(), 2, 3, req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestScreenshotsService_ReplaceTags_WithRequiredFields(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3/tags"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testBody(t, r, `[{"stringId":2822}]`+"\n")

		w.WriteHeader(http.StatusOK)
	})

	req := []*model.ReplaceTagsRequest{
		{
			StringID: 2822,
		},
	}
	resp, err := client.Screenshots.ReplaceTags(context.Background(), 2, 3, req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestScreenshotsService_ReplaceTags_WithValidationError(t *testing.T) {
	tests := []struct {
		req         []*model.ReplaceTagsRequest
		expectedErr string
	}{
		{
			req:         nil,
			expectedErr: "request is required",
		},
		{
			req:         []*model.ReplaceTagsRequest{},
			expectedErr: "request is required",
		},
		{
			req: []*model.ReplaceTagsRequest{
				{
					StringID: 0,
				},
			},
			expectedErr: "stringId is required",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for projectID, tt := range tests {
		t.Run(tt.expectedErr, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/projects/%d/screenshots/3/tags", projectID)
			mux.HandleFunc(path, func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusOK)
			})

			_, err := client.Screenshots.ReplaceTags(context.Background(), projectID, 3, tt.req)
			assert.EqualError(t, err, tt.expectedErr)
		})
	}
}

func TestScreenshotsService_AutoTag(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3/tags"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPut)
		testURL(t, r, path)
		testBody(t, r, `{"autoTag":true,"fileId":1}`+"\n")

		w.WriteHeader(http.StatusOK)
	})

	req := &model.AutoTagRequest{
		AutoTag: ToPtr(true),
		FileID:  1,
	}
	resp, err := client.Screenshots.AutoTag(context.Background(), 2, 3, req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestScreenshotsService_AutoTag_WithRequiredFields(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3/tags"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testBody(t, r, `{"autoTag":false}`+"\n")

		w.WriteHeader(http.StatusOK)
	})

	req := &model.AutoTagRequest{
		AutoTag: ToPtr(false),
	}
	resp, err := client.Screenshots.AutoTag(context.Background(), 2, 3, req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestScreenshotsService_EditTag(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3/tags/4"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/stringId","value":"2822"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
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
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/stringId",
			Value: "2822",
		},
	}
	tag, resp, err := client.Screenshots.EditTag(context.Background(), 2, 3, 4, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Tag{
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
	}
	assert.Equal(t, expected, tag)
}

func TestScreenshotsService_ClearTags(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3/tags"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Screenshots.ClearTags(context.Background(), 2, 3)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestScreenshotsService_DeleteTag(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/2/screenshots/3/tags/4"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Screenshots.DeleteTag(context.Background(), 2, 3, 4)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}
