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

func TestStringTranslationsService_ListApprovals(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	cases := []struct {
		name   string
		opts   *model.ApprovalsListOptions
		expect string
	}{
		{
			name:   "nil options",
			opts:   nil,
			expect: "",
		},
		{
			name:   "empty options",
			opts:   &model.ApprovalsListOptions{},
			expect: "",
		},
		{
			name: "with options",
			opts: &model.ApprovalsListOptions{
				OrderBy:         "createdAt desc,id",
				FileID:          1,
				LabelIDs:        []int{1, 2},
				ExcludeLabelIDs: []int{3, 4},
				StringID:        2345,
				LanguageID:      "uk",
				TranslationID:   190695,
				ListOptions: model.ListOptions{
					Offset: 10,
					Limit:  25,
				},
			},
			expect: "?excludeLabelIds=3%2C4&fileId=1&labelIds=1%2C2&languageId=uk&limit=25&offset=10&orderBy=createdAt+desc%2Cid&stringId=2345&translationId=190695",
		},
	}

	for projectID, tt := range cases {
		path := fmt.Sprintf("/api/v2/projects/%d/approvals", projectID)
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, http.MethodGet)
			testURL(t, r, path+tt.expect)

			fmt.Fprint(w, `{
				"data": [
					{
						"data": {
							"id": 190695,
							"user": {
								"id": 19,
								"username": "john_doe",
								"fullName": "John Smith",
								"avatarUrl": ""
							},
							"translationId": 190695,
							"stringId": 2345,
							"languageId": "uk",
							"createdAt": "2023-09-19T12:42:12+00:00"
						}
					}
				],
				"pagination": {
					"offset": 10,
					"limit": 25
				}
			}`)
		})

		list, resp, err := client.StringTranslations.ListApprovals(context.Background(), projectID, tt.opts)
		require.NoError(t, err)

		expected := []*model.Approval{
			{
				ID: 190695,
				User: &model.ShortUser{
					ID:        19,
					Username:  "john_doe",
					FullName:  "John Smith",
					AvatarURL: "",
				},
				TranslationID: 190695,
				StringID:      2345,
				LanguageID:    "uk",
				CreatedAt:     "2023-09-19T12:42:12+00:00",
			},
		}
		assert.Equal(t, expected, list)

		expectedPagination := model.Pagination{Offset: 10, Limit: 25}
		assert.Equal(t, expectedPagination, resp.Pagination)
	}
}

func TestStringTranslationsService_ListApprovals_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/approvals", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.StringTranslations.ListApprovals(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestStringTranslationsService_GetApproval(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/approvals/190695"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 190695,
				"user": {
					"id": 19,
					"username": "john_doe",
					"fullName": "John Smith",
					"avatarUrl": ""
				},
				"translationId": 190695,
				"stringId": 2345,
				"languageId": "uk",
				"createdAt": "2023-09-19T12:42:12+00:00"
			}
		}`)
	})

	approval, resp, err := client.StringTranslations.GetApproval(context.Background(), 1, 190695)
	require.NoError(t, err)

	expected := &model.Approval{
		ID: 190695,
		User: &model.ShortUser{
			ID:        19,
			Username:  "john_doe",
			FullName:  "John Smith",
			AvatarURL: "",
		},
		TranslationID: 190695,
		StringID:      2345,
		LanguageID:    "uk",
		CreatedAt:     "2023-09-19T12:42:12+00:00",
	}
	assert.Equal(t, expected, approval)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestStringTranslationsService_AddApproval(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/approvals"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"translationId":190695}`+"\n")

		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, `{
			"data": {
			  "id": 190695,
			  "user": {
					"id": 19,
					"username": "john_doe",
					"fullName": "John Smith",
					"avatarUrl": ""
			  },
			  "translationId": 190695,
			  "stringId": 2345,
			  "languageId": "uk",
			  "createdAt": "2023-09-19T12:42:12+00:00"
			}
		}`)
	})

	approval, resp, err := client.StringTranslations.AddApproval(context.Background(), 1, 190695)
	require.NoError(t, err)

	expected := &model.Approval{
		ID: 190695,
		User: &model.ShortUser{
			ID:        19,
			Username:  "john_doe",
			FullName:  "John Smith",
			AvatarURL: "",
		},
		TranslationID: 190695,
		StringID:      2345,
		LanguageID:    "uk",
		CreatedAt:     "2023-09-19T12:42:12+00:00",
	}
	assert.Equal(t, expected, approval)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
}

func TestStringTransactionsService_ApprovalBatchOperations(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/approvals"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"remove","path":"/190695"}]`+"\n")

		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 190696,
						"user": {
							"id": 19,
							"username": "john_doe",
							"fullName": "John Smith",
							"avatarUrl": ""
						},
						"translationId": 190696,
						"stringId": 2345,
						"languageId": "uk",
						"createdAt": "2023-09-19T12:42:12+00:00"
					}
				}
			]
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:   "remove",
			Path: "/190695",
		},
	}

	approval, resp, err := client.StringTranslations.ApprovalBatchOperations(context.Background(), 1, req)
	require.NoError(t, err)

	expected := []*model.Approval{
		{
			ID: 190696,
			User: &model.ShortUser{
				ID:        19,
				Username:  "john_doe",
				FullName:  "John Smith",
				AvatarURL: "",
			},
			TranslationID: 190696,
			StringID:      2345,
			LanguageID:    "uk",
			CreatedAt:     "2023-09-19T12:42:12+00:00",
		},
	}
	assert.Equal(t, expected, approval)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestStringTransactionsService_TranslationBatchOperations(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/translations"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"remove","path":"/190695"}]`+"\n")

		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 190695,
						"text": "Цю стрічку перекладено",
						"pluralCategoryName": "few",
						"user": {
							"id": 19,
							"username": "john_doe",
							"fullName": "John Smith",
							"avatarUrl": ""
						},
						"rating": 10,
						"isPreTranslated": true,
						"createdAt": "2019-09-23T11:26:54+00:00"
					}
				}
			]
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:   "remove",
			Path: "/190695",
		},
	}

	translation, resp, err := client.StringTranslations.TranslationBatchOperations(context.Background(), 1, req)
	require.NoError(t, err)

	expected := []*model.Translation{
		{
			ID:                 190695,
			Text:               "Цю стрічку перекладено",
			PluralCategoryName: "few",
			User: &model.ShortUser{
				ID:        19,
				Username:  "john_doe",
				FullName:  "John Smith",
				AvatarURL: "",
			},
			Rating:          10,
			IsPreTranslated: true,
			CreatedAt:       "2019-09-23T11:26:54+00:00",
		},
	}
	assert.Equal(t, expected, translation)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestStringTranslationsService_RemoveStringApprovals(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/approvals"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path+"?stringId=2345")

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.StringTranslations.RemoveStringApprovals(context.Background(), 1, 2345)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestStringTranslationsService_RemoveApproval(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/approvals/190695"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.StringTranslations.RemoveApproval(context.Background(), 1, 190695)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestStringTranslationsService_ListLanguageTranslations(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	cases := []struct {
		name   string
		opts   *model.LanguageTranslationsListOptions
		expect string
	}{
		{
			name:   "nil options",
			opts:   nil,
			expect: "",
		},
		{
			name:   "empty options",
			opts:   &model.LanguageTranslationsListOptions{},
			expect: "",
		},
		{
			name: "with options",
			opts: &model.LanguageTranslationsListOptions{
				StringIDs: []int{1, 2},
				FileID:    5,
			},
			expect: "?fileId=5&stringIds=1%2C2",
		},
		{
			name: "with all options",
			opts: &model.LanguageTranslationsListOptions{
				OrderBy:                 "createdAt desc,id",
				StringIDs:               []int{1, 2},
				LabelIDs:                []int{3, 4},
				FileID:                  5,
				BranchID:                6,
				DirectoryID:             7,
				CroQL:                   "croql",
				DenormalizePlaceholders: ToPtr(0),
				ListOptions:             model.ListOptions{Offset: 10, Limit: 25},
			},
			expect: "?branchId=6&croql=croql&denormalizePlaceholders=0&directoryId=7&fileId=5&labelIds=3%2C4&limit=25&offset=10&orderBy=createdAt+desc%2Cid&stringIds=1%2C2",
		},
	}

	for projectID, tt := range cases {
		path := fmt.Sprintf("/api/v2/projects/%d/languages/uk/translations", projectID)
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, http.MethodGet)
			testURL(t, r, path+tt.expect)

			fmt.Fprint(w, `{
				"data": [
					{
						"data": {
							"stringId": 6356,
							"contentType": "text/plain",
							"translationId": 732,
							"text": "Confirm New Password",
							"user": {
								"id": 19,
								"username": "john_doe",
								"fullName": "John Smith",
								"avatarUrl": ""
							},
							"createdAt": "2023-09-23T11:26:54+00:00"
						}
					}
				],
				"pagination": {
					"offset": 10,
					"limit": 25
				}
			}`)
		})

		list, resp, err := client.StringTranslations.ListLanguageTranslations(context.Background(), projectID, "uk", tt.opts)
		require.NoError(t, err)

		expected := []*model.LanguageTranslation{
			{
				StringID:      6356,
				ContentType:   "text/plain",
				TranslationID: ToPtr(732),
				Text:          ToPtr("Confirm New Password"),
				User: &model.ShortUser{
					ID:        19,
					Username:  "john_doe",
					FullName:  "John Smith",
					AvatarURL: "",
				},
				CreatedAt: ToPtr("2023-09-23T11:26:54+00:00"),
			},
		}
		assert.Equal(t, expected, list)

		expectedPagination := model.Pagination{Offset: 10, Limit: 25}
		assert.Equal(t, expectedPagination, resp.Pagination)
	}
}

func TestStringTranslationsService_ListLanguageTranslations_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/languages/uk/translations", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.StringTranslations.ListLanguageTranslations(context.Background(), 1, "uk", nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestStringTranslationsService_ListStringTranslations(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	cases := []struct {
		name   string
		opts   *model.StringTranslationsListOptions
		expect string
	}{
		{
			name:   "nil options",
			opts:   nil,
			expect: "",
		},
		{
			name:   "empty options",
			opts:   &model.StringTranslationsListOptions{},
			expect: "",
		},
		{
			name: "required options",
			opts: &model.StringTranslationsListOptions{
				StringID:   2345,
				LanguageID: "uk",
			},
			expect: "?languageId=uk&stringId=2345",
		},
		{
			name:   "with denormalizePlaceholders=0",
			opts:   &model.StringTranslationsListOptions{DenormalizePlaceholders: ToPtr(0)},
			expect: "?denormalizePlaceholders=0",
		},
		{
			name:   "with denormalizePlaceholders=1",
			opts:   &model.StringTranslationsListOptions{DenormalizePlaceholders: ToPtr(1)},
			expect: "?denormalizePlaceholders=1",
		},
		{
			name: "with all options",
			opts: &model.StringTranslationsListOptions{
				StringID:                2345,
				LanguageID:              "uk",
				OrderBy:                 "createdAt desc,id",
				DenormalizePlaceholders: ToPtr(1),
				ListOptions:             model.ListOptions{Offset: 10, Limit: 25},
			},
			expect: "?denormalizePlaceholders=1&languageId=uk&limit=25&offset=10&orderBy=createdAt+desc%2Cid&stringId=2345",
		},
	}

	for projectID, tt := range cases {
		path := fmt.Sprintf("/api/v2/projects/%d/translations", projectID)
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, http.MethodGet)
			testURL(t, r, path+tt.expect)

			fmt.Fprint(w, `{
				"data": [
					{
						"data": {
							"id": 190695,
							"text": "Цю стрічку перекладено",
							"pluralCategoryName": "few",
							"user": {
								"id": 19,
								"username": "john_doe",
								"fullName": "John Smith",
								"avatarUrl": ""
							},
							"rating": 10,
							"provider": "tm",
							"isPreTranslated": true,
							"createdAt": "2023-09-23T11:26:54+00:00"
						}
					}
				],
				"pagination": {
					"offset": 10,
					"limit": 25
				}
			}`)
		})

		list, resp, err := client.StringTranslations.ListStringTranslations(context.Background(), projectID, tt.opts)
		require.NoError(t, err)

		expected := []*model.Translation{
			{
				ID:                 190695,
				Text:               "Цю стрічку перекладено",
				PluralCategoryName: "few",
				User: &model.ShortUser{
					ID:        19,
					Username:  "john_doe",
					FullName:  "John Smith",
					AvatarURL: "",
				},
				Rating:          10,
				Provider:        ToPtr("tm"),
				IsPreTranslated: true,
				CreatedAt:       "2023-09-23T11:26:54+00:00",
			},
		}
		assert.Equal(t, expected, list)

		expectedPagination := model.Pagination{Offset: 10, Limit: 25}
		assert.Equal(t, expectedPagination, resp.Pagination)
	}
}

func TestStringTranslationsService_ListStringTranslations_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/translations", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.StringTranslations.ListStringTranslations(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestStringTranslationsService_TranslationAlignment(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/translations/alignment"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"sourceLanguageId":"en","targetLanguageId":"de","text":"Your password has been reset successfully!"}`+"\n")

		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{
			"data": {
				"words": [
					{
						"text": "password",
						"alignments": [
							{
								"sourceWord": "Password",
								"sourceLemma": "password",
								"targetWord": "Пароль",
								"targetLemma": "пароль",
								"match": 2,
								"probability": 2
							}
						]
					}
				]
			}
		}`)
	})

	req := &model.TranslationAlignmentRequest{
		SourceLanguageID: "en",
		TargetLanguageID: "de",
		Text:             "Your password has been reset successfully!",
	}
	res, resp, err := client.StringTranslations.TranslationAlignment(context.Background(), 1, req)
	require.NoError(t, err)

	expected := &model.TranslationAlignment{
		Words: []*model.WordAlignment{
			{
				Text: "password",
				Alignments: []*model.Alignment{
					{
						SourceWord:  "Password",
						SourceLemma: "password",
						TargetWord:  "Пароль",
						TargetLemma: "пароль",
						Match:       2,
						Probability: 2,
					},
				},
			},
		},
	}
	assert.Equal(t, expected, res)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestStringTranslationsService_GetTranslation(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	cases := []struct {
		name   string
		opts   *model.TranslationGetOptions
		expect string
	}{
		{
			name:   "nil options",
			opts:   nil,
			expect: "",
		},
		{
			name:   "empty options",
			opts:   &model.TranslationGetOptions{},
			expect: "",
		},
		{
			name:   "with denormalizePlaceholders=0",
			opts:   &model.TranslationGetOptions{DenormalizePlaceholders: ToPtr(0)},
			expect: "?denormalizePlaceholders=0",
		},
		{
			name:   "with denormalizePlaceholders=1",
			opts:   &model.TranslationGetOptions{DenormalizePlaceholders: ToPtr(1)},
			expect: "?denormalizePlaceholders=1",
		},
	}

	for projectID, tt := range cases {
		path := fmt.Sprintf("/api/v2/projects/%d/translations/190695", projectID)
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, http.MethodGet)
			testURL(t, r, path+tt.expect)

			fmt.Fprint(w, `{
				"data": {
					"id": 190695,
					"text": "Цю стрічку перекладено",
					"pluralCategoryName": "few",
					"user": {
						"id": 19,
						"username": "john_doe",
						"fullName": "John Smith",
						"avatarUrl": ""
					},
					"rating": 10,
					"provider": "tm",
					"isPreTranslated": true,
					"createdAt": "2023-09-23T11:26:54+00:00"
				}
			}`)
		})

		translation, resp, err := client.StringTranslations.GetTranslation(context.Background(), projectID, 190695, tt.opts)
		require.NoError(t, err)

		expected := &model.Translation{
			ID:                 190695,
			Text:               "Цю стрічку перекладено",
			PluralCategoryName: "few",
			User: &model.ShortUser{
				ID:        19,
				Username:  "john_doe",
				FullName:  "John Smith",
				AvatarURL: "",
			},
			Rating:          10,
			Provider:        ToPtr("tm"),
			IsPreTranslated: true,
			CreatedAt:       "2023-09-23T11:26:54+00:00",
		}
		assert.Equal(t, expected, translation)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
	}
}

func TestStringTranslationsService_AddTranslation(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/translations"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"stringId":35434,"languageId":"uk","text":"Цю стрічку перекладено","addToTm":false}`+"\n")

		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, `{
			"data": {
				"id": 190695,
				"text": "Цю стрічку перекладено",
				"pluralCategoryName": "few",
				"user": {
					"id": 19,
					"username": "john_doe",
					"fullName": "John Smith",
					"avatarUrl": ""
				},
				"rating": 10,
				"provider": "tm",
				"isPreTranslated": true,
				"createdAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	req := &model.TranslationAddRequest{
		StringID:   35434,
		LanguageID: "uk",
		Text:       "Цю стрічку перекладено",
		AddToTM:    ToPtr(false),
	}
	translation, resp, err := client.StringTranslations.AddTranslation(context.Background(), 1, req)
	require.NoError(t, err)

	expected := &model.Translation{
		ID:                 190695,
		Text:               "Цю стрічку перекладено",
		PluralCategoryName: "few",
		User: &model.ShortUser{
			ID:        19,
			Username:  "john_doe",
			FullName:  "John Smith",
			AvatarURL: "",
		},
		Rating:          10,
		Provider:        ToPtr("tm"),
		IsPreTranslated: true,
		CreatedAt:       "2023-09-23T11:26:54+00:00",
	}
	assert.Equal(t, expected, translation)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
}

func TestStringTranslationsService_DeleteStringTranslationsWithLanguageId(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/projects/1/translations"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path+"?stringId=123&languageId=de")

		w.WriteHeader(http.StatusNoContent)
	})

	languageID := "de"
	resp, err := client.StringTranslations.DeleteStringTranslations(context.Background(), 1, 123, &languageID)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestStringTranslationsService_DeleteStringTranslationsWithoutLanguageId(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/projects/1/translations"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path+"?stringId=123")

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.StringTranslations.DeleteStringTranslations(context.Background(), 1, 123, nil)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestStringTranslationsService_RestoreTranslation(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/translations/190695"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPut)
		testURL(t, r, path)

		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{
			"data": {
				"id": 190695,
				"text": "Цю стрічку перекладено",
				"pluralCategoryName": "few",
				"user": {
					"id": 19,
					"username": "john_doe",
					"fullName": "John Smith",
					"avatarUrl": ""
				},
				"rating": 10,
				"provider": "tm",
				"isPreTranslated": true,
				"createdAt": "2023-09-23T11:26:54+00:00"
			}
		}`)
	})

	translation, resp, err := client.StringTranslations.RestoreTranslation(context.Background(), 1, 190695)
	require.NoError(t, err)

	expected := &model.Translation{
		ID:                 190695,
		Text:               "Цю стрічку перекладено",
		PluralCategoryName: "few",
		User: &model.ShortUser{
			ID:        19,
			Username:  "john_doe",
			FullName:  "John Smith",
			AvatarURL: "",
		},
		Rating:          10,
		Provider:        ToPtr("tm"),
		IsPreTranslated: true,
		CreatedAt:       "2023-09-23T11:26:54+00:00",
	}
	assert.Equal(t, expected, translation)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestStringTranslationsService_DeleteTranslation(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/translations/190695"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.StringTranslations.DeleteTranslation(context.Background(), 1, 190695)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestStringTranslationsService_GetVote(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/projects/1/votes/6643"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 6643,
				"user": {
					"id": 19,
					"username": "john_doe",
					"fullName": "John Smith",
					"avatarUrl": ""
				},
				"translationId": 19069345,
				"votedAt": "2023-09-19T12:42:12+00:00",
				"mark": "up"
			}
		}`)
	})

	vote, resp, err := client.StringTranslations.GetVote(context.Background(), 1, 6643)
	require.NoError(t, err)

	expected := &model.Vote{
		ID:            6643,
		User:          &model.ShortUser{ID: 19, Username: "john_doe", FullName: "John Smith", AvatarURL: ""},
		TranslationID: 19069345,
		VotedAt:       "2023-09-19T12:42:12+00:00",
		Mark:          "up",
	}
	assert.Equal(t, expected, vote)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestStringTranslationsService_ListVotes(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	cases := []struct {
		name   string
		opts   *model.VotesListOptions
		expect string
	}{
		{
			name:   "nil options",
			opts:   nil,
			expect: "",
		},
		{
			name:   "empty options",
			opts:   &model.VotesListOptions{},
			expect: "",
		},
		{
			name: "with options",
			opts: &model.VotesListOptions{
				StringID:        123,
				LanguageID:      "uk",
				TranslationID:   190695,
				FileID:          1,
				LabelIDs:        []int{1, 2},
				ExcludeLabelIDs: []int{3, 4},
				ListOptions:     model.ListOptions{Offset: 1, Limit: 3},
			},
			expect: "?excludeLabelIds=3%2C4&fileId=1&labelIds=1%2C2&languageId=uk&limit=3&offset=1&stringId=123&translationId=190695",
		},
	}

	for projectID, tt := range cases {
		path := fmt.Sprintf("/api/v2/projects/%d/votes", projectID)
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, http.MethodGet)
			testURL(t, r, path+tt.expect)

			fmt.Fprint(w, `{
				"data": [
					{
						"data": {
							"id": 123
						}
					},
					{
						"data": {
							"id": 456
						}
					},
					{
						"data": {
							"id": 789
						}
					}
				],
				"pagination": {
					"offset": 1,
					"limit": 3
				}
			}`)
		})

		list, resp, err := client.StringTranslations.ListVotes(context.Background(), projectID, tt.opts)
		require.NoError(t, err)

		expected := []*model.Vote{
			{
				ID: 123,
			},
			{
				ID: 456,
			},
			{
				ID: 789,
			},
		}
		assert.Len(t, list, 3)
		assert.Equal(t, expected, list)

		assert.Equal(t, model.Pagination{Offset: 1, Limit: 3}, resp.Pagination)
	}
}

func TestStringTranslationsService_ListVotes_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/1/votes", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.StringTranslations.ListVotes(context.Background(), 1, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestStringTranslationsService_AddVote(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/votes"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"mark":"up","translationId":19069345}`+"\n")

		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, `{
			"data": {
				"id": 6643,
				"user": {
					"id": 19,
					"username": "john_doe",
					"fullName": "John Smith",
					"avatarUrl": ""
				},
				"translationId": 19069345,
				"votedAt": "2023-09-19T12:42:12+00:00",
				"mark": "up"
			}
		}`)
	})

	req := &model.VoteAddRequest{
		Mark:          model.VoteType("up"),
		TranslationID: 19069345,
	}
	vote, resp, err := client.StringTranslations.AddVote(context.Background(), 1, req)
	require.NoError(t, err)

	expected := &model.Vote{
		ID:            6643,
		User:          &model.ShortUser{ID: 19, Username: "john_doe", FullName: "John Smith", AvatarURL: ""},
		TranslationID: 19069345,
		VotedAt:       "2023-09-19T12:42:12+00:00",
		Mark:          "up",
	}
	assert.Equal(t, expected, vote)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
}

func TestStringTranslationsService_CancelVote(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/votes/6643"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.StringTranslations.CancelVote(context.Background(), 1, 6643)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}
