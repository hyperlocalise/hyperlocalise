package tmscatalog

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestJobsSupported(t *testing.T) {
	t.Parallel()
	if !JobsSupported("crowdin") || !JobsSupported("Crowdin") {
		t.Fatal("crowdin should be supported")
	}
	for _, kind := range []string{"phrase", "lokalise", "smartling", ""} {
		if JobsSupported(kind) {
			t.Fatalf("JobsSupported(%q) = true", kind)
		}
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

func crowdinTaskFixture(id int) map[string]any {
	return map[string]any{
		"id": id, "projectId": 7, "type": 0, "status": "todo", "title": "Translate homepage",
		"languageId": "fr", "fileIds": []int{1},
		"assignees": []map[string]any{{"id": 9, "username": "ada"}},
		"webUrl":    "https://crowdin.com/project/app/tasks/10",
		"createdAt": "2026-07-15T10:00:00.000Z", "updatedAt": "2026-07-15T10:00:00.000Z",
	}
}
