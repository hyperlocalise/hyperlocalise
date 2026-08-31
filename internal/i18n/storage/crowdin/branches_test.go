package crowdin

import (
	"context"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

func TestListBranches(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/projects/123/branches", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/branches?limit=500")
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{"id": 7, "name": "main"}},
				map[string]any{"data": map[string]any{"id": 9, "name": "feature/login"}},
			},
		})
	})

	got, err := client.ListBranches(context.Background(), "123")
	if err != nil {
		t.Fatalf("list branches: %v", err)
	}
	want := []Branch{{ID: 7, Name: "main"}, {ID: 9, Name: "feature/login"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("branches = %#v, want %#v", got, want)
	}
}

func TestAddBranch(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/projects/123/branches", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodPost, "/api/v2/projects/123/branches")
		assertJSONBody(t, r, map[string]any{"name": "feature/login"})
		writeJSON(t, w, map[string]any{
			"data": map[string]any{"id": 11, "name": "feature/login"},
		})
	})

	got, err := client.AddBranch(context.Background(), "123", "feature/login")
	if err != nil {
		t.Fatalf("add branch: %v", err)
	}
	if got != (Branch{ID: 11, Name: "feature/login"}) {
		t.Fatalf("branch = %#v", got)
	}
}

func TestAddBranchRejectsBlankName(t *testing.T) {
	client, _, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	for _, name := range []string{"", "   "} {
		_, err := client.AddBranch(context.Background(), "123", name)
		if err == nil || !strings.Contains(err.Error(), "name is required") {
			t.Fatalf("name %q error = %v", name, err)
		}
	}
}

func TestListBranchesPaginates(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/projects/123/branches", func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RawQuery {
		case "limit=500":
			rows := make([]any, 0, pageLimit)
			for i := 1; i <= pageLimit; i++ {
				rows = append(rows, map[string]any{
					"data": map[string]any{"id": i, "name": "branch"},
				})
			}
			writeJSON(t, w, map[string]any{"data": rows})
		case "limit=500&offset=500":
			writeJSON(t, w, map[string]any{
				"data": []any{
					map[string]any{"data": map[string]any{"id": 501, "name": "feature/page-two"}},
				},
			})
		default:
			t.Fatalf("unexpected branches query %q", r.URL.RawQuery)
		}
	})

	got, err := client.ListBranches(context.Background(), "123")
	if err != nil {
		t.Fatalf("list branches: %v", err)
	}
	if len(got) != pageLimit+1 || got[pageLimit] != (Branch{ID: 501, Name: "feature/page-two"}) {
		t.Fatalf("branches len=%d last=%#v", len(got), got[len(got)-1])
	}
}
