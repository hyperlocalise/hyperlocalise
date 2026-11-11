package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/tmsauth"
	"github.com/stretchr/testify/require"
)

func TestParseLiveJobID(t *testing.T) {
	t.Parallel()
	got, ok := parseLiveJobID("ext:crowdin:123:456")
	require.True(t, ok)
	require.Equal(t, "crowdin", got.providerKind)
	require.Equal(t, "123", got.externalProjectID)
	require.Equal(t, "456", got.externalJobID)
	require.Equal(t, "ext:crowdin:123:456", encodeLiveJobID("crowdin", "123", "456"))

	if _, ok := parseLiveJobID("ext:crowdin:123"); ok {
		t.Fatal("project ids are not job ids")
	}
	if _, ok := parseLiveJobID("job_1"); ok {
		t.Fatal("native ids are not live")
	}
}

func TestLiveJobsWithoutAConnection(t *testing.T) {
	api, scope := projectTestAPI(t)
	for _, path := range []string{
		"/tms/jobs",
		"/projects/ext:crowdin:7/jobs",
		"/projects/ext:crowdin:7/members",
		"/projects/ext:crowdin:7/open-job-count",
		"/jobs/ext:crowdin:7:10",
	} {
		rec := projectRequest(api, scope, scope.OrgPath(path))
		require.Equal(t, http.StatusServiceUnavailable, rec.Code, path+" "+rec.Body.String())
		require.Contains(t, rec.Body.String(), "tms_unavailable", path)
	}
}

func TestLiveCrowdinJobs(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/projects/7":
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{
				"id": 7, "name": "Marketing", "identifier": "app", "sourceLanguageId": "en",
				"targetLanguageIds": []string{"fr"}, "webUrl": "https://crowdin.com/project/app",
			}})
		case r.Method == http.MethodGet && r.URL.Path == "/projects":
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"data": map[string]any{
				"id": 7, "name": "Marketing", "identifier": "app", "sourceLanguageId": "en",
				"targetLanguageIds": []string{"fr"},
			}}}})
		case r.Method == http.MethodGet && r.URL.Path == "/projects/7/tasks":
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"data": liveCrowdinTask(10)}}})
		case r.Method == http.MethodPost && r.URL.Path == "/projects/7/tasks":
			raw, _ := io.ReadAll(r.Body)
			var body map[string]any
			_ = json.Unmarshal(raw, &body)
			require.Equal(t, "Homepage", body["title"])
			require.Equal(t, "fr", body["languageId"])
			_ = json.NewEncoder(w).Encode(map[string]any{"data": liveCrowdinTask(11)})
		case r.Method == http.MethodGet && r.URL.Path == "/projects/7/tasks/10":
			_ = json.NewEncoder(w).Encode(map[string]any{"data": liveCrowdinTask(10)})
		case r.Method == http.MethodPatch && r.URL.Path == "/projects/7/tasks/10":
			task := liveCrowdinTask(10)
			task["title"] = "Renamed"
			_ = json.NewEncoder(w).Encode(map[string]any{"data": task})
		case r.Method == http.MethodDelete && r.URL.Path == "/projects/7/tasks/10":
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && r.URL.Path == "/projects/7/members":
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"data": map[string]any{
				"id": 9, "username": "ada", "fullName": "Ada Lovelace",
			}}}})
		case r.Method == http.MethodGet && r.URL.Path == "/projects/7/tasks/10/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"data": map[string]any{
				"id": 3, "userId": 9, "taskId": 10, "text": "ship it",
				"createdAt": "2026-07-15T10:00:00Z", "updatedAt": "2026-07-15T10:00:00Z",
			}}}})
		case strings.HasPrefix(r.URL.Path, "/projects/7/branches"), strings.HasPrefix(r.URL.Path, "/projects/7/directories"):
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{}})
		case strings.HasPrefix(r.URL.Path, "/projects/7/files"):
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"data": map[string]any{
				"id": 1, "name": "home.json", "type": "json", "revisionId": 1, "status": "active",
			}}}})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	api, scope := projectTestAPI(t)
	mustOrgTMSCredential(t, scope)
	api.tms = &tmsImports{
		tokens: stubTMSMinter{token: &tmsauth.AccessToken{
			BaseURL:     server.URL,
			HeaderName:  "Authorization",
			HeaderValue: "Bearer token",
			AuthMode:    "api_key",
		}},
		http: server.Client(),
	}

	list := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:7/jobs"))
	require.Equal(t, http.StatusOK, list.Code, list.Body.String())
	require.Contains(t, list.Body.String(), `"id":"ext:crowdin:7:10"`)
	require.Contains(t, list.Body.String(), `"status":"queued"`)
	require.Contains(t, list.Body.String(), `"externalTitle":"Translate homepage"`)

	workspace := projectRequest(api, scope, scope.OrgPath("/tms/jobs"))
	require.Equal(t, http.StatusOK, workspace.Code, workspace.Body.String())
	require.Contains(t, workspace.Body.String(), `"id":"ext:crowdin:7:10"`)

	count := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:7/open-job-count"))
	require.Equal(t, http.StatusOK, count.Code, count.Body.String())
	require.JSONEq(t, `{"openJobCount":1}`, count.Body.String())

	detail := projectRequest(api, scope, scope.OrgPath("/jobs/ext:crowdin:7:10"))
	require.Equal(t, http.StatusOK, detail.Code, detail.Body.String())
	require.Contains(t, detail.Body.String(), `"externalJobId":"10"`)
	require.Contains(t, detail.Body.String(), `"description":null`)
	require.Contains(t, detail.Body.String(), `"externalDueDate":"2026-12-01T00:00:00.000Z"`)

	status := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:7/jobs/10/status"))
	require.Equal(t, http.StatusOK, status.Code, status.Body.String())
	require.Contains(t, status.Body.String(), `"status":"queued"`)

	members := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:7/members"))
	require.Equal(t, http.StatusOK, members.Code, members.Body.String())
	require.Contains(t, members.Body.String(), `"Ada Lovelace"`)

	comments := projectRequest(api, scope, scope.OrgPath("/jobs/ext:crowdin:7:10/comments"))
	require.Equal(t, http.StatusOK, comments.Code, comments.Body.String())
	require.Contains(t, comments.Body.String(), `"crowdin:task-comment:3"`)

	files := projectRequest(api, scope, scope.OrgPath("/jobs/ext:crowdin:7:10/files"))
	require.Equal(t, http.StatusOK, files.Code, files.Body.String())
	require.Contains(t, files.Body.String(), `"home.json"`)

	created := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/ext:crowdin:7/jobs"), map[string]any{
		"title": "Homepage", "targetLocales": []string{"fr"}, "fileIds": []string{"1"},
	})
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())
	require.Contains(t, created.Body.String(), `"id":"ext:crowdin:7:11"`)

	updated := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/jobs/ext:crowdin:7:10"), map[string]any{
		"title": "Renamed",
	})
	require.Equal(t, http.StatusOK, updated.Code, updated.Body.String())
	require.Contains(t, updated.Body.String(), `"externalTitle":"Renamed"`)

	deleted := projectMutationRequest(api, scope, http.MethodDelete, scope.OrgPath("/jobs/ext:crowdin:7:10"), nil)
	require.Equal(t, http.StatusNoContent, deleted.Code, deleted.Body.String())
}

func TestLiveCrowdinMineJobsKeepTheProjectName(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/projects/7":
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{
				"id": 7, "name": "Marketing", "sourceLanguageId": "en", "targetLanguageIds": []string{"fr"},
			}})
		case r.Method == http.MethodGet && r.URL.Path == "/user/tasks":
			require.Equal(t, "7", r.URL.Query().Get("projectId"))
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"data": liveCrowdinTask(10)}}})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	api, scope := projectTestAPI(t)
	mustOrgTMSCredential(t, scope)
	api.tms = &tmsImports{
		tokens: stubTMSMinter{token: &tmsauth.AccessToken{
			BaseURL: server.URL, HeaderName: "Authorization", HeaderValue: "Bearer token", AuthMode: "oauth",
		}},
		http: server.Client(),
	}
	rec := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:7/jobs?mine=true"))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"projectName":"Marketing"`)
	require.NotContains(t, rec.Body.String(), `"projectName":"Unknown project"`)
}

func TestLiveCrowdinJobContractGuards(t *testing.T) {
	api, scope := projectTestAPI(t)
	mustOrgTMSCredential(t, scope)
	api.tms = &tmsImports{
		tokens: stubTMSMinter{token: &tmsauth.AccessToken{
			BaseURL: "http://127.0.0.1", HeaderName: "Authorization", HeaderValue: "Bearer token",
		}},
		http: http.DefaultClient,
	}

	missing := projectRequest(api, scope, scope.OrgPath("/jobs/ext:crowdin:7:abc"))
	require.Equal(t, http.StatusNotFound, missing.Code, missing.Body.String())
	require.Contains(t, missing.Body.String(), "job_not_found")

	unknownKind := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/ext:crowdin:7/jobs"), map[string]any{
		"title": "Homepage", "targetLocales": []string{"fr"}, "fileIds": []string{"1"}, "kind": "review",
	})
	require.Equal(t, http.StatusBadRequest, unknownKind.Code, unknownKind.Body.String())

	badFile := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/ext:crowdin:7/jobs"), map[string]any{
		"title": "Homepage", "targetLocales": []string{"fr"}, "fileIds": []string{"abc"},
	})
	require.Equal(t, http.StatusBadRequest, badFile.Code, badFile.Body.String())

	badAssignee := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/jobs/ext:crowdin:7:10"), map[string]any{
		"assigneeExternalUserIds": []string{"01"},
	})
	require.Equal(t, http.StatusBadRequest, badAssignee.Code, badAssignee.Body.String())
	require.Contains(t, badAssignee.Body.String(), "invalid_crowdin_assignee_id")

	plusAssignee := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/jobs/ext:crowdin:7:10"), map[string]any{
		"assigneeExternalUserIds": []string{"+12"},
	})
	require.Equal(t, http.StatusBadRequest, plusAssignee.Code, plusAssignee.Body.String())
	require.Contains(t, plusAssignee.Body.String(), "invalid_crowdin_assignee_id")
}

func TestLiveCrowdinClearsANullDescription(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/projects/7":
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{
				"id": 7, "name": "Marketing", "sourceLanguageId": "en", "targetLanguageIds": []string{"fr"},
			}})
		case r.Method == http.MethodPatch && r.URL.Path == "/projects/7/tasks/10":
			raw, _ := io.ReadAll(r.Body)
			require.Contains(t, string(raw), `"path":"/description"`)
			require.Contains(t, string(raw), `"value":""`)
			_ = json.NewEncoder(w).Encode(map[string]any{"data": liveCrowdinTask(10)})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	api, scope := projectTestAPI(t)
	mustOrgTMSCredential(t, scope)
	api.tms = &tmsImports{
		tokens: stubTMSMinter{token: &tmsauth.AccessToken{
			BaseURL: server.URL, HeaderName: "Authorization", HeaderValue: "Bearer token",
		}},
		http: server.Client(),
	}
	rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/jobs/ext:crowdin:7:10"), map[string]any{
		"description": nil,
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
}

func TestLiveCrowdinJobCreateForbiddenForMember(t *testing.T) {
	api, scope := projectTestAPI(t)
	scope.Role = "member"
	api.membership = scope.Membership("member")
	rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/ext:crowdin:7/jobs"), map[string]any{
		"title": "Homepage", "targetLocales": []string{"fr"}, "fileIds": []string{"1"},
	})
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
}

func TestLiveCrowdinPartialCreate(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/projects/7" && r.Method == http.MethodGet:
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{
				"id": 7, "name": "Marketing", "sourceLanguageId": "en", "targetLanguageIds": []string{"fr", "de"},
			}})
		case r.URL.Path == "/projects/7/tasks" && r.Method == http.MethodPost:
			calls++
			if calls == 1 {
				_ = json.NewEncoder(w).Encode(map[string]any{"data": liveCrowdinTask(11)})
				return
			}
			w.WriteHeader(http.StatusBadGateway)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"message": "provider unavailable"}})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	api, scope := projectTestAPI(t)
	mustOrgTMSCredential(t, scope)
	api.tms = &tmsImports{
		tokens: stubTMSMinter{token: &tmsauth.AccessToken{
			BaseURL: server.URL, HeaderName: "Authorization", HeaderValue: "Bearer token",
		}},
		http: server.Client(),
	}
	rec := projectMutationRequest(api, scope, http.MethodPost, scope.OrgPath("/projects/ext:crowdin:7/jobs"), map[string]any{
		"title": "Homepage", "targetLocales": []string{"fr", "de"}, "fileIds": []string{"1"},
	})
	require.Equal(t, http.StatusMultiStatus, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"provider_task_create_partial"`)
	require.Contains(t, rec.Body.String(), `"createdCount":1`)
}

func TestLiveCrowdinJobFilesKeepTaskOrder(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/projects/7":
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{
				"id": 7, "name": "Marketing", "sourceLanguageId": "en", "targetLanguageIds": []string{"fr"},
			}})
		case r.Method == http.MethodGet && r.URL.Path == "/projects/7/tasks/10":
			task := liveCrowdinTask(10)
			task["fileIds"] = []int{2, 1}
			_ = json.NewEncoder(w).Encode(map[string]any{"data": task})
		case strings.HasPrefix(r.URL.Path, "/projects/7/branches"), strings.HasPrefix(r.URL.Path, "/projects/7/directories"):
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{}})
		case strings.HasPrefix(r.URL.Path, "/projects/7/files"):
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{
				{"data": map[string]any{"id": 1, "name": "first.json", "type": "json", "revisionId": 1, "status": "active"}},
				{"data": map[string]any{"id": 2, "name": "second.json", "type": "json", "revisionId": 1, "status": "active"}},
			}})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	api, scope := projectTestAPI(t)
	mustOrgTMSCredential(t, scope)
	api.tms = &tmsImports{
		tokens: stubTMSMinter{token: &tmsauth.AccessToken{
			BaseURL: server.URL, HeaderName: "Authorization", HeaderValue: "Bearer token",
		}},
		http: server.Client(),
	}
	rec := projectRequest(api, scope, scope.OrgPath("/jobs/ext:crowdin:7:10/files"))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Files []struct {
			Filename string `json:"filename"`
			Provider struct {
				ExternalResourceID string `json:"externalResourceId"`
			} `json:"provider"`
		} `json:"files"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.Files, 2)
	require.Equal(t, "2", body.Files[0].Provider.ExternalResourceID)
	require.Equal(t, "1", body.Files[1].Provider.ExternalResourceID)
}

func liveCrowdinTask(id int) map[string]any {
	return map[string]any{
		"id": id, "projectId": 7, "type": 0, "status": "todo", "title": "Translate homepage",
		"languageId": "fr", "fileIds": []int{1}, "deadline": "2026-12-01T00:00:00+00:00",
		"assignees": []map[string]any{{"id": 9, "username": "ada"}},
		"webUrl":    "https://crowdin.com/project/app/tasks/10",
		"createdAt": "2026-07-15T10:00:00.000Z", "updatedAt": "2026-07-15T10:00:00.000Z",
	}
}
