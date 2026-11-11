package tmscatalog

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestJobsSupported(t *testing.T) {
	t.Parallel()
	if !JobsSupported("crowdin") || !JobsSupported("Crowdin") || !JobsSupported("smartling") {
		t.Fatal("crowdin and smartling should be supported")
	}
	for _, kind := range []string{"phrase", "lokalise", ""} {
		if JobsSupported(kind) {
			t.Fatalf("JobsSupported(%q) = true", kind)
		}
	}
	crowdin := JobFeaturesFor("crowdin")
	if !crowdin.Create || !crowdin.Assignees {
		t.Fatalf("crowdin features = %#v", crowdin)
	}
	if JobFeaturesFor("smartling").Create || JobFeaturesFor("smartling").Assignees {
		t.Fatal("smartling should not create jobs or assign members")
	}
}

func TestMapCrowdinStatus(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"done":               "succeeded",
		"closed":             "succeeded",
		"in_progress":        "running",
		"todo":               "queued",
		"failed":             "failed",
		"waiting_for_review": "waiting_for_review",
		"cancelled":          "cancelled",
		"mystery":            "queued",
	}
	for status, want := range cases {
		if got := MapCrowdinStatus(status); got != want {
			t.Errorf("MapCrowdinStatus(%q) = %q, want %q", status, got, want)
		}
	}
	if !OpenJobStatus("queued") || !OpenJobStatus("running") || !OpenJobStatus("waiting_for_review") {
		t.Fatal("open statuses")
	}
	if OpenJobStatus("succeeded") || OpenJobStatus("cancelled") {
		t.Fatal("closed statuses")
	}
}

func TestMapSmartlingStatus(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"COMPLETED":              "succeeded",
		"published":              "succeeded",
		"IN_PROGRESS":            "running",
		"in translation":         "running",
		"AWAITING_AUTHORIZATION": "queued",
		"FAILED":                 "failed",
		"CANCELLED":              "cancelled",
		"In Review":              "waiting_for_review",
		"in_edit":                "waiting_for_review",
		"mystery":                "queued",
	}
	for status, want := range cases {
		if got := MapSmartlingStatus(status); got != want {
			t.Errorf("MapSmartlingStatus(%q) = %q, want %q", status, got, want)
		}
	}
	if MapJobStatus("smartling", "published") != "succeeded" {
		t.Fatal("published Smartling jobs succeed")
	}
	if MapJobStatus("crowdin", "published") != "queued" {
		t.Fatal("unknown Crowdin statuses stay queued")
	}
}

func TestCrowdinCreateTaskPayload(t *testing.T) {
	t.Parallel()
	desc := "Notes"
	payload, err := crowdinCreateTaskPayload(CreateTask{
		Title:       " Homepage ",
		LanguageID:  "fr",
		Kind:        "proofread",
		Description: &desc,
		FileIDs:     []string{"1", "1", "2"},
		Assignees:   []string{"9"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if payload["title"] != "Homepage" || payload["languageId"] != "fr" || payload["type"] != 1 {
		t.Fatalf("payload = %#v", payload)
	}
	if _, err := crowdinCreateTaskPayload(CreateTask{Title: "x", LanguageID: "fr", Kind: "review", FileIDs: []string{"1"}}); err == nil {
		t.Fatal("review should fail")
	}
	if _, err := crowdinCreateTaskPayload(CreateTask{Title: "x", LanguageID: "fr", FileIDs: []string{"1"}, StringIDs: []string{"2"}}); err == nil {
		t.Fatal("mixed scopes should fail")
	}
}

func TestCrowdinCanonicalID(t *testing.T) {
	t.Parallel()
	if _, err := crowdinCanonicalID("12", "assigneeId"); err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{"", "0", "01", "abc", "-1"} {
		if _, err := crowdinCanonicalID(raw, "assigneeId"); err == nil {
			t.Fatalf("crowdinCanonicalID(%q) should fail", raw)
		}
	}
}

func TestCrowdinGetTaskUnknownID(t *testing.T) {
	t.Parallel()
	operator := newCrowdin(Credentials{BaseURL: "http://127.0.0.1", HeaderName: "Authorization", HeaderValue: "Bearer x"}, http.DefaultClient)
	got, err := operator.GetTask(context.Background(), "7", "abc")
	if err != nil || got != nil {
		t.Fatalf("invalid task ids are missing, not unreachable: %#v, %v", got, err)
	}
}

func TestCrowdinDeleteMissingTask(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/7/tasks/10", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "method", http.StatusMethodNotAllowed)
			return
		}
		http.Error(w, "gone", http.StatusNotFound)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	operator, err := NewJobOperator("crowdin", Credentials{
		BaseURL: srv.URL, HeaderName: "Authorization", HeaderValue: "Bearer x",
	}, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	if err := operator.DeleteTask(context.Background(), "7", "10"); err != nil {
		t.Fatal(err)
	}
}

func TestCrowdinUpdateClearsDescription(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/7/tasks/10", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			http.Error(w, "method", http.StatusMethodNotAllowed)
			return
		}
		var patches []crowdinTaskPatch
		if err := json.NewDecoder(r.Body).Decode(&patches); err != nil {
			http.Error(w, "json", http.StatusBadRequest)
			return
		}
		if len(patches) != 1 || patches[0].Path != "/description" || patches[0].Value != "" {
			http.Error(w, "patch", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"data": crowdinTaskFixture(10)})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	operator, err := NewJobOperator("crowdin", Credentials{
		BaseURL: srv.URL, HeaderName: "Authorization", HeaderValue: "Bearer x",
	}, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	empty := ""
	if _, err := operator.UpdateTask(context.Background(), "7", "10", TaskUpdate{Description: &empty}); err != nil {
		t.Fatal(err)
	}
}

func TestCrowdinListAndGetTasks(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/7/tasks", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["languageId"] != "fr" || body["title"] != "Homepage" {
				http.Error(w, "bad create", http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"data": crowdinTaskFixture(11)})
			return
		}
		if r.URL.Query().Get("orderBy") != crowdinLiveTaskListOrderBy {
			http.Error(w, "missing order", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(crowdinData(crowdinTaskFixture(10)))
	})
	mux.HandleFunc("/projects/7/tasks/10", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"data": crowdinTaskFixture(10)})
		case http.MethodPatch:
			w.Header().Set("Content-Type", "application/json")
			task := crowdinTaskFixture(10)
			task["title"] = "Renamed"
			_ = json.NewEncoder(w).Encode(map[string]any{"data": task})
		case http.MethodDelete:
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "method", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/projects/7/members", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(crowdinData(map[string]any{"id": 9, "username": "ada", "fullName": "Ada Lovelace"}))
	})
	mux.HandleFunc("/projects/7/tasks/10/comments", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(crowdinData(map[string]any{
			"id": 3, "userId": 9, "taskId": 10, "text": "ship it", "createdAt": "2026-07-15T10:00:00Z", "updatedAt": "2026-07-15T10:00:00Z",
		}))
	})
	mux.HandleFunc("/user/tasks", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("projectId") != "7" {
			http.Error(w, "project", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(crowdinData(crowdinTaskFixture(10)))
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"id": 9, "username": "ada"}})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	operator, err := NewJobOperator("crowdin", Credentials{
		BaseURL:     srv.URL,
		HeaderName:  "Authorization",
		HeaderValue: "Bearer x",
		AuthMode:    "oauth",
	}, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	if !operator.UsesPerUserAuth() {
		t.Fatal("oauth should be per-user")
	}
	tasks, err := operator.ListTasks(context.Background(), "7", TaskListOptions{})
	if err != nil || len(tasks) != 1 || tasks[0].ExternalID != "10" || tasks[0].Kind != "translation" {
		t.Fatalf("ListTasks = %#v, %v", tasks, err)
	}
	got, err := operator.GetTask(context.Background(), "7", "10")
	if err != nil || got == nil || got.Title != "Translate homepage" {
		t.Fatalf("GetTask = %#v, %v", got, err)
	}
	if got.ProviderPayload["description"] != nil {
		t.Fatalf("missing description should be JSON null, got %#v", got.ProviderPayload["description"])
	}
	created, err := operator.CreateTask(context.Background(), "7", CreateTask{
		Title: "Homepage", LanguageID: "fr", FileIDs: []string{"1"},
	})
	if err != nil || created.ExternalID != "11" {
		t.Fatalf("CreateTask = %#v, %v", created, err)
	}
	title := "Renamed"
	updated, err := operator.UpdateTask(context.Background(), "7", "10", TaskUpdate{Title: &title})
	if err != nil || updated.Title != "Renamed" {
		t.Fatalf("UpdateTask = %#v, %v", updated, err)
	}
	if err := operator.DeleteTask(context.Background(), "7", "10"); err != nil {
		t.Fatal(err)
	}
	members, err := operator.ListMembers(context.Background(), "7")
	if err != nil || len(members) != 1 || members[0].DisplayName != "Ada Lovelace" {
		t.Fatalf("ListMembers = %#v, %v", members, err)
	}
	comments, err := operator.ListTaskComments(context.Background(), "7", "10")
	if err != nil || len(comments) != 1 || comments[0].Text != "ship it" {
		t.Fatalf("ListTaskComments = %#v, %v", comments, err)
	}
	user, err := operator.GetUser(context.Background())
	if err != nil || user.ID != "9" {
		t.Fatalf("GetUser = %#v, %v", user, err)
	}
	mine, err := operator.ListUserTasks(context.Background(), "7", TaskListOptions{})
	if err != nil || len(mine) != 1 {
		t.Fatalf("ListUserTasks = %#v, %v", mine, err)
	}
}

func TestSmartlingListAndGetTasks(t *testing.T) {
	t.Parallel()
	mux := http.NewServeMux()
	mux.HandleFunc("/projects-api/v2/projects/proj-1", func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingData(w, map[string]any{
			"accountUid": "acct-1", "projectId": "proj-1", "projectName": "Marketing",
			"sourceLocaleId": "en-US", "archived": false,
			"targetLocales": []map[string]any{{"localeId": "fr-FR", "enabled": true}},
		})
	})
	mux.HandleFunc("/jobs-api/v3/projects/proj-1/jobs", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/jobs-api/v3/projects/proj-1/jobs" {
			http.NotFound(w, r)
			return
		}
		writeSmartlingData(w, map[string]any{
			"items":      []any{smartlingJobFixture("job-1", "IN_PROGRESS")},
			"totalCount": 1,
		})
	})
	mux.HandleFunc("/jobs-api/v3/projects/proj-1/jobs/job-1", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			writeSmartlingData(w, smartlingJobFixture("job-1", "IN_PROGRESS"))
		case http.MethodPut:
			var body map[string]string
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, "json", http.StatusBadRequest)
				return
			}
			if body["jobName"] != "Renamed" {
				http.Error(w, "name", http.StatusBadRequest)
				return
			}
			job := smartlingJobFixture("job-1", "IN_PROGRESS")
			job["jobName"] = "Renamed"
			writeSmartlingData(w, job)
		default:
			http.Error(w, "method", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/jobs-api/v3/projects/proj-1/jobs/job-1/files", func(w http.ResponseWriter, _ *http.Request) {
		writeSmartlingData(w, map[string]any{
			"items":      []any{map[string]any{"fileUri": "home.json"}},
			"totalCount": 1,
		})
	})
	mux.HandleFunc("/jobs-api/v3/projects/proj-1/jobs/missing", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "gone", http.StatusNotFound)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	operator, err := NewJobOperator("smartling", Credentials{
		BaseURL: srv.URL, HeaderName: "Authorization", HeaderValue: "Bearer x", AccountID: "acct-1",
	}, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	if operator.UsesPerUserAuth() {
		t.Fatal("smartling is not per-user")
	}
	tasks, err := operator.ListTasks(context.Background(), "proj-1", TaskListOptions{})
	if err != nil || len(tasks) != 1 || tasks[0].ExternalID != "job-1" || tasks[0].Kind != "translation" {
		t.Fatalf("ListTasks = %#v, %v", tasks, err)
	}
	if len(tasks[0].FileIDs) != 0 {
		t.Fatalf("list payloads omit file ids, got %#v", tasks[0].FileIDs)
	}
	got, err := operator.GetTask(context.Background(), "proj-1", "job-1")
	if err != nil || got == nil || got.Title != "French launch" || got.URL == nil {
		t.Fatalf("GetTask = %#v, %v", got, err)
	}
	if got.FileIDs[0] != "home.json" || got.ProviderPayload["fileIds"].([]string)[0] != "home.json" {
		t.Fatalf("detail file ids = %#v", got.FileIDs)
	}
	if !strings.Contains(*got.URL, "/jobs/job-1") {
		t.Fatalf("url = %q", *got.URL)
	}
	missing, err := operator.GetTask(context.Background(), "proj-1", "missing")
	if err != nil || missing != nil {
		t.Fatalf("missing jobs are absent, not unreachable: %#v, %v", missing, err)
	}
	title := "Renamed"
	updated, err := operator.UpdateTask(context.Background(), "proj-1", "job-1", TaskUpdate{Title: &title})
	if err != nil || updated.Title != "Renamed" {
		t.Fatalf("UpdateTask = %#v, %v", updated, err)
	}
	if _, err := operator.UpdateTask(context.Background(), "proj-1", "job-1", TaskUpdate{HasAssignees: true}); err == nil {
		t.Fatal("assignee updates should fail")
	}
	if _, err := operator.CreateTask(context.Background(), "proj-1", CreateTask{Title: "x"}); err == nil {
		t.Fatal("create should fail")
	}
	if err := operator.DeleteTask(context.Background(), "proj-1", "job-1"); err == nil {
		t.Fatal("delete should fail")
	}
}

func TestSmartlingReviewKind(t *testing.T) {
	t.Parallel()
	job := mapSmartlingJob(smartlingJob{
		TranslationJobUID: "job-2", JobName: "Review pass", JobStatus: "In Review", TargetLocaleIDs: []string{"de-DE"},
	}, smartlingProjectDetails{AccountUID: "acct-1", ProjectID: "proj-1"}, "proj-1", nil)
	if job.Kind != "review" {
		t.Fatalf("kind = %q", job.Kind)
	}
}

func writeSmartlingData(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"response": map[string]any{"code": "SUCCESS", "data": data}})
}

func smartlingJobFixture(id, status string) map[string]any {
	return map[string]any{
		"translationJobUid": id, "jobName": "French launch", "jobStatus": status,
		"description": "Homepage strings", "dueDate": "2026-06-01T00:00:00Z",
		"targetLocaleIds": []string{"fr-FR"}, "createdDate": "2026-07-15T10:00:00.000Z",
		"modifiedDate": "2026-07-15T10:00:00.000Z",
	}
}

func crowdinTaskFixture(id int) map[string]any {
	return map[string]any{
		"id": id, "projectId": 7, "type": 0, "status": "todo", "title": "Translate homepage",
		"languageId": "fr", "fileIds": []int{1},
		"assignees": []map[string]any{{"id": 9, "username": "ada"}},
		"webUrl":    "https://crowdin.com/project/app/tasks/10",
		"createdAt": "2026-07-15T10:00:00.000Z", "updatedAt": "2026-07-15T10:00:00.000Z",
	}
}
