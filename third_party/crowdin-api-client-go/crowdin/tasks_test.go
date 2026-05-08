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

func TestTasksService_Get(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/tasks/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"projectId": 2,
				"creatorId": 6,
				"type": 1,
				"status": "todo",
				"title": "French",
				"assignees": [
					{
						"id": 12,
						"username": "john_smith",
						"fullName": "John Smith",
						"avatarUrl": "",
						"wordsCount": 5,
						"wordsLeft": 3
					}
				],
				"assignedTeams": [
					{
						"id": 1,
						"wordsCount": 5
					}
				],
				"progress": {
					"total": 24,
					"done": 15,
					"percent": 62
				},
				"translateProgress": {
					"total": 24,
					"done": 15,
					"percent": 62
				},
				"sourceLanguageId": "en",
				"targetLanguageId": "fr",
				"description": "Proofread all French strings",
				"translationUrl": "/proofread/9092638ac9f2a2d1b5571d08edc53763/all/en-fr/10?task=dac37aff364d83899128e68afe0de4994",
				"webUrl": "https://crowdin.com/project/example-project/tasks/1",
				"wordsCount": 24,
				"commentsCount": 0,
				"deadline": "2023-09-27T07:00:14+00:00",
				"startedAt": "2023-09-27T07:00:14+00:00",
				"resolvedAt": "2023-09-27T07:00:14+00:00",
				"timeRange": "2023-08-23T09:04:29+00:00|2019-07-23T09:04:29+00:00",
				"workflowStepId": 10,
				"buyUrl": "https://www.paypal.com/cgi-bin/webscr?cmd=...",
				"createdAt": "2023-09-23T09:04:29+00:00",
				"updatedAt": "2023-09-23T09:04:29+00:00",
				"sourceLanguage": {
					"id": "es",
					"name": "Spanish",
					"editorCode": "es",
					"twoLettersCode": "es",
					"threeLettersCode": "spa",
					"locale": "es-ES",
					"androidCode": "es-rES",
					"osxCode": "es.lproj",
					"osxLocale": "es",
					"pluralCategoryNames": ["one"],
					"pluralRules": "(n != 1)",
					"pluralExamples": ["0, 2-999; 1.2, 2.07..."],
					"textDirection": "ltr",
					"dialectOf": "es"
				},
				"targetLanguages": [
					{
						"id": "es",
						"name": "Spanish",
						"editorCode": "es",
						"twoLettersCode": "es",
						"threeLettersCode": "spa",
						"locale": "es-ES",
						"androidCode": "es-rES",
						"osxCode": "es.lproj",
						"osxLocale": "es",
						"pluralCategoryNames": ["one"],
						"pluralRules": "(n != 1)",
						"pluralExamples": ["0, 2-999; 1.2, 2.07..."],
						"textDirection": "ltr",
						"dialectOf": "es"
					}
				],
				"labelIds": [13, 27],
				"excludeLabelIds": [5,8],
				"precedingTaskId": 1,
				"vendor": "gengo",
				"filesCount": 3,
				"fileIds": [24,25,38],
				"branchIds": [24,25,38],
				"fields": {
					"some-field-1": "some value 1",
					"some-field-2": 12,
					"some-field-3": true,
					"some-field-4": ["en","uk"]
				}
			}
		}`)
	})

	task, resp, err := client.Tasks.Get(context.Background(), 1, 2)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Task{
		ID:        2,
		ProjectID: 2,
		CreatorID: 6,
		Type:      1,
		Status:    "todo",
		Title:     "French",
		Assignees: []*model.TaskAssignee{
			{
				ID:         12,
				Username:   "john_smith",
				FullName:   "John Smith",
				AvatarURL:  "",
				WordsCount: 5,
				WordsLeft:  3,
			},
		},
		AssignedTeams: []*model.TaskAssignedTeam{
			{
				ID:         1,
				WordsCount: 5,
			},
		},
		Progress: model.TaskProgress{
			Total:   24,
			Done:    15,
			Percent: 62,
		},
		SourceLanguageID: "en",
		TargetLanguageID: "fr",
		Description:      "Proofread all French strings",
		TranslationURL:   "/proofread/9092638ac9f2a2d1b5571d08edc53763/all/en-fr/10?task=dac37aff364d83899128e68afe0de4994",
		WebURL:           "https://crowdin.com/project/example-project/tasks/1",
		WordsCount:       24,
		CommentsCount:    0,
		Deadline:         "2023-09-27T07:00:14+00:00",
		StartedAt:        "2023-09-27T07:00:14+00:00",
		ResolvedAt:       "2023-09-27T07:00:14+00:00",
		TimeRange:        "2023-08-23T09:04:29+00:00|2019-07-23T09:04:29+00:00",
		WorkflowStepID:   10,
		BuyURL:           "https://www.paypal.com/cgi-bin/webscr?cmd=...",
		CreatedAt:        "2023-09-23T09:04:29+00:00",
		UpdatedAt:        "2023-09-23T09:04:29+00:00",
		SourceLanguage: &model.Language{
			ID:                  "es",
			Name:                "Spanish",
			EditorCode:          "es",
			TwoLettersCode:      "es",
			ThreeLettersCode:    "spa",
			Locale:              "es-ES",
			AndroidCode:         "es-rES",
			OSXCode:             "es.lproj",
			OSXLocale:           "es",
			PluralCategoryNames: []string{"one"},
			PluralRules:         "(n != 1)",
			PluralExamples:      []string{"0, 2-999; 1.2, 2.07..."},
			TextDirection:       "ltr",
			DialectOf:           "es",
		},
		TargetLanguages: []*model.Language{
			{
				ID:                  "es",
				Name:                "Spanish",
				EditorCode:          "es",
				TwoLettersCode:      "es",
				ThreeLettersCode:    "spa",
				Locale:              "es-ES",
				AndroidCode:         "es-rES",
				OSXCode:             "es.lproj",
				OSXLocale:           "es",
				PluralCategoryNames: []string{"one"},
				PluralRules:         "(n != 1)",
				PluralExamples:      []string{"0, 2-999; 1.2, 2.07..."},
				TextDirection:       "ltr",
				DialectOf:           "es",
			},
		},
		LabelIDs:        []int{13, 27},
		ExcludeLabelIDs: []int{5, 8},
		PrecedingTaskID: 1,
		Vendor:          "gengo",
		FilesCount:      3,
		FileIDs:         []int{24, 25, 38},
		BranchIDs:       []int{24, 25, 38},
		Fields: map[string]any{
			"some-field-1": "some value 1",
			"some-field-2": float64(12),
			"some-field-3": true,
			"some-field-4": []any{"en", "uk"},
		},
	}
	assert.Equal(t, expected, task)

	assert.Equal(t, 0, resp.Pagination.Offset)
	assert.Equal(t, 0, resp.Pagination.Limit)
}

func TestTasksService_List(t *testing.T) {
	tests := []struct {
		name    string
		options *model.TasksListOptions
		want    string
	}{
		{
			name:    "nil options",
			options: nil,
			want:    "",
		},
		{
			name:    "empty options",
			options: &model.TasksListOptions{},
			want:    "",
		},
		{
			name: "with options",
			options: &model.TasksListOptions{
				OrderBy:    "createdAt desc,title",
				Status:     []model.TaskStatus{model.TaskStatusTodo, model.TaskStatusInProgress},
				AssigneeID: 123,
				ListOptions: model.ListOptions{
					Offset: 10,
					Limit:  25,
				},
			},
			want: "?assigneeId=123&limit=25&offset=10&orderBy=createdAt+desc%2Ctitle&status=todo%2Cin_progress",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for projectID, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/projects/%d/tasks", projectID)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodGet)
				testURL(t, r, path+tt.want)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 2,
								"fields": {
									"some-field-1": "some value 1",
									"some-field-2": 12,
									"some-field-3": true,
									"some-field-4": ["en","uk"]
								}
							}
						},
						{
							"data": {
								"id": 4,
								"fields": []
							}
						},
						{
							"data": {
								"id": 6,
								"fields": {}
							}
						},
						{
							"data": {
								"id": 8,
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

			tasks, resp, err := client.Tasks.List(context.Background(), projectID, tt.options)
			require.NoError(t, err)

			expected := []*model.Task{
				{
					ID: 2,
					Fields: map[string]any{
						"some-field-1": "some value 1",
						"some-field-2": float64(12),
						"some-field-3": true,
						"some-field-4": []any{"en", "uk"},
					}},
				{ID: 4, Fields: []any{}},
				{ID: 6, Fields: map[string]any{}},
				{ID: 8, Fields: nil},
			}
			assert.Equal(t, expected, tasks)

			assert.Equal(t, 10, resp.Pagination.Offset)
			assert.Equal(t, 25, resp.Pagination.Limit)
		})
	}
}

func TestTasksService_List_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/tasks", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Tasks.List(context.Background(), 2, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestTasksService_Add_TaskCreateForm(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/tasks"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testJSONBody(t, r, `{
			"title":"French",
			"languageId":"en",
			"type":1,
			"fileIds":[1,2,3],
			"labelIds":[1,2,3],
			"excludeLabelIds":[4,5,6],
			"status":"todo",
			"description":"Proofread all French strings",
			"splitContent":true,
			"skipAssignedStrings":true,
			"includePreTranslatedStringsOnly":true,
			"assignees":[
				{
					"id":1,
					"wordsCount":5
				}
			],
			"deadline":"2023-09-27T07:00:14+00:00",
			"startedAt":"2023-08-27T07:00:14+00:00",
			"dateFrom":"2023-08-23T09:04:29+00:00",
			"dateTo":"2023-09-23T09:04:29+00:00"
		}`)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"projectId": 2,
				"creatorId": 6,
				"type": 1,
				"status": "todo",
				"title": "French",
				"assignees": [
					{
						"id": 12,
						"username": "john_smith",
						"fullName": "John Smith",
						"avatarUrl": "",
						"wordsCount": 5,
						"wordsLeft": 3
					}
				],
				"assignedTeams": [
					{
						"id": 1,
						"wordsCount": 5
					}
				],
				"progress": {
					"total": 24,
					"done": 15,
					"percent": 62
				},
				"translateProgress": {
					"total": 24,
					"done": 15,
					"percent": 62
				},
				"sourceLanguageId": "en",
				"targetLanguageId": "fr",
				"description": "Proofread all French strings",
				"translationUrl": "/proofread/9092638ac9f2a2d1b5571d08edc53763/all/en-fr/10?task=dac37aff364d83899128e68afe0de4994",
				"webUrl": "https://crowdin.com/project/example-project/tasks/1",
				"wordsCount": 24,
				"commentsCount": 0,
				"deadline": "2023-09-27T07:00:14+00:00",
				"startedAt": "2023-09-27T07:00:14+00:00",
				"resolvedAt": "2023-09-27T07:00:14+00:00",
				"timeRange": "2023-08-23T09:04:29+00:00|2019-07-23T09:04:29+00:00",
				"workflowStepId": 10,
				"buyUrl": "https://www.paypal.com/cgi-bin/webscr?cmd=...",
				"createdAt": "2023-09-23T09:04:29+00:00",
				"updatedAt": "2023-09-23T09:04:29+00:00",
				"sourceLanguage": {
					"id": "es",
					"name": "Spanish",
					"editorCode": "es",
					"twoLettersCode": "es",
					"threeLettersCode": "spa",
					"locale": "es-ES",
					"androidCode": "es-rES",
					"osxCode": "es.lproj",
					"osxLocale": "es",
					"pluralCategoryNames": ["one"],
					"pluralRules": "(n != 1)",
					"pluralExamples": ["0, 2-999; 1.2, 2.07..."],
					"textDirection": "ltr",
					"dialectOf": "es"
				},
				"targetLanguages": [
					{
						"id": "es",
						"name": "Spanish",
						"editorCode": "es",
						"twoLettersCode": "es",
						"threeLettersCode": "spa",
						"locale": "es-ES",
						"androidCode": "es-rES",
						"osxCode": "es.lproj",
						"osxLocale": "es",
						"pluralCategoryNames": ["one"],
						"pluralRules": "(n != 1)",
						"pluralExamples": ["0, 2-999; 1.2, 2.07..."],
						"textDirection": "ltr",
						"dialectOf": "es"
					}
				],
				"labelIds": [13,27],
				"excludeLabelIds": [5,8],
				"precedingTaskId": 1,
				"vendor": "gengo",
				"filesCount": 3,
				"fileIds": [24,25,38]
			}
		}`)
	})

	req := &model.TaskCreateForm{
		Title:                           "French",
		LanguageID:                      "en",
		Type:                            ToPtr(model.TaskTypeProofread),
		FileIDs:                         []int{1, 2, 3},
		LabelIDs:                        []int{1, 2, 3},
		ExcludeLabelIDs:                 []int{4, 5, 6},
		Status:                          model.TaskStatusTodo,
		Description:                     "Proofread all French strings",
		SplitContent:                    ToPtr(true),
		SkipAssignedStrings:             ToPtr(true),
		IncludePreTranslatedStringsOnly: ToPtr(true),
		Assignees:                       []model.CrowdinTaskAssignee{{ID: 1, WordsCount: 5}},
		Deadline:                        "2023-09-27T07:00:14+00:00",
		StartedAt:                       "2023-08-27T07:00:14+00:00",
		DateFrom:                        "2023-08-23T09:04:29+00:00",
		DateTo:                          "2023-09-23T09:04:29+00:00",
	}
	task, resp, err := client.Tasks.Add(context.Background(), 1, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Task{
		ID:        2,
		ProjectID: 2,
		CreatorID: 6,
		Type:      1,
		Status:    "todo",
		Title:     "French",
		Assignees: []*model.TaskAssignee{
			{
				ID:         12,
				Username:   "john_smith",
				FullName:   "John Smith",
				AvatarURL:  "",
				WordsCount: 5,
				WordsLeft:  3,
			},
		},
		AssignedTeams: []*model.TaskAssignedTeam{
			{
				ID:         1,
				WordsCount: 5,
			},
		},
		Progress: model.TaskProgress{
			Total:   24,
			Done:    15,
			Percent: 62,
		},
		SourceLanguageID: "en",
		TargetLanguageID: "fr",
		Description:      "Proofread all French strings",
		TranslationURL:   "/proofread/9092638ac9f2a2d1b5571d08edc53763/all/en-fr/10?task=dac37aff364d83899128e68afe0de4994",
		WebURL:           "https://crowdin.com/project/example-project/tasks/1",
		WordsCount:       24,
		CommentsCount:    0,
		Deadline:         "2023-09-27T07:00:14+00:00",
		StartedAt:        "2023-09-27T07:00:14+00:00",
		ResolvedAt:       "2023-09-27T07:00:14+00:00",
		TimeRange:        "2023-08-23T09:04:29+00:00|2019-07-23T09:04:29+00:00",
		WorkflowStepID:   10,
		BuyURL:           "https://www.paypal.com/cgi-bin/webscr?cmd=...",
		CreatedAt:        "2023-09-23T09:04:29+00:00",
		UpdatedAt:        "2023-09-23T09:04:29+00:00",
		SourceLanguage: &model.Language{
			ID:                  "es",
			Name:                "Spanish",
			EditorCode:          "es",
			TwoLettersCode:      "es",
			ThreeLettersCode:    "spa",
			Locale:              "es-ES",
			AndroidCode:         "es-rES",
			OSXCode:             "es.lproj",
			OSXLocale:           "es",
			PluralCategoryNames: []string{"one"},
			PluralRules:         "(n != 1)",
			PluralExamples:      []string{"0, 2-999; 1.2, 2.07..."},
			TextDirection:       "ltr",
			DialectOf:           "es",
		},
		TargetLanguages: []*model.Language{
			{
				ID:                  "es",
				Name:                "Spanish",
				EditorCode:          "es",
				TwoLettersCode:      "es",
				ThreeLettersCode:    "spa",
				Locale:              "es-ES",
				AndroidCode:         "es-rES",
				OSXCode:             "es.lproj",
				OSXLocale:           "es",
				PluralCategoryNames: []string{"one"},
				PluralRules:         "(n != 1)",
				PluralExamples:      []string{"0, 2-999; 1.2, 2.07..."},
				TextDirection:       "ltr",
				DialectOf:           "es",
			},
		},
		LabelIDs:        []int{13, 27},
		ExcludeLabelIDs: []int{5, 8},
		PrecedingTaskID: 1,
		Vendor:          "gengo",
		FilesCount:      3,
		FileIDs:         []int{24, 25, 38},
	}
	assert.Equal(t, expected, task)
}

func TestTasksService_Add_LanguageServiceTaskCreateForm(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/tasks"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"title":"French","languageId":"en","type":3,"vendor":"crowdin_language_service","branchIds":[1,2,3]}`+"\n")

		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, `{
			"data": {
				"id": 2
			}
		}`)
	})

	req := &model.LanguageServiceTaskCreateForm{
		Title:      "French",
		LanguageID: "en",
		Type:       model.TaskTypeProofreadByVendor,
		Vendor:     model.TaskVendorCrowdinLanguageService,
		BranchIDs:  []int{1, 2, 3},
	}
	task, resp, err := client.Tasks.Add(context.Background(), 1, req)
	require.NoError(t, err)
	assert.Equal(t, 2, task.ID)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
}

func TestTasksService_Edit(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/tasks/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/status","value":"in_progress"},{"op":"replace","path":"/title","value":"French"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"status": "in_progress",
				"title": "French"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/status",
			Value: "in_progress",
		},
		{
			Op:    "replace",
			Path:  "/title",
			Value: "French",
		},
	}
	task, resp, err := client.Tasks.Edit(context.Background(), 1, 2, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	assert.Equal(t, 2, task.ID)
	assert.Equal(t, model.TaskStatusInProgress, task.Status)
	assert.Equal(t, "French", task.Title)
}

func TestTasksService_Delete(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/tasks/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Tasks.Delete(context.Background(), 1, 2)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestTasksService_ListUserTasks(t *testing.T) {
	tests := []struct {
		name    string
		options *model.UserTasksListOptions
		want    string
	}{
		{
			name:    "nil options",
			options: nil,
			want:    "",
		},
		{
			name:    "empty options",
			options: &model.UserTasksListOptions{},
			want:    "",
		},
		{
			name:    "with isArchived=0",
			options: &model.UserTasksListOptions{IsArchived: ToPtr(0)},
			want:    "?isArchived=0",
		},
		{
			name: "with options",
			options: &model.UserTasksListOptions{
				OrderBy:    "createdAt desc,title",
				Status:     []model.TaskStatus{model.TaskStatusTodo, model.TaskStatusInProgress},
				IsArchived: ToPtr(1),
				ListOptions: model.ListOptions{
					Offset: 10,
					Limit:  25,
				},
			},
			want: "?isArchived=1&limit=25&offset=10&orderBy=createdAt+desc%2Ctitle&status=todo%2Cin_progress",
		},
	}

	for _, tt := range tests {
		client, mux, teardown := setupClient()
		defer teardown()

		t.Run(tt.name, func(t *testing.T) {
			const path = "/api/v2/user/tasks"
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodGet)
				testURL(t, r, path+tt.want)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 2,
								"isArchived": false
							}
						},
						{
							"data": {
								"id": 4,
								"isArchived": true
							}
						}
					],
					"pagination": {
						"offset": 10,
						"limit": 25
					}
				}`)
			})

			tasks, resp, err := client.Tasks.ListUserTasks(context.Background(), tt.options)
			require.NoError(t, err)

			expected := []*model.Task{
				{ID: 2, IsArchived: ToPtr(false)},
				{ID: 4, IsArchived: ToPtr(true)}}
			assert.Equal(t, expected, tasks)

			assert.Equal(t, 10, resp.Pagination.Offset)
			assert.Equal(t, 25, resp.Pagination.Limit)
		})
	}
}

func TestTasksService_ListUserTasks_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/user/tasks", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Tasks.ListUserTasks(context.Background(), nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestTasksService_EditArchivedStatus(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const (
		projectID = 123
		path      = "/api/v2/tasks/2"
	)

	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path+fmt.Sprintf("?projectId=%d", projectID))
		testBody(t, r, `[{"op":"replace","path":"/isArchived","value":true}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"isArchived": true
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/isArchived",
			Value: true,
		},
	}
	task, resp, err := client.Tasks.EditArchivedStatus(context.Background(), projectID, 2, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	assert.Equal(t, 2, task.ID)
	assert.Equal(t, true, *task.IsArchived)
}

func TestTasksService_ExportStrings(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/tasks/2/exports"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"url": "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff",
				"expireIn": "2023-09-27T07:00:14+00:00"
			}
		}`)
	})

	link, resp, err := client.Tasks.ExportStrings(context.Background(), 1, 2)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	assert.Equal(t, "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff", link.URL)
	assert.Equal(t, "2023-09-27T07:00:14+00:00", link.ExpireIn)
}

func TestTasksService_ExportStrings_NoStrings(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/tasks/2/exports"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	link, resp, err := client.Tasks.ExportStrings(context.Background(), 1, 2)
	require.NoError(t, err)
	assert.Nil(t, link)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestTasksService_GetSettingsTepmlate(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/tasks/settings-templates/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "Default template",
				"config": {
					"languages": [
						{
							"languageId": "uk",
							"userIds": [1, "2"]
						}
					]
				},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	template, resp, err := client.Tasks.GetSettingsTemplate(context.Background(), 1, 2)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.TaskSettingsTemplate{
		ID:   1,
		Name: "Default template",
		Config: model.TaskSettingsTemplateConfig{
			Languages: []model.TaskSettingsTemplateLanguage{
				{
					LanguageID: "uk",
					UserIDs:    []model.UserID{1, 2},
				},
			},
		},
		CreatedAt: "2023-09-23T11:26:54+00:00",
		UpdatedAt: "2023-09-23T11:26:54+00:00",
	}
	assert.Equal(t, expected, template)
}

func TestTasksService_ListSettingsTepmlates(t *testing.T) {
	tests := []struct {
		name string
		opts *model.ListOptions
		want string
	}{
		{
			name: "nil options",
			opts: nil,
			want: "",
		},
		{
			name: "empty options",
			opts: &model.ListOptions{},
			want: "",
		},
		{
			name: "with options",
			opts: &model.ListOptions{
				Offset: 10,
				Limit:  25,
			},
			want: "?limit=25&offset=10",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for projectID, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/projects/%d/tasks/settings-templates", projectID)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodGet)
				testURL(t, r, path+tt.want)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 1,
								"name": "Default template",
								"config": {
									"languages": [
										{
											"languageId": "uk",
											"userIds": [1],
											"teamIds": [2]
										}
									]
								},
								"createdAt": "2023-09-23T11:26:54+00:00",
								"updatedAt": "2023-09-23T11:26:54+00:00"
							}
						},
						{
							"data": {
								"id": 2,
								"name": "Test template",
								"config": {
									"languages": [
										{
											"languageId": "uk",
											"userIds": ["1", "2", 3],
											"teamIds": [2]
										}
									]
								},
								"createdAt": "2023-09-23T11:26:54+00:00",
								"updatedAt": "2023-09-23T11:26:54+00:00"
							}
						}
					],
					"pagination": {
						"offset": 0,
						"limit": 25
					}
				}`)
			})

			templates, resp, err := client.Tasks.ListSettingsTemplates(context.Background(), projectID, tt.opts)
			require.NoError(t, err)

			expected := []*model.TaskSettingsTemplate{
				{
					ID:   1,
					Name: "Default template",
					Config: model.TaskSettingsTemplateConfig{
						Languages: []model.TaskSettingsTemplateLanguage{
							{
								LanguageID: "uk",
								UserIDs:    []model.UserID{1},
								TeamIDs:    []int{2},
							},
						},
					},
					CreatedAt: "2023-09-23T11:26:54+00:00",
					UpdatedAt: "2023-09-23T11:26:54+00:00",
				},
				{
					ID:   2,
					Name: "Test template",
					Config: model.TaskSettingsTemplateConfig{
						Languages: []model.TaskSettingsTemplateLanguage{
							{
								LanguageID: "uk",
								UserIDs:    []model.UserID{1, 2, 3},
								TeamIDs:    []int{2},
							},
						},
					},
					CreatedAt: "2023-09-23T11:26:54+00:00",
					UpdatedAt: "2023-09-23T11:26:54+00:00",
				},
			}
			assert.Equal(t, expected, templates)

			assert.Equal(t, 0, resp.Pagination.Offset)
			assert.Equal(t, 25, resp.Pagination.Limit)
		})
	}
}

func TestTasksService_ListSettingsTepmlates_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/tasks/settings-templates", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Tasks.ListSettingsTemplates(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestTasksService_AddSettingsTepmlates(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/tasks/settings-templates"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"name":"Default template","config":{"languages":[{"languageId":"uk","userIds":[1]}]}}`+"\n")

		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "Default template",
				"config": {
					"languages": [
						{
							"languageId": "uk",
							"userIds": [1]
						}
					]
				},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	req := &model.TaskSettingsTemplateAddRequest{
		Name: "Default template",
		Config: model.TaskSettingsTemplateConfig{
			Languages: []model.TaskSettingsTemplateLanguage{
				{
					LanguageID: "uk",
					UserIDs:    []model.UserID{1},
				},
			},
		},
	}
	template, resp, err := client.Tasks.AddSettingsTemplate(context.Background(), 1, req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	expected := &model.TaskSettingsTemplate{
		ID:   1,
		Name: "Default template",
		Config: model.TaskSettingsTemplateConfig{
			Languages: []model.TaskSettingsTemplateLanguage{
				{
					LanguageID: "uk",
					UserIDs:    []model.UserID{1},
				},
			},
		},
		CreatedAt: "2023-09-23T11:26:54+00:00",
		UpdatedAt: "2023-09-23T11:26:54+00:00",
	}
	assert.Equal(t, expected, template)
}

func TestTasksService_EditSettingsTepmlates(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/tasks/settings-templates/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/name","value":"Default template"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"name": "Default template",
				"config": {
					"languages": [
						{
							"languageId": "uk",
							"userIds": ["1"]
						}
					]
				},
				"createdAt": "2023-09-23T11:26:54+00:00",
				"updatedAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/name",
			Value: "Default template",
		},
	}
	template, resp, err := client.Tasks.EditSettingsTemplate(context.Background(), 1, 2, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.TaskSettingsTemplate{
		ID:   1,
		Name: "Default template",
		Config: model.TaskSettingsTemplateConfig{
			Languages: []model.TaskSettingsTemplateLanguage{
				{
					LanguageID: "uk",
					UserIDs:    []model.UserID{1},
				},
			},
		},
		CreatedAt: "2023-09-23T11:26:54+00:00",
		UpdatedAt: "2023-09-23T11:26:54+00:00",
	}
	assert.Equal(t, expected, template)
}

func TestTasksService_DeleteSettingsTepmlates(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/tasks/settings-templates/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Tasks.DeleteSettingsTemplate(context.Background(), 1, 2)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestTasksService_GetComment(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/tasks/2/comments/3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 3,
				"userId": 5,
				"taskId": 2,
				"text": "translate task",
				"timeSpent": 3600,
				"createdAt": "2025-09-23T09:04:29+00:00",
				"updatedAt": "2025-09-23T09:04:29+00:00"
			}
		}`)
	})

	comment, resp, err := client.Tasks.GetComment(context.Background(), 1, 2, 3)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.TaskComment{
		ID:        3,
		UserID:    5,
		TaskID:    2,
		Text:      "translate task",
		TimeSpent: 3600,
		CreatedAt: "2025-09-23T09:04:29+00:00",
		UpdatedAt: "2025-09-23T09:04:29+00:00",
	}
	assert.Equal(t, expected, comment)
}

func TestTasksService_ListComments(t *testing.T) {
	tests := []struct {
		name string
		opts *model.ListOptions
		want string
	}{
		{
			name: "nil options",
			opts: nil,
			want: "",
		},
		{
			name: "empty options",
			opts: &model.ListOptions{},
			want: "",
		},
		{
			name: "with options",
			opts: &model.ListOptions{
				Offset: 10,
				Limit:  25,
			},
			want: "?limit=25&offset=10",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for projectID, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/projects/%d/tasks/2/comments", projectID)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodGet)
				testURL(t, r, path+tt.want)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 3,
								"userId": 5,
								"taskId": 2,
								"text": "translate task",
								"timeSpent": 3600,
								"createdAt": "2025-09-23T09:04:29+00:00",
								"updatedAt": "2025-09-23T09:04:29+00:00"
							}
						},
						{
							"data": {
								"id": 4,
								"userId": 5,
								"taskId": 2,
								"text": "translate task 2",
								"timeSpent": 0,
								"createdAt": "2025-09-23T09:04:29+00:00",
								"updatedAt": "2025-09-23T09:04:29+00:00"
							}
						}
					],
					"pagination": {
						"offset": 0,
						"limit": 25
					}
				}`)
			})

			comments, resp, err := client.Tasks.ListComments(context.Background(), projectID, 2, tt.opts)
			require.NoError(t, err)

			expected := []*model.TaskComment{
				{
					ID:        3,
					UserID:    5,
					TaskID:    2,
					Text:      "translate task",
					TimeSpent: 3600,
					CreatedAt: "2025-09-23T09:04:29+00:00",
					UpdatedAt: "2025-09-23T09:04:29+00:00",
				},
				{
					ID:        4,
					UserID:    5,
					TaskID:    2,
					Text:      "translate task 2",
					TimeSpent: 0,
					CreatedAt: "2025-09-23T09:04:29+00:00",
					UpdatedAt: "2025-09-23T09:04:29+00:00",
				},
			}
			assert.Equal(t, expected, comments)

			assert.Equal(t, 0, resp.Pagination.Offset)
			assert.Equal(t, 25, resp.Pagination.Limit)
		})
	}
}

func TestTasksService_ListComments_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/tasks/2/comments", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Tasks.ListComments(context.Background(), 1, 2, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestTasksService_AddComment(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/tasks/2/comments"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"text":"work in task","timeSpent":3600}`+"\n")

		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"userId": 5,
				"taskId": 2,
				"text": "work in task",
				"timeSpent": 3600,
				"createdAt": "2025-09-23T09:04:29+00:00",
				"updatedAt": "2025-09-23T09:04:29+00:00"
			}
		}`)
	})

	req := &model.TaskCommentAddRequest{
		Text:      "work in task",
		TimeSpent: 3600,
	}
	comment, resp, err := client.Tasks.AddComment(context.Background(), 1, 2, req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	expected := &model.TaskComment{
		ID:        1,
		UserID:    5,
		TaskID:    2,
		Text:      "work in task",
		TimeSpent: 3600,
		CreatedAt: "2025-09-23T09:04:29+00:00",
		UpdatedAt: "2025-09-23T09:04:29+00:00",
	}
	assert.Equal(t, expected, comment)
}

func TestTasksService_EditComment(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/tasks/2/comments/3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/text","value":"work in task"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 1,
				"userId": 5,
				"taskId": 2,
				"text": "work in task",
				"timeSpent": 3600,
				"createdAt": "2025-09-23T09:04:29+00:00",
				"updatedAt": "2025-09-23T09:04:29+00:00"
			}
		}`)
	})
	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/text",
			Value: "work in task",
		},
	}
	comment, resp, err := client.Tasks.EditComment(context.Background(), 1, 2, 3, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)
	expected := &model.TaskComment{
		ID:        1,
		UserID:    5,
		TaskID:    2,
		Text:      "work in task",
		TimeSpent: 3600,
		CreatedAt: "2025-09-23T09:04:29+00:00",
		UpdatedAt: "2025-09-23T09:04:29+00:00",
	}
	assert.Equal(t, expected, comment)
}

func TestTasksService_DeleteComment(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/tasks/2/comments/3"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Tasks.DeleteComment(context.Background(), 1, 2, 3)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}
