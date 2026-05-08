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

func TestSecurityLogsService_ListUserLogs(t *testing.T) {
	tests := []struct {
		name          string
		opts          *model.SecurityLogsListOptions
		expectedQuery string
	}{
		{
			name:          "nil options",
			opts:          nil,
			expectedQuery: "",
		},
		{
			name:          "empty options",
			opts:          &model.SecurityLogsListOptions{},
			expectedQuery: "",
		},
		{
			name: "with options",
			opts: &model.SecurityLogsListOptions{
				Event:         "login",
				CreatedAfter:  "2024-05-10T10:41:33+00:00",
				CreatedBefore: "2024-05-26T10:33:43+00:00",
				IPAddress:     "127.0.0.1",
				UserID:        1,
				ListOptions: model.ListOptions{
					Limit:  1,
					Offset: 2,
				},
			},
			expectedQuery: "?createdAfter=2024-05-10T10%3A41%3A33%2B00%3A00&createdBefore=2024-05-26T10%3A33%3A43%2B00%3A00&event=login&ipAddress=127.0.0.1&limit=1&offset=2&userId=1",
		},
	}

	client, mux, teardown := setupClient()
	defer teardown()

	for userID, tt := range tests {
		userID++
		path := fmt.Sprintf("/api/v2/users/%d/security-logs", userID)
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			testMethod(t, r, http.MethodGet)
			testURL(t, r, path+tt.expectedQuery)

			fmt.Fprint(w, `{
				"data": [
					{
						"data": {
							"id": 2,
							"event": "login",
							"info": "Some info",
							"userId": 4,
							"location": "USA",
							"ipAddress": "127.0.0.1",
							"deviceName": "MacOs on MacBook",
							"createdAt": "2023-09-19T15:10:43+00:00"
						}
					},
					{
						"data": {
							"id": 4,
							"event": "email.change",
							"info": "Some info",
							"userId": 4,
							"location": "USA",
							"ipAddress": "127.0.0.1",
							"deviceName": "MacOs on MacBook",
							"createdAt": "2023-09-19T15:10:43+00:00"
						}
					}
				],
				"pagination": {
					"offset": 1,
					"limit": 2
				}
			}`)
		})

		logs, resp, err := client.SecurityLogs.ListUserLogs(context.Background(), userID, tt.opts)
		require.NoError(t, err)
		assert.NotNil(t, resp)

		expected := []*model.SecurityLog{
			{
				ID:         2,
				Event:      "login",
				Info:       "Some info",
				UserID:     4,
				Location:   "USA",
				IPAddress:  "127.0.0.1",
				DeviceName: "MacOs on MacBook",
				CreatedAt:  "2023-09-19T15:10:43+00:00",
			},
			{
				ID:         4,
				Event:      "email.change",
				Info:       "Some info",
				UserID:     4,
				Location:   "USA",
				IPAddress:  "127.0.0.1",
				DeviceName: "MacOs on MacBook",
				CreatedAt:  "2023-09-19T15:10:43+00:00",
			},
		}
		assert.Equal(t, expected, logs)
	}
}

func TestSecurityLogsService_ListUserLogs_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/users/1/security-logs", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.SecurityLogs.ListUserLogs(context.Background(), 2, nil)
	require.Error(t, err)
	assert.Nil(t, res)
}
func TestSecurityLogsService_ListOrganizationLogs(t *testing.T) {
	tests := []struct {
		name          string
		opts          *model.SecurityLogsListOptions
		expectedQuery string
	}{
		{
			name:          "nil options",
			opts:          nil,
			expectedQuery: "",
		},
		{
			name:          "empty options",
			opts:          &model.SecurityLogsListOptions{},
			expectedQuery: "",
		},
		{
			name: "with options",
			opts: &model.SecurityLogsListOptions{
				Event:         "login",
				CreatedAfter:  "2024-05-10T10:41:33+00:00",
				CreatedBefore: "2024-05-26T10:33:43+00:00",
				IPAddress:     "127.0.0.1",
				ListOptions: model.ListOptions{
					Limit:  1,
					Offset: 2,
				},
			},
			expectedQuery: "?createdAfter=2024-05-10T10%3A41%3A33%2B00%3A00&createdBefore=2024-05-26T10%3A33%3A43%2B00%3A00&event=login&ipAddress=127.0.0.1&limit=1&offset=2",
		},
	}

	for _, tt := range tests {
		client, mux, teardown := setupClient()
		defer teardown()

		t.Run(tt.name, func(t *testing.T) {
			const path = "/api/v2/security-logs"
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodGet)
				testURL(t, r, path+tt.expectedQuery)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 2,
								"event": "login",
								"info": "Some info",
								"userId": 4,
								"location": "USA",
								"ipAddress": "127.0.0.1",
								"deviceName": "MacOs on MacBook",
								"createdAt": "2023-09-19T15:10:43+00:00"
							}
						},
						{
							"data": {
								"id": 4,
								"event": "email.change",
								"info": "Some info",
								"userId": 4,
								"location": "USA",
								"ipAddress": "127.0.0.1",
								"deviceName": "MacOs on MacBook",
								"createdAt": "2023-09-19T15:10:43+00:00"
							}
						}
					],
					"pagination": {
						"offset": 1,
						"limit": 2
					}
				}`)
			})

			logs, resp, err := client.SecurityLogs.ListOrganizationLogs(context.Background(), tt.opts)
			require.NoError(t, err)
			assert.NotNil(t, resp)

			expected := []*model.SecurityLog{
				{
					ID:         2,
					Event:      "login",
					Info:       "Some info",
					UserID:     4,
					Location:   "USA",
					IPAddress:  "127.0.0.1",
					DeviceName: "MacOs on MacBook",
					CreatedAt:  "2023-09-19T15:10:43+00:00",
				},
				{
					ID:         4,
					Event:      "email.change",
					Info:       "Some info",
					UserID:     4,
					Location:   "USA",
					IPAddress:  "127.0.0.1",
					DeviceName: "MacOs on MacBook",
					CreatedAt:  "2023-09-19T15:10:43+00:00",
				},
			}
			assert.Equal(t, expected, logs)
		})
	}
}

func TestSecurityLogsService_GetUserLog(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/users/1/security-logs/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"event": "login",
				"info": "Some info",
				"userId": 4,
				"location": "USA",
				"ipAddress": "127.0.0.1",
				"deviceName": "MacOs on MacBook",
				"createdAt": "2023-09-19T15:10:43+00:00"
			}
		}`)
	})

	log, resp, err := client.SecurityLogs.GetUserLog(context.Background(), 1, 2)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.SecurityLog{
		ID:         2,
		Event:      "login",
		Info:       "Some info",
		UserID:     4,
		Location:   "USA",
		IPAddress:  "127.0.0.1",
		DeviceName: "MacOs on MacBook",
		CreatedAt:  "2023-09-19T15:10:43+00:00",
	}
	assert.Equal(t, expected, log)
}

func TestSecurityLogsService_GetOrganizationLog(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/security-logs/2"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"event": "login",
				"info": "Some info",
				"userId": 4,
				"location": "USA",
				"ipAddress": "127.0.0.1",
				"deviceName": "MacOs on MacBook",
				"createdAt": "2023-09-19T15:10:43+00:00"
			}
		}`)
	})

	log, resp, err := client.SecurityLogs.GetOrganizationLog(context.Background(), 2)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.SecurityLog{
		ID:         2,
		Event:      "login",
		Info:       "Some info",
		UserID:     4,
		Location:   "USA",
		IPAddress:  "127.0.0.1",
		DeviceName: "MacOs on MacBook",
		CreatedAt:  "2023-09-19T15:10:43+00:00",
	}
	assert.Equal(t, expected, log)
}
