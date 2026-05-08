package crowdin

import (
	"context"
	"fmt"
	"net/http"
	"reflect"
	"testing"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSourceStringsService_List(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/strings", func(w http.ResponseWriter, r *http.Request) {
		testURL(t, r, "/api/v2/projects/2/strings")
		testMethod(t, r, http.MethodGet)

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
						"labelIds": [
							3
						],
						"webUrl": "https://example.crowdin.com/editor/1/all/en-pl?filter=basic&value=0&view=comfortable#2",
						"createdAt": "2023-09-20T12:43:57+00:00",
						"updatedAt": "2023-09-20T13:24:01+00:00",
						"fields": {
							"key_1": "value_1",
							"key_2": 2,
							"key_3": true,
							"key_4": ["en", "uk"]
						},
						"fileId": 48,
						"directoryId": 13,
						"revision": 1
					}
				},
				{
					"data": {
						"id": 2815,
						"fields": []
					}
				},
				{
					"data": {
						"id": 2816,
						"fields": {}
					}
				},
				{
					"data": {
						"id": 2817,
						"fields": null
					}
				}
			],
			"pagination": {
				"offset": 10,
				"limit": 25
			}
		}`)
	})

	sourceStrings, resp, err := client.SourceStrings.List(context.Background(), 2, nil)
	if err != nil {
		t.Errorf("SourceStrings.List returned error: %v", err)
	}

	want := []*model.SourceString{
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
				"key_1": "value_1",
				"key_2": float64(2),
				"key_3": true,
				"key_4": []any{"en", "uk"},
			},
			FileID:      ToPtr(48),
			DirectoryID: ToPtr(13),
			Revision:    ToPtr(1),
		},
		{
			ID:     2815,
			Fields: []any{},
		},
		{
			ID:     2816,
			Fields: map[string]any{},
		},
		{
			ID:     2817,
			Fields: nil,
		},
	}
	if !reflect.DeepEqual(sourceStrings, want) {
		t.Errorf("SourceStrings.List returned %+v, want %+v", sourceStrings, want)
	}

	expectedPagination := model.Pagination{Offset: 10, Limit: 25}
	if !reflect.DeepEqual(resp.Pagination, expectedPagination) {
		t.Errorf("SourceStrings.List pagination returned %+v, want %+v", resp.Pagination, expectedPagination)
	}
}

func TestSourceStringsService_List_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/strings", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.SourceStrings.List(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestSourceStringsService_ListQueryParams(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	cases := []struct {
		name   string
		opts   *model.SourceStringsListOptions
		expect string
	}{
		{"empty query", nil, ""},
		{"DenormalizePlaceholders=1", &model.SourceStringsListOptions{DenormalizePlaceholders: ToPtr(1)}, "denormalizePlaceholders=1"},
		{"DenormalizePlaceholders=0", &model.SourceStringsListOptions{DenormalizePlaceholders: ToPtr(0)}, "denormalizePlaceholders=0"},
		{"LabelIDs", &model.SourceStringsListOptions{LabelIDs: []int{1, 2, 3, 4, 5}}, "labelIds=1%2C2%2C3%2C4%2C5"},
		{"FileID", &model.SourceStringsListOptions{FileID: 1}, "fileId=1"},
		{"BranchID", &model.SourceStringsListOptions{BranchID: 2}, "branchId=2"},
		{"DirectoryID", &model.SourceStringsListOptions{DirectoryID: 3}, "directoryId=3"},
		{"TaskID", &model.SourceStringsListOptions{TaskID: 4}, "taskId=4"},
		{"CroQL", &model.SourceStringsListOptions{CroQL: "croql"}, "croql=croql"},
		{"Filter", &model.SourceStringsListOptions{Filter: "filter"}, "filter=filter"},
		{"Scope", &model.SourceStringsListOptions{Scope: "text"}, "scope=text"},
		{"ListOptions", &model.SourceStringsListOptions{ListOptions: model.ListOptions{Limit: 25, Offset: 10}}, "limit=25&offset=10"},
		{
			"all query params",
			&model.SourceStringsListOptions{
				DenormalizePlaceholders: ToPtr(1),
				LabelIDs:                []int{1, 2, 3, 4, 5},
				FileID:                  1,
				BranchID:                2,
				DirectoryID:             3,
				TaskID:                  4,
				CroQL:                   "croql",
				Filter:                  "filter",
				Scope:                   "text",
				ListOptions:             model.ListOptions{Limit: 25, Offset: 10},
			},
			"branchId=2&croql=croql&denormalizePlaceholders=1&directoryId=3&fileId=1&filter=filter&labelIds=1%2C2%2C3%2C4%2C5&limit=25&offset=10&scope=text&taskId=4",
		},
	}

	for idx, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			mux.HandleFunc(fmt.Sprintf("/api/v2/projects/%d/strings", idx), func(w http.ResponseWriter, r *http.Request) {
				url := fmt.Sprintf("/api/v2/projects/%d/strings", idx)
				if tt.expect != "" {
					url += "?" + tt.expect
				}
				testURL(t, r, url)
				testMethod(t, r, http.MethodGet)

				fmt.Fprint(w, `{"data":[]}`)
			})

			_, _, err := client.SourceStrings.List(context.Background(), idx, tt.opts)
			if err != nil {
				t.Errorf("SourceStrings.List returned error: %v", err)
			}
		})
	}
}

func TestSourceStringsService_Get(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	projectID := 2
	stringID := 2814

	mux.HandleFunc(fmt.Sprintf("/api/v2/projects/%d/strings/%d", projectID, stringID), func(w http.ResponseWriter, r *http.Request) {
		testURL(t, r, "/api/v2/projects/2/strings/2814")
		testMethod(t, r, http.MethodGet)

		fmt.Fprint(w, `{
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
				"labelIds": [
					3
				],
				"webUrl": "https://example.crowdin.com/editor/1/all/en-pl?filter=basic&value=0&view=comfortable#2",
				"createdAt": "2023-09-20T12:43:57+00:00",
				"updatedAt": "2023-09-20T13:24:01+00:00",
				"fields": [],
				"fileId": 48,
				"directoryId": 13,
				"revision": 1
			}
		}`)
	})

	sourceString, _, err := client.SourceStrings.Get(context.Background(), projectID, stringID, nil)
	if err != nil {
		t.Errorf("SourceStrings.Get returned error: %v", err)
	}

	want := &model.SourceString{
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
		Fields:         []any{},
		FileID:         ToPtr(48),
		DirectoryID:    ToPtr(13),
		Revision:       ToPtr(1),
	}
	if !reflect.DeepEqual(sourceString, want) {
		t.Errorf("SourceStrings.Get returned %+v, want %+v", sourceString, want)
	}
}

func TestSourceStringsService_GetQueryParams(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	cases := []struct {
		name   string
		opts   *model.SourceStringsGetOptions
		expect string
	}{
		{"nil query", nil, ""},
		{"empty query", &model.SourceStringsGetOptions{}, ""},
		{"not accepted value", &model.SourceStringsGetOptions{DenormalizePlaceholders: ToPtr(100)}, ""},
		{"DenormalizePlaceholders=0", &model.SourceStringsGetOptions{DenormalizePlaceholders: ToPtr(0)}, "denormalizePlaceholders=0"},
		{"DenormalizePlaceholders=1", &model.SourceStringsGetOptions{DenormalizePlaceholders: ToPtr(1)}, "denormalizePlaceholders=1"},
	}

	for idx, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			mux.HandleFunc(fmt.Sprintf("/api/v2/projects/1/strings/%d", idx), func(w http.ResponseWriter, r *http.Request) {
				url := fmt.Sprintf("/api/v2/projects/1/strings/%d", idx)
				if tt.expect != "" {
					url += "?" + tt.expect
				}
				testURL(t, r, url)
				testMethod(t, r, http.MethodGet)

				fmt.Fprint(w, `{}`)
			})

			_, _, err := client.SourceStrings.Get(context.Background(), 1, idx, tt.opts)
			if err != nil {
				t.Errorf("SourceStrings.Get returned error: %v", err)
			}
		})
	}
}

func TestSourceStringsService_Add(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	projectID := 2
	req := &model.SourceStringsAddRequest{
		Text:       "Not all videos are shown to users.",
		FileID:     48,
		Identifier: "name",
		Context:    "shown on main page",
		IsHidden:   ToPtr(false),
		MaxLength:  ToPtr(35),
		LabelIDs:   []int{3, 5, 7},
		Fields: map[string]any{
			"fieldSlug": "fieldValue",
			"foo":       true,
		},
	}

	mux.HandleFunc(fmt.Sprintf("/api/v2/projects/%d/strings", projectID), func(w http.ResponseWriter, r *http.Request) {
		testURL(t, r, fmt.Sprintf("/api/v2/projects/%d/strings", projectID))
		testMethod(t, r, http.MethodPost)
		testJSONBody(t, r, `{
			"text": "Not all videos are shown to users.",
			"fileId": 48,
			"identifier": "name",
			"context": "shown on main page",
			"isHidden": false,
			"maxLength": 35,
			"labelIds": [3,5,7],
			"fields": {
				"fieldSlug": "fieldValue",
				"foo": true
			}
		}`)

		fmt.Fprint(w, `{
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
				"labelIds": [
					3
				],
				"webUrl": "https://example.crowdin.com/editor/1/all/en-pl?filter=basic&value=0&view=comfortable#2",
				"createdAt": "2023-09-20T12:43:57+00:00",
				"updatedAt": "2023-09-20T13:24:01+00:00",
				"fields": {
					"fieldSlug": "fieldValue"
				},
				"fileId": 48,
				"directoryId": 13,
				"revision": 1
			}
		}`)
	})

	sourceString, _, err := client.SourceStrings.Add(context.Background(), projectID, req)
	if err != nil {
		t.Errorf("SourceStrings.Add returned error: %v", err)
	}

	want := &model.SourceString{
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
		Fields:         map[string]interface{}{"fieldSlug": "fieldValue"},
		FileID:         ToPtr(48),
		DirectoryID:    ToPtr(13),
		Revision:       ToPtr(1),
	}
	if !reflect.DeepEqual(sourceString, want) {
		t.Errorf("SourceStrings.Add returned %+v, want %+v", sourceString, want)
	}
}

func TestSourceStringsService_AddWithRequiredFields(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	tests := []struct {
		name         string
		req          *model.SourceStringsAddRequest
		expectedBody string
	}{
		{
			name: "with branchId and text string",
			req: &model.SourceStringsAddRequest{
				Text:       "Not all videos are shown to users.",
				BranchID:   48,
				Identifier: "name",
			},
			expectedBody: `{"text":"Not all videos are shown to users.","branchId":48,"identifier":"name"}` + "\n",
		},
		{
			name: "with fileId and plural text string",
			req: &model.SourceStringsAddRequest{
				Text: map[string]string{
					"one":   "string",
					"other": "string",
				},
				FileID:     48,
				Identifier: "name",
			},
			expectedBody: `{"text":{"one":"string","other":"string"},"fileId":48,"identifier":"name"}` + "\n",
		},
	}

	for projectID, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			projectID++
			mux.HandleFunc(fmt.Sprintf("/api/v2/projects/%d/strings", projectID), func(w http.ResponseWriter, r *http.Request) {
				testURL(t, r, fmt.Sprintf("/api/v2/projects/%d/strings", projectID))
				testMethod(t, r, http.MethodPost)
				testBody(t, r, tt.expectedBody)

				fmt.Fprint(w, `{}`)
			})

			_, _, err := client.SourceStrings.Add(context.Background(), projectID, tt.req)
			assert.Nil(t, err)
		})
	}
}

func TestSourceStringsService_AddWithValidationErrors(t *testing.T) {
	client, _, teardown := setupClient()
	defer teardown()

	cases := []struct {
		name      string
		req       *model.SourceStringsAddRequest
		expectErr string
	}{
		{"nil request", nil, "request cannot be nil"},
		{"empty request", &model.SourceStringsAddRequest{}, "text must be a string or map of strings"},
		{
			"unsupported text type",
			&model.SourceStringsAddRequest{
				Text:   []int{1, 2, 3},
				FileID: 48,
			},
			"text must be a string or map of strings",
		},
		{
			"missing text",
			&model.SourceStringsAddRequest{
				FileID: 48,
			},
			"text must be a string or map of strings",
		},
		{
			"empty text",
			&model.SourceStringsAddRequest{
				Text:   "",
				FileID: 48,
			},
			"text cannot be empty",
		},
		{
			"empty text map",
			&model.SourceStringsAddRequest{
				Text: map[string]string{},
			},
			"text cannot be empty",
		},
		{
			"empty fileID and branchID",
			&model.SourceStringsAddRequest{
				Text:       "Not all videos are shown to users.",
				Identifier: "name",
			},
			"fileId or branchId is required",
		},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			_, _, err := client.SourceStrings.Add(context.Background(), 2, tt.req)
			if err == nil {
				t.Errorf("SourceStrings.Add expected error, got nil")
			}

			if err.Error() != tt.expectErr {
				t.Errorf("SourceStrings.Add returned %+q, want %+q", err, tt.expectErr)
			}
		})
	}
}

func TestSourceStringsService_BatchOperations(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	projectID := 2
	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/2814/isHidden",
			Value: true,
		},
		{
			Op:   "remove",
			Path: "/2815",
		},
	}

	mux.HandleFunc(fmt.Sprintf("/api/v2/projects/%d/strings", projectID), func(w http.ResponseWriter, r *http.Request) {
		testURL(t, r, fmt.Sprintf("/api/v2/projects/%d/strings", projectID))
		testMethod(t, r, http.MethodPatch)
		testBody(t, r, `[{"op":"replace","path":"/2814/isHidden","value":true},{"op":"remove","path":"/2815"}]`+"\n")

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 2814,
						"projectId": 2,
						"branchId": 12,
						"identifier": "name",
						"text": "Not all videos are shown to users.",
						"type": "text",
						"context": "shown on main page",
						"maxLength": 35,
						"isHidden": false,
						"isDuplicate": true,
						"masterStringId": 1,
						"hasPlurals": false,
						"isIcu": false,
						"labelIds": [
							3
						],
						"webUrl": "https://example.crowdin.com/editor/1/all/en-pl?filter=basic&value=0&view=comfortable#1",
						"createdAt": "2023-09-20T12:43:57+00:00",
						"updatedAt": "2023-09-20T13:24:01+00:00"
					}
				}
			]
		}`)
	})

	sourceStrings, _, err := client.SourceStrings.BatchOperations(context.Background(), projectID, req)
	if err != nil {
		t.Errorf("SourceStrings.BatchOperations returned error: %v", err)
	}

	want := []*model.SourceString{
		{
			ID:             2814,
			ProjectID:      2,
			BranchID:       ToPtr(12),
			Identifier:     "name",
			Text:           "Not all videos are shown to users.",
			Type:           "text",
			Context:        "shown on main page",
			MaxLength:      35,
			IsHidden:       false,
			IsDuplicate:    true,
			MasterStringID: ToPtr(1),
			LabelIDs:       []int{3},
			WebURL:         "https://example.crowdin.com/editor/1/all/en-pl?filter=basic&value=0&view=comfortable#1",
			CreatedAt:      ToPtr("2023-09-20T12:43:57+00:00"),
			UpdatedAt:      ToPtr("2023-09-20T13:24:01+00:00"),
		},
	}
	if !reflect.DeepEqual(sourceStrings, want) {
		t.Errorf("SourceStrings.BatchOperations returned %+v, want %+v", sourceStrings, want)
	}
}

func TestSourceStringsService_BatchOperations_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/strings", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.SourceStrings.BatchOperations(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestSourceStringsService_Edit(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	projectID := 2
	stringID := 2814

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/text",
			Value: "Updated text",
		},
		{
			Op:    "replace",
			Path:  "/isHidden",
			Value: true,
		},
	}

	mux.HandleFunc(fmt.Sprintf("/api/v2/projects/%d/strings/%d", projectID, stringID), func(w http.ResponseWriter, r *http.Request) {
		testURL(t, r, fmt.Sprintf("/api/v2/projects/%d/strings/%d", projectID, stringID))
		testMethod(t, r, http.MethodPatch)
		testBody(t, r, `[{"op":"replace","path":"/text","value":"Updated text"},{"op":"replace","path":"/isHidden","value":true}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 2814,
				"projectId": 2,
				"branchId": 12,
				"identifier": "name",
				"text": "Updated text",
				"type": "text",
				"context": "shown on main page",
				"maxLength": 35,
				"isHidden": true,
				"isDuplicate": true,
				"masterStringId": 1,
				"labelIds": [
					3
				],
				"webUrl": "https://example.crowdin.com/editor/1/all/en-pl?filter=basic&value=0&view=comfortable#2",
				"createdAt": "2023-09-20T12:43:57+00:00",
				"updatedAt": "2023-09-20T13:24:01+00:00"
			}
		}`)
	})

	sourceString, _, err := client.SourceStrings.Edit(context.Background(), projectID, stringID, req)
	if err != nil {
		t.Errorf("SourceStrings.Edit returned error: %v", err)
	}

	want := &model.SourceString{
		ID:             2814,
		ProjectID:      2,
		BranchID:       ToPtr(12),
		Identifier:     "name",
		Text:           "Updated text",
		Type:           "text",
		Context:        "shown on main page",
		MaxLength:      35,
		IsHidden:       true,
		IsDuplicate:    true,
		MasterStringID: ToPtr(1),
		LabelIDs:       []int{3},
		WebURL:         "https://example.crowdin.com/editor/1/all/en-pl?filter=basic&value=0&view=comfortable#2",
		CreatedAt:      ToPtr("2023-09-20T12:43:57+00:00"),
		UpdatedAt:      ToPtr("2023-09-20T13:24:01+00:00"),
	}
	if !reflect.DeepEqual(sourceString, want) {
		t.Errorf("SourceStrings.Edit returned %+v, want %+v", sourceString, want)
	}
}

func TestSourceStringsService_Delete(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	projectID := 2
	stringID := 2814

	mux.HandleFunc(fmt.Sprintf("/api/v2/projects/%d/strings/%d", projectID, stringID), func(_ http.ResponseWriter, r *http.Request) {
		testURL(t, r, fmt.Sprintf("/api/v2/projects/%d/strings/%d", projectID, stringID))
		testMethod(t, r, http.MethodDelete)
	})

	_, err := client.SourceStrings.Delete(context.Background(), projectID, stringID)
	if err != nil {
		t.Errorf("SourceStrings.Delete returned error: %v", err)
	}
}

func TestSourceStringsService_GetUploadStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	projectID := 2
	uploadID := "50fb3506-4127-4ba8-8296-f97dc7e3e0c3"

	mux.HandleFunc(fmt.Sprintf("/api/v2/projects/%d/strings/uploads/%s", projectID, uploadID), func(w http.ResponseWriter, r *http.Request) {
		testURL(t, r, fmt.Sprintf("/api/v2/projects/%d/strings/uploads/%s", projectID, uploadID))
		testMethod(t, r, http.MethodGet)

		fmt.Fprint(w, `{
			"data": {
				"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
				"status": "finished",
				"progress": 100,
				"attributes": {
					"branchId": 38,
					"storageId": 38,
					"fileType": "android",
					"parserVersion": 8,
					"labelIds": [1, 2],
					"importOptions": {
						"firstLineContainsHeader": false,
						"importTranslations": true,
						"scheme": {
							"identifier": 0,
							"sourcePhrase": 1,
							"en": 2,
							"de": 3
						}
					},
					"updateStrings": false,
					"cleanupMode": false
				},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "20123-09-23T11:26:54+00:00",
				"startedAt": "2023-09-23T11:26:54+00:00",
				"finishedAt": "2023-09-23T11:26:54+00:00"
			}
		  }`)
	})

	uploadStatus, _, err := client.SourceStrings.GetUploadStatus(context.Background(), projectID, uploadID)
	if err != nil {
		t.Errorf("SourceStrings.GetUploadStatus returned error: %v", err)
	}

	want := &model.SourceStringsUpload{
		Identifier: "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
		Status:     "finished",
		Progress:   100,
		Attributes: struct {
			BranchID      int    `json:"branchId"`
			StorageID     int    `json:"storageId"`
			FileType      string `json:"fileType"`
			ParserVersion int    `json:"parserVersion"`
			LabelIDs      []int  `json:"labelIds"`
			ImportOptions struct {
				FirstLineContainsHeader bool           `json:"firstLineContainsHeader"`
				ImportTranslations      bool           `json:"importTranslations"`
				Scheme                  map[string]int `json:"scheme"`
			} `json:"importOptions"`
			UpdateStrings bool `json:"updateStrings"`
			CleanupMode   bool `json:"cleanupMode"`
		}{
			BranchID:      38,
			StorageID:     38,
			FileType:      "android",
			ParserVersion: 8,
			LabelIDs:      []int{1, 2},
			ImportOptions: struct {
				FirstLineContainsHeader bool           `json:"firstLineContainsHeader"`
				ImportTranslations      bool           `json:"importTranslations"`
				Scheme                  map[string]int `json:"scheme"`
			}{
				FirstLineContainsHeader: false,
				ImportTranslations:      true,
				Scheme: map[string]int{
					"identifier":   0,
					"sourcePhrase": 1,
					"en":           2,
					"de":           3,
				},
			},
			UpdateStrings: false,
			CleanupMode:   false,
		},
		CreatedAt:  "2023-09-23T11:26:54+00:00",
		UpdatedAt:  "20123-09-23T11:26:54+00:00",
		StartedAt:  "2023-09-23T11:26:54+00:00",
		FinishedAt: "2023-09-23T11:26:54+00:00",
	}
	if !reflect.DeepEqual(uploadStatus, want) {
		t.Errorf("SourceStrings.GetUploadStatus returned %+v, want %+v", uploadStatus, want)
	}
}

func TestSourceStringsService_Upload(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	projectID := 2

	mux.HandleFunc(fmt.Sprintf("/api/v2/projects/%d/strings/uploads", projectID), func(w http.ResponseWriter, r *http.Request) {
		testURL(t, r, fmt.Sprintf("/api/v2/projects/%d/strings/uploads", projectID))
		testMethod(t, r, http.MethodPost)
		testBody(t, r, `{"storageId":61,"branchId":34,"type":"xliff","parserVersion":1,"labelIds":[1,2],"updateStrings":false,"cleanupMode":true,"importOptions":{"firstLineContainsHeader":true,"importTranslations":false,"scheme":{"context":5,"de":9,"en":8,"identifier":1,"labels":7,"maxLength":6,"none":0,"sourceOrTranslation":3,"sourcePhrase":2,"translation":4}}}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"identifier": "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
				"status": "finished",
				"progress": 100,
				"attributes": {
					"branchId": 38,
					"storageId": 38,
					"fileType": "android",
					"parserVersion": 8,
					"labelIds": [1,2],
					"importOptions": {
						"firstLineContainsHeader": false,
						"importTranslations": true,
						"scheme": {
							"identifier": 0,
							"sourcePhrase": 1,
							"en": 2,
							"de": 3
						}
					},
					"updateStrings": false,
					"cleanupMode": false
				},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00",
				"startedAt": "2023-09-23T11:26:54+00:00",
				"finishedAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	req := &model.SourceStringsUploadRequest{
		StorageID:     61,
		BranchID:      34,
		Type:          "xliff",
		ParserVersion: 1,
		LabelIDs:      []int{1, 2},
		UpdateStrings: ToPtr(false),
		CleanupMode:   ToPtr(true),
		ImportOptions: &model.SourceStringsImportOptions{
			FirstLineContainsHeader: ToPtr(true),
			ImportTranslations:      ToPtr(false),
			Scheme: map[string]int{
				"none":                0,
				"identifier":          1,
				"sourcePhrase":        2,
				"sourceOrTranslation": 3,
				"translation":         4,
				"context":             5,
				"maxLength":           6,
				"labels":              7,
				"en":                  8,
				"de":                  9,
			},
		},
	}
	upload, _, err := client.SourceStrings.Upload(context.Background(), projectID, req)
	if err != nil {
		t.Errorf("SourceStrings.Upload returned error: %v", err)
	}

	want := &model.SourceStringsUpload{
		Identifier: "50fb3506-4127-4ba8-8296-f97dc7e3e0c3",
		Status:     "finished",
		Progress:   100,
		Attributes: struct {
			BranchID      int    `json:"branchId"`
			StorageID     int    `json:"storageId"`
			FileType      string `json:"fileType"`
			ParserVersion int    `json:"parserVersion"`
			LabelIDs      []int  `json:"labelIds"`
			ImportOptions struct {
				FirstLineContainsHeader bool           `json:"firstLineContainsHeader"`
				ImportTranslations      bool           `json:"importTranslations"`
				Scheme                  map[string]int `json:"scheme"`
			} `json:"importOptions"`
			UpdateStrings bool `json:"updateStrings"`
			CleanupMode   bool `json:"cleanupMode"`
		}{
			BranchID:      38,
			StorageID:     38,
			FileType:      "android",
			ParserVersion: 8,
			LabelIDs:      []int{1, 2},
			ImportOptions: struct {
				FirstLineContainsHeader bool           `json:"firstLineContainsHeader"`
				ImportTranslations      bool           `json:"importTranslations"`
				Scheme                  map[string]int `json:"scheme"`
			}{
				FirstLineContainsHeader: false,
				ImportTranslations:      true,
				Scheme: map[string]int{
					"identifier":   0,
					"sourcePhrase": 1,
					"en":           2,
					"de":           3,
				},
			},
			UpdateStrings: false,
			CleanupMode:   false,
		},
		CreatedAt:  "2023-09-23T11:26:54+00:00",
		UpdatedAt:  "2023-09-23T11:26:54+00:00",
		StartedAt:  "2023-09-23T11:26:54+00:00",
		FinishedAt: "2023-09-23T11:26:54+00:00",
	}
	if !reflect.DeepEqual(upload, want) {
		t.Errorf("SourceStrings.Upload returned %+v, want %+v", upload, want)
	}
}

func TestSourceStringsService_UploadWithRequiredFields(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/strings/uploads", func(w http.ResponseWriter, r *http.Request) {
		testBody(t, r, `{"storageId":61,"branchId":34}`+"\n")

		fmt.Fprint(w, `{}`)
	})

	_, _, err := client.SourceStrings.Upload(context.Background(), 2, &model.SourceStringsUploadRequest{
		StorageID: 61,
		BranchID:  34,
	})
	if err != nil {
		t.Errorf("SourceStrings.Upload returned error: %v", err)
	}
}

func TestSourceStringsService_UploadWithValidationError(t *testing.T) {
	client, _, teardown := setupClient()
	defer teardown()

	cases := []struct {
		name      string
		req       *model.SourceStringsUploadRequest
		expectErr string
	}{
		{"nil request", nil, "request cannot be nil"},
		{"empty storageId", &model.SourceStringsUploadRequest{BranchID: 34}, "storageId is required"},
		{"empty branchId", &model.SourceStringsUploadRequest{StorageID: 61}, "branchId is required"},
		{"misconfigured updateStrings for non-empty updateOption", &model.SourceStringsUploadRequest{BranchID: 34, StorageID: 61, UpdateStrings: ToPtr(false), UpdateOption: "clear_translations_and_approvals"}, "updateStrings must be set to true to use updateOption"},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			_, _, err := client.SourceStrings.Upload(context.Background(), 2, tt.req)
			if err == nil {
				t.Errorf("SourceStrings.Upload expected error, got nil")
			}

			if err.Error() != tt.expectErr {
				t.Errorf("SourceStrings.Upload returned %+q, want %+q", err, tt.expectErr)
			}
		})
	}
}
