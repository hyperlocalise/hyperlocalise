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

func TestOrganizationWebhooksService_Get(t *testing.T) {
	client, mux, teardowm := setupClient()
	defer teardowm()

	const path = "/api/v2/webhooks/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 4,
				"name": "Proofread",
				"url": "https://webhook.site/1c20d9b5-6e6a-4522-974d-9da7ea7595c9",
				"events": [
					"file.approved"
				],
				"headers": {
					"Authorization": "Bearer ef231f493cafe336f98d486f596282205b3c2a0"
				},
				"payload": {
					"string.added": {
						"event": "{{event}}",
						"string": {
							"id": "{{stringId}}",
							"identifier": "{{stringIdentifier}}",
							"key": "{{stringKey}}",
							"text": "{{stringText}}",
							"type": "{{stringType}}",
							"context": "{{stringContext}}",
							"maxLength": "{{stringMaxLength}}",
							"isHidden": "{{stringIsHidden}}",
							"isDuplicate": "{{stringIsDuplicate}}",
							"masterStringId": "{{stringMasterStringId}}",
							"revision": "{{stringRevision}}",
							"hasPlurals": "{{stringHasPlurals}}",
							"labelIds": "{{stringLabelIds}}",
							"url": "{{stringUrl}}",
							"createdAt": "{{stringCreatedAt}}",
							"updatedAt": "{{stringUpdatedAt}}",
							"file": {
								"id": "{{fileId}}",
								"name": "{{fileName}}",
								"title": "{{fileTitle}}",
								"type": "{{fileType}}",
								"path": "{{filePath}}",
								"status": "{{fileStatus}}",
								"revision": "{{fileRevision}}",
								"branchId": "{{branchId}}",
								"directoryId": "{{directoryId}}"
							},
							"project": {
								"id": "{{projectId}}",
								"userId": "{{projectUserId}}",
								"sourceLanguageId": "{{projectSourceLanguageId}}",
								"targetLanguageIds": "{{projectTargetLanguageIds}}",
								"identifier": "{{projectIdentifier}}",
								"name": "{{projectName}}",
								"createdAt": "{{projectCreatedAt}}",
								"updatedAt": "{{projectUpdatedAt}}",
								"lastActivity": "{{projectLastActivity}}",
								"description": "{{projectDescription}}",
								"url": "{{projectUrl}}",
								"cname": "{{projectCname}}",
								"logo": "{{projectLogo}}",
								"isExternal": "{{projectIsExternal}}",
								"externalType": "{{projectExternalType}}",
								"hasCrowdsourcing": "{{projectHasCrowdsourcing}}"
							}
						},
						"user": {
							"id": "{{userId}}",
							"username": "{{userUsername}}",
							"fullName": "{{userFullName}}",
							"avatarUrl": "{{userAvatarUrl}}"
						}
					}
				},
				"isActive": true,
				"batchingEnabled": true,
				"requestType": "GET",
				"contentType": "application/json",
				"createdAt": "2023-09-23T09:19:07+00:00",
				"updatedAt": "2023-09-23T09:19:07+00:00"
			}
		}`)
	})

	webhook, resp, err := client.OrganizationWebhooks.Get(context.Background(), 1)
	require.NoError(t, err)
	assert.NotNil(t, resp)
	assert.Equal(t, 0, webhook.ProjectID)

	expected := &model.Webhook{
		ID:        4,
		ProjectID: 0,
		Name:      "Proofread",
		URL:       "https://webhook.site/1c20d9b5-6e6a-4522-974d-9da7ea7595c9",
		Events:    []string{"file.approved"},
		Headers: map[string]string{
			"Authorization": "Bearer ef231f493cafe336f98d486f596282205b3c2a0",
		},
		Payload: map[string]any{
			"string.added": map[string]any{
				"event": "{{event}}",
				"string": map[string]any{
					"id":             "{{stringId}}",
					"identifier":     "{{stringIdentifier}}",
					"key":            "{{stringKey}}",
					"text":           "{{stringText}}",
					"type":           "{{stringType}}",
					"context":        "{{stringContext}}",
					"maxLength":      "{{stringMaxLength}}",
					"isHidden":       "{{stringIsHidden}}",
					"isDuplicate":    "{{stringIsDuplicate}}",
					"masterStringId": "{{stringMasterStringId}}",
					"revision":       "{{stringRevision}}",
					"hasPlurals":     "{{stringHasPlurals}}",
					"labelIds":       "{{stringLabelIds}}",
					"url":            "{{stringUrl}}",
					"createdAt":      "{{stringCreatedAt}}",
					"updatedAt":      "{{stringUpdatedAt}}",
					"file": map[string]any{
						"id":          "{{fileId}}",
						"name":        "{{fileName}}",
						"title":       "{{fileTitle}}",
						"type":        "{{fileType}}",
						"path":        "{{filePath}}",
						"status":      "{{fileStatus}}",
						"revision":    "{{fileRevision}}",
						"branchId":    "{{branchId}}",
						"directoryId": "{{directoryId}}",
					},
					"project": map[string]any{
						"id":                "{{projectId}}",
						"userId":            "{{projectUserId}}",
						"sourceLanguageId":  "{{projectSourceLanguageId}}",
						"targetLanguageIds": "{{projectTargetLanguageIds}}",
						"identifier":        "{{projectIdentifier}}",
						"name":              "{{projectName}}",
						"createdAt":         "{{projectCreatedAt}}",
						"updatedAt":         "{{projectUpdatedAt}}",
						"lastActivity":      "{{projectLastActivity}}",
						"description":       "{{projectDescription}}",
						"url":               "{{projectUrl}}",
						"cname":             "{{projectCname}}",
						"logo":              "{{projectLogo}}",
						"isExternal":        "{{projectIsExternal}}",
						"externalType":      "{{projectExternalType}}",
						"hasCrowdsourcing":  "{{projectHasCrowdsourcing}}",
					},
				},
				"user": map[string]any{
					"id":        "{{userId}}",
					"username":  "{{userUsername}}",
					"fullName":  "{{userFullName}}",
					"avatarUrl": "{{userAvatarUrl}}",
				},
			},
		},
		IsActive:        true,
		BatchingEnabled: true,
		RequestType:     "GET",
		ContentType:     "application/json",
		CreatedAt:       "2023-09-23T09:19:07+00:00",
		UpdatedAt:       "2023-09-23T09:19:07+00:00",
	}
	assert.Equal(t, expected, webhook)
}

func TestOrganizationWebhooksService_List(t *testing.T) {
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
			opts:          &model.ListOptions{Offset: 1, Limit: 10},
			expectedQuery: "?limit=10&offset=1",
		},
	}

	for _, tt := range tests {
		client, mux, teardowm := setupClient()
		defer teardowm()

		t.Run(tt.name, func(t *testing.T) {
			mux.HandleFunc("/api/v2/webhooks", func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, "GET")
				testURL(t, r, "/api/v2/webhooks"+tt.expectedQuery)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 4,
								"headers": {
									"Autorization": "Bearer ef231f493cafe336f98d486f596282205b3c2a0"
								}
							}
						},
						{
							"data": {
								"id": 6,
								"headers": []
							}
						}
					],
					"pagination": {
						"offset": 1,
						"limit": 2
					}
				}`)
			})

			webhooks, resp, err := client.OrganizationWebhooks.List(context.Background(), tt.opts)
			require.NoError(t, err)

			expected := []*model.Webhook{
				{
					ID: 4,
					Headers: map[string]string{
						"Autorization": "Bearer ef231f493cafe336f98d486f596282205b3c2a0",
					},
					ProjectID: 0,
				},
				{
					ID:        6,
					Headers:   map[string]string{},
					ProjectID: 0,
				}}
			assert.Equal(t, expected, webhooks)

			assert.Equal(t, 1, resp.Pagination.Offset)
			assert.Equal(t, 2, resp.Pagination.Limit)
		})
	}
}

func TestOrganizationWebhooksService_List_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/webhooks", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.OrganizationWebhooks.List(context.Background(), nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestOrganizationWebhooksService_Add(t *testing.T) {
	client, mux, teardowm := setupClient()
	defer teardowm()

	const path = "/api/v2/projects/1/webhooks"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "POST")
		testURL(t, r, path)
		testJSONBody(t, r, `{
			"name":"Proofread",
			"url":"https://webhook.site/1c20d9b5-6e6a-4522-974d-9da7ea7595c9",
			"events":[
				"file.approved"
			],
			"requestType":"POST",
			"isActive":true,
			"batchingEnabled":false,
			"contentType":"application/json",
			"headers":{
				"Authorization":"Bearer ef231f493cafe336f98d486f596282205b3c2a0"
			}
		}`)

		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, `{
			"data": {
				"id": 4
			}
		}`)
	})

	req := &model.WebhookAddRequest{
		Name:            "Proofread",
		URL:             "https://webhook.site/1c20d9b5-6e6a-4522-974d-9da7ea7595c9",
		Events:          []model.Event{model.FileApproved},
		RequestType:     "POST",
		IsActive:        ToPtr(true),
		BatchingEnabled: ToPtr(false),
		ContentType:     "application/json",
		Headers: map[string]string{
			"Authorization": "Bearer ef231f493cafe336f98d486f596282205b3c2a0",
		},
	}
	webhook, resp, err := client.OrganizationWebhooks.Add(context.Background(), 1, req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	assert.Equal(t, 4, webhook.ID)
}

func TestOrganizationWebhooksService_Add_requestValidation(t *testing.T) {
	tests := []struct {
		name string
		req  *model.WebhookAddRequest
		err  string
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name: "empty request",
			req:  &model.WebhookAddRequest{},
			err:  "name is required",
		},
		{
			name: "url is required",
			req: &model.WebhookAddRequest{
				Name: "Proofread",
			},
			err: "url is required",
		},
		{
			name: "events is required",
			req: &model.WebhookAddRequest{
				Name: "Proofread",
				URL:  "https://webhook.site/1c20d9b5-6e6a-4522-974d-9da7ea7595c9",
			},
			err: "events is required",
		},
		{
			name: "requestType is required",
			req: &model.WebhookAddRequest{
				Name:   "Proofread",
				URL:    "https://webhook.site/1c20d9b5-6e6a-4522-974d-9da7ea7595c9",
				Events: []model.Event{model.FileApproved},
			},
			err: "requestType is required",
		},
		{
			name: "requestType is invalid",
			req: &model.WebhookAddRequest{
				Name:        "Proofread",
				URL:         "https://webhook.site/1c20d9b5-6e6a-4522-974d-9da7ea7595c9",
				Events:      []model.Event{model.FileApproved},
				RequestType: "PUT",
			},
			err: "requestType must be GET or POST",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.EqualError(t, tt.req.Validate(), tt.err)
		})
	}
}

func TestOrganizationWebhooksService_Edit(t *testing.T) {
	tests := []struct {
		name string
		req  []*model.UpdateRequest
		body string
		err  string
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "body cannot be empty or nil",
		},
		{
			name: "empty request",
			req:  []*model.UpdateRequest{},
			err:  "body cannot be empty or nil",
		},
		{
			name: "invalid operation",
			req: []*model.UpdateRequest{
				{
					Op:    "invalid",
					Path:  "/name",
					Value: "Proofread",
				},
			},
			err: "invalid op: \"invalid\", must be one of add, replace, remove, test",
		},
		{
			name: "replace name",
			req: []*model.UpdateRequest{
				{
					Op:    "replace",
					Path:  "/name",
					Value: "Proofread",
				},
			},
			body: `[{"op":"replace","path":"/name","value":"Proofread"}]` + "\n",
		},
	}

	client, mux, teardowm := setupClient()
	defer teardowm()

	for whID, tt := range tests {
		path := fmt.Sprintf("/api/v2/webhooks/%d", whID)
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, "PATCH")
			testURL(t, r, path)
			testBody(t, r, tt.body)

			fmt.Fprint(w, `{
				"data": {
					"id": 4,
					"name": "Proofread"
				}
			}`)
		})

		webhook, resp, err := client.OrganizationWebhooks.Edit(context.Background(), whID, tt.req)
		if tt.err == "" {
			require.NoError(t, err)
			assert.NotNil(t, resp)
			assert.Equal(t, 4, webhook.ID)
			assert.Equal(t, "Proofread", webhook.Name)
		} else {
			assert.EqualError(t, err, tt.err)
		}
	}
}

func TestOrganizationWebhooksService_Delete(t *testing.T) {
	client, mux, teardowm := setupClient()
	defer teardowm()

	const path = "/api/v2/webhooks/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "DELETE")
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.OrganizationWebhooks.Delete(context.Background(), 1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}
