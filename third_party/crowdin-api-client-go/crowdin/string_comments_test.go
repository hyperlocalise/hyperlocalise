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

func TestStringCommentsService_Get(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/comments/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, path)

		fmt.Fprint(w, getJSONResponse())
	})

	comment, resp, err := client.StringComments.Get(context.Background(), 1, 2)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := getStringComment()
	assert.Equal(t, expected, comment)
}

func TestStringCommentsService_Get_NotFound(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/comments/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		http.Error(w, `{"error": {"code": 404, "message": "String Comment Not Found"}}`, http.StatusNotFound)
	})

	comment, resp, err := client.StringComments.Get(context.Background(), 1, 2)
	require.Error(t, err)

	var errResponse *model.ErrorResponse
	assert.ErrorAs(t, err, &errResponse)
	assert.Equal(t, "404 String Comment Not Found", errResponse.Error())

	assert.Nil(t, comment)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestStringCommentsService_List(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	tests := []struct {
		name   string
		opts   *model.StringCommentsListOptions
		expect string
	}{
		{
			name:   "nil options",
			opts:   nil,
			expect: "",
		},
		{
			name:   "empty options",
			opts:   &model.StringCommentsListOptions{},
			expect: "",
		},
		{
			name: "with options 1",
			opts: &model.StringCommentsListOptions{
				OrderBy:  "createdAt desc,text",
				StringID: 1,
				Type:     "comment",
				ListOptions: model.ListOptions{
					Limit:  10,
					Offset: 10,
				},
			},
			expect: "?limit=10&offset=10&orderBy=createdAt+desc%2Ctext&stringId=1&type=comment",
		},
		{
			name: "with options 2",
			opts: &model.StringCommentsListOptions{
				IssueType:   []string{"general_question", "translation_mistake"},
				IssueStatus: "resolved",
				ListOptions: model.ListOptions{
					Limit: 10,
				},
			},
			expect: "?issueStatus=resolved&issueType=general_question%2Ctranslation_mistake&limit=10",
		},
	}

	for projectID, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/projects/%d/comments", projectID)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, "GET")
				testURL(t, r, path+tt.expect)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 2,
								"text": "Please provide more details on where the text will be used 2"
							}
						},
						{
							"data": {
								"id": 4,
								"text": "Please provide more details on where the text will be used 4"
							}
						},
						{
							"data": {
								"id": 6,
								"text": "Please provide more details on where the text will be used 6"
							}
						}
					],
					"pagination": {
						"offset": 0,
						"limit": 25
					}
				}`)
			})

			comments, resp, err := client.StringComments.List(context.Background(), projectID, tt.opts)
			require.NoError(t, err)

			expected := []*model.StringComment{
				{
					ID:   2,
					Text: "Please provide more details on where the text will be used 2",
				},
				{
					ID:   4,
					Text: "Please provide more details on where the text will be used 4",
				},
				{
					ID:   6,
					Text: "Please provide more details on where the text will be used 6",
				},
			}
			assert.Equal(t, expected, comments)
			assert.Len(t, comments, 3)

			expectedPagination := model.Pagination{
				Limit:  25,
				Offset: 0,
			}
			assert.Equal(t, expectedPagination, resp.Pagination)
		})
	}
}

func TestStringCommentsService_List_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/2/comments", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.StringComments.List(context.Background(), 2, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestStringCommentsService_BatchOperations(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/comments"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "PATCH")
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/2/text","value":"new text"}]`+"\n")

		fmt.Fprint(w, `{
			"data": [
				`+getJSONResponse()+`
			]
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/2/text",
			Value: "new text",
		},
	}

	comment, resp, err := client.StringComments.BatchOperations(context.Background(), 1, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := []*model.StringComment{
		getStringComment(),
	}
	assert.Equal(t, expected, comment)
}

func TestStringCommentsService_Add(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/comments"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "POST")
		testURL(t, r, path)
		testBody(t, r, `{"text":"test text","stringId":1,"targetLanguageId":"en","type":"issue","issueType":"template_mistake","isShared":false}`+"\n")

		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, getJSONResponse())
	})

	req := &model.StringCommentsAddRequest{
		Text:             "test text",
		StringID:         1,
		TargetLanguageID: "en",
		Type:             "issue",
		IssueType:        "template_mistake",
		IsShared:         ToPtr(false),
	}
	comment, resp, err := client.StringComments.Add(context.Background(), 1, req)
	require.NoError(t, err)

	expected := getStringComment()
	assert.Equal(t, expected, comment)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
}

func TestStringCommentsService_Add_RequiredFields(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	req := &model.StringCommentsAddRequest{
		Text:             "test text",
		StringID:         1,
		TargetLanguageID: "en",
		Type:             "issue",
	}

	mux.HandleFunc("/api/v2/projects/1/comments", func(w http.ResponseWriter, r *http.Request) {
		testBody(t, r, `{"text":"test text","stringId":1,"targetLanguageId":"en","type":"issue"}`+"\n")

		fmt.Fprint(w, getJSONResponse())
	})

	_, _, err := client.StringComments.Add(context.Background(), 1, req)
	require.NoError(t, err)
}

func TestStringCommentsService_Edit(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/comments/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "PATCH")
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/text","value":"new text"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"text": "new text"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/text",
			Value: "new text",
		},
	}
	comment, resp, err := client.StringComments.Edit(context.Background(), 1, 2, req)
	require.NoError(t, err)

	expected := &model.StringComment{
		ID:   2,
		Text: "new text",
	}
	assert.Equal(t, expected, comment)
	assert.NotNil(t, resp)
}

func TestStringCommentsService_Delete(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/projects/1/comments/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "DELETE")
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.StringComments.Delete(context.Background(), 1, 2)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func getJSONResponse() string {
	return `{
		"data": {
			"id": 2,
			"isShared": false,
			"text": "@BeMyEyes  Please provide more details on where the text will be used",
			"userId": 6,
			"stringId": 742,
			"user": {
				"id": 12,
				"username": "john_smith",
				"fullName": "John Smith",
				"avatarUrl": ""
			},
			"string": {
				"id": 742,
				"text": "HTML page example",
				"type": "text",
				"hasPlurals": false,
				"isIcu": false,
				"context": "Document Title\\r\\nXPath: /html/head/title",
				"fileId": 22
			},
			"projectId": 1,
			"languageId": "bg",
			"type": "issue",
			"issueType": "source_mistake",
			"issueStatus": "unresolved",
			"resolverId": 12,
			"senderOrganization": {
				"id": 200000101,
				"domain": "umbrella"
			},
			"resolverOrganization": {
				"id": 200000112,
				"domain": "acme"
			},
			"resolver": {
				"id": 12,
				"username": "john_smith",
				"fullName": "John Smith",
				"avatarUrl": ""
			},
			"resolvedAt": "2023-09-20T11:05:24+00:00",
			"createdAt": "2023-09-20T11:05:24+00:00"
		}
	}`
}

func getStringComment() *model.StringComment {
	return &model.StringComment{
		ID:       2,
		Text:     "@BeMyEyes  Please provide more details on where the text will be used",
		UserID:   6,
		StringID: 742,
		User: &model.ShortUser{
			ID:        12,
			Username:  "john_smith",
			FullName:  "John Smith",
			AvatarURL: "",
		},
		String: &model.String{
			ID:      742,
			Text:    "HTML page example",
			Type:    "text",
			Context: "Document Title\\r\\nXPath: /html/head/title",
			FileID:  22,
		},
		ProjectID:   1,
		LanguageID:  "bg",
		Type:        "issue",
		IssueType:   "source_mistake",
		IssueStatus: "unresolved",
		ResolverID:  12,
		Resolver: &model.ShortUser{
			ID:        12,
			Username:  "john_smith",
			FullName:  "John Smith",
			AvatarURL: "",
		},
		ResolvedAt: "2023-09-20T11:05:24+00:00",
		CreatedAt:  "2023-09-20T11:05:24+00:00",
		IsShared:   ToPtr(false),
		SenderOrganization: &model.Organization{
			ID:     200000101,
			Domain: "umbrella",
		},
		ResolverOrganization: &model.Organization{
			ID:     200000112,
			Domain: "acme",
		},
	}
}
