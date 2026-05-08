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

func TestApplicationsService_GetInstallation(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/applications/installations/example-application"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"identifier": "example-application",
				"name": "Application name",
				"description": "Application description",
				"logo": "/resources/images/logo.png",
				"baseUrl": "https://localhost.dev",
				"manifestUrl": "https://localhost.dev",
				"createdAt": "2023-09-20T11:34:40+00:00",
				"modules": [
					{
						"key": "example-application",
						"type": "module-type",
						"data": {},
						"permissions": {
							"user": {
								"value": "restricted",
								"ids": [1]
							}
						},
						"authenticationType": "none"
					}
				],
				"scopes": [
					"project"
				],
				"permissions": {
					"user": {
						"value": "restricted",
						"ids": [1]
					},
					"project": {
						"value": "restricted",
						"ids": [1]
					}
				},
				"defaultPermissions": {
					"user": "owner",
					"project": "own"
				},
				"limitReached": true
			}
		}`)
	})

	installation, resp, err := client.Applications.GetInstallation(context.Background(), "example-application")
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Installation{
		Identifier:  "example-application",
		Name:        "Application name",
		Description: "Application description",
		Logo:        "/resources/images/logo.png",
		BaseURL:     "https://localhost.dev",
		ManifestURL: "https://localhost.dev",
		CreatedAt:   "2023-09-20T11:34:40+00:00",
		Modules: []*model.Module{
			{
				Key:  "example-application",
				Type: "module-type",
				Data: map[string]any{},
				Permissions: model.UserPermission{
					User: model.Permission{
						Value: "restricted",
						IDs:   []int{1},
					},
				},
				AuthenticationType: "none",
			},
		},
		Scopes: []string{"project"},
		Permissions: model.ProjectPermission{
			Project: model.Permission{
				Value: "restricted",
				IDs:   []int{1},
			},
		},
		DefaultPermissions: struct {
			User    model.PermissionValue `json:"user"`
			Project model.PermissionValue `json:"project"`
		}{
			User:    model.PermissionOwner,
			Project: model.PermissionOwn,
		},
		LimitReached: true,
	}
	assert.Equal(t, expected, installation)
}

func TestApplicationsService_ListInstallation(t *testing.T) {
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

	for _, tt := range tests {
		client, mux, teardown := setupClient()
		defer teardown()

		t.Run(tt.name, func(t *testing.T) {
			mux.HandleFunc("/api/v2/applications/installations", func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodGet)
				testURL(t, r, "/api/v2/applications/installations"+tt.expectedQuery)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"identifier": "example-application",
								"name": "Application name"
							}
						}
					],
					"pagination": {
						"offset": 2,
						"limit": 2
					}
				}`)
			})

			installations, resp, err := client.Applications.ListInstallations(context.Background(), tt.opts)
			require.NoError(t, err)

			expected := []*model.Installation{
				{
					Identifier: "example-application",
					Name:       "Application name",
				},
			}
			assert.Equal(t, expected, installations)

			assert.Equal(t, 2, resp.Pagination.Offset)
			assert.Equal(t, 2, resp.Pagination.Limit)
		})
	}
}

func TestApplicationsService_ListInstallation_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/applications/installations", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	installations, _, err := client.Applications.ListInstallations(context.Background(), nil)
	require.Error(t, err)
	assert.Nil(t, installations)
}

func TestApplicationsService_Install(t *testing.T) {
	tests := []struct {
		name string
		req  *model.InstallApplicationRequest
		body string
	}{
		{
			name: "required fields",
			req: &model.InstallApplicationRequest{
				URL: "https://localhost.dev",
			},
			body: `{"url":"https://localhost.dev"}` + "\n",
		},
		{
			name: "with own permissions",
			req: &model.InstallApplicationRequest{
				URL: "https://localhost.dev",
				Permissions: &model.ProjectPermission{
					Project: model.Permission{
						Value: "own",
					},
				},
			},
			body: `{"url":"https://localhost.dev","permissions":{"project":{"value":"own"}}}` + "\n",
		},
		{
			name: "with restricted permissions",
			req: &model.InstallApplicationRequest{
				URL: "https://localhost.dev",
				Permissions: &model.ProjectPermission{
					Project: model.Permission{
						Value: "restricted",
						IDs:   []int{1},
					},
				},
			},
			body: `{"url":"https://localhost.dev","permissions":{"project":{"value":"restricted","ids":[1]}}}` + "\n",
		},
		{
			name: "with modules",
			req: &model.InstallApplicationRequest{
				URL: "https://localhost.dev",
				Modules: []*model.InstallationModule{
					{
						Key: "example-module",
						Permissions: model.UserPermission{
							User: model.Permission{
								Value: "restricted",
								IDs:   []int{2},
							},
						},
					},
				},
			},
			body: `{"url":"https://localhost.dev","modules":[{"key":"example-module","permissions":{"user":{"value":"restricted","ids":[2]}}}]}` + "\n",
		},
	}

	for _, tt := range tests {
		client, mux, teardown := setupClient()
		defer teardown()

		t.Run(tt.name, func(t *testing.T) {
			const path = "/api/v2/applications/installations"
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodPost)
				testURL(t, r, path)
				testBody(t, r, tt.body)

				fmt.Fprint(w, `{
					"data": {
						"identifier": "example-application",
						"name": "Application name"
					}
				}`)
			})

			installation, resp, err := client.Applications.Install(context.Background(), tt.req)
			require.NoError(t, err)
			assert.NotNil(t, resp)

			expected := &model.Installation{
				Identifier: "example-application",
				Name:       "Application name",
			}
			assert.Equal(t, expected, installation)
		})
	}
}

func TestApplicationsService_EditInstallation(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/applications/installations/example-application"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/permissions","value":{"user":{"value":"managers"},"project":{"value":"restricted","ids":[2]}}}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"identifier": "example-application",
				"name": "Application name",
				"description": "Application description",
				"logo": "/resources/images/logo.png",
				"baseUrl": "https://localhost.dev",
				"manifestUrl": "https://localhost.dev",
				"createdAt": "2023-09-20T11:34:40+00:00",
				"modules": [
					{
						"key": "example-application",
						"type": "module-type",
						"data": {},
						"permissions": {
							"user": {
								"value": "restricted",
								"ids": [1]
							}
						},
						"authenticationType": "none"
					}
				],
				"scopes": [
					"project"
				],
				"permissions": {
					"user": {
						"value": "restricted",
						"ids": [1]
					},
					"project": {
						"value": "restricted",
						"ids": [1]
					}
				},
				"defaultPermissions": {
					"user": "owner",
					"project": "own"
				},
				"limitReached": true
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:   "replace",
			Path: "/permissions",
			Value: model.InstallationReplaceValue{
				Project: model.Permission{
					Value: model.PermissionRestricted,
					IDs:   []int{2},
				},
				User: model.Permission{
					Value: model.PermissionManagers,
				},
			},
		},
	}
	installation, resp, err := client.Applications.EditInstallation(context.Background(), "example-application", req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.Installation{
		Identifier:  "example-application",
		Name:        "Application name",
		Description: "Application description",
		Logo:        "/resources/images/logo.png",
		BaseURL:     "https://localhost.dev",
		ManifestURL: "https://localhost.dev",
		CreatedAt:   "2023-09-20T11:34:40+00:00",
		Modules: []*model.Module{
			{
				Key:  "example-application",
				Type: "module-type",
				Data: map[string]any{},
				Permissions: model.UserPermission{
					User: model.Permission{
						Value: "restricted",
						IDs:   []int{1},
					},
				},
				AuthenticationType: "none",
			},
		},
		Scopes: []string{"project"},
		Permissions: model.ProjectPermission{
			Project: model.Permission{
				Value: "restricted",
				IDs:   []int{1},
			},
		},
		DefaultPermissions: struct {
			User    model.PermissionValue `json:"user"`
			Project model.PermissionValue `json:"project"`
		}{
			User:    model.PermissionOwner,
			Project: model.PermissionOwn,
		},
		LimitReached: true,
	}
	assert.Equal(t, expected, installation)
}

func TestApplicationsService_DeleteInstallation(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	t.Run("force delete", func(t *testing.T) {
		path := "/api/v2/applications/installations/example-application-1"
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, http.MethodDelete)
			testURL(t, r, path+"?force=true")

			w.WriteHeader(http.StatusNoContent)
		})

		resp, err := client.Applications.DeleteInstallation(context.Background(), "example-application-1", true)
		require.NoError(t, err)
		assert.NotNil(t, resp)
	})

	t.Run("delete", func(t *testing.T) {
		path := "/api/v2/applications/installations/example-application-2"
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, http.MethodDelete)
			testURL(t, r, path)

			w.WriteHeader(http.StatusNoContent)
		})

		resp, err := client.Applications.DeleteInstallation(context.Background(), "example-application-2", false)
		require.NoError(t, err)
		assert.NotNil(t, resp)
	})
}

func TestApplicationsService_GetData(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		applicationID = "example-application"
		path          = "example-path"
	)

	endpoint := fmt.Sprintf("/api/v2/applications/%s/api/%s", applicationID, path)
	mux.HandleFunc(endpoint, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, endpoint)

		fmt.Fprint(w, `{
			"data": {
				"key1": "value1",
				"key2": "value2",
				"key3": {
					"foo": "bar"
				}
			}
		}`)
	})

	data, resp, err := client.Applications.GetData(context.Background(), applicationID, path)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := map[string]any{
		"key1": "value1",
		"key2": "value2",
		"key3": map[string]any{
			"foo": "bar",
		},
	}
	assert.Equal(t, expected, data)
}

func TestApplicationsService_AddData(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		applicationID = "example-application"
		path          = "example-path"

		req = map[string]any{
			"key1": "value1",
			"key2": "value2",
			"key3": map[string]any{
				"foo": "bar",
			},
		}
	)

	endpoint := fmt.Sprintf("/api/v2/applications/%s/api/%s", applicationID, path)
	mux.HandleFunc(endpoint, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, endpoint)
		testBody(t, r, `{"key1":"value1","key2":"value2","key3":{"foo":"bar"}}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"key1": "value1",
				"key2": "value2",
				"key3": {
					"foo": "bar"
				}
			}
		}`)
	})

	data, resp, err := client.Applications.AddData(context.Background(), applicationID, path, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := map[string]any{
		"key1": "value1",
		"key2": "value2",
		"key3": map[string]any{
			"foo": "bar",
		},
	}
	assert.Equal(t, expected, data)
}

func TestApplicationsService_UpdateOrRestoreData(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		applicationID = "example-application"
		path          = "example-path"

		req = map[string]any{
			"key1": "value1",
			"key3": map[string]any{
				"foo": "bar",
			},
		}
	)

	endpoint := fmt.Sprintf("/api/v2/applications/%s/api/%s", applicationID, path)
	mux.HandleFunc(endpoint, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPut)
		testURL(t, r, endpoint)
		testBody(t, r, `{"key1":"value1","key3":{"foo":"bar"}}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"key1": "value1",
				"key3": {
					"foo": "bar"
				}
			}
		}`)
	})

	data, resp, err := client.Applications.UpdateOrRestoreData(context.Background(), applicationID, path, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := map[string]any{
		"key1": "value1",
		"key3": map[string]any{
			"foo": "bar",
		},
	}
	assert.Equal(t, expected, data)
}

func TestApplicationsService_EditData(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		applicationID = "example-application"
		path          = "example-path"

		req = map[string]any{
			"key1": "value1",
			"key2": "value2",
		}
	)

	endpoint := fmt.Sprintf("/api/v2/applications/%s/api/%s", applicationID, path)
	mux.HandleFunc(endpoint, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, endpoint)
		testBody(t, r, `{"key1":"value1","key2":"value2"}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"key1": "value1",
				"key2": "value2"
			}
		}`)
	})

	data, resp, err := client.Applications.EditData(context.Background(), applicationID, path, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := map[string]any{
		"key1": "value1",
		"key2": "value2",
	}
	assert.Equal(t, expected, data)
}

func TestApplicationsService_DeleteData(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var (
		applicationID = "example-application"
		path          = "example-path"
	)

	endpoint := fmt.Sprintf("/api/v2/applications/%s/api/%s", applicationID, path)
	mux.HandleFunc(endpoint, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, endpoint)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Applications.DeleteData(context.Background(), applicationID, path)
	require.NoError(t, err)
	assert.NotNil(t, resp)
}
