package main

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDecodeUpdateProjectRequestActive(t *testing.T) {
	req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"active":false}`))
	decoded, changed, err := decodeUpdateProjectRequest(req)
	if err != nil {
		t.Fatal(err)
	}
	if decoded.active == nil || *decoded.active {
		t.Fatalf("active = %v", decoded.active)
	}
	if len(changed) != 1 || changed[0] != "active" {
		t.Fatalf("changed = %v", changed)
	}
}

func TestCallProjectWorkflowForwardsTheServiceToken(t *testing.T) {
	var gotToken, gotAction, gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotToken = r.Header.Get(serverCallTokenHeader)
		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), `"qa_start"`) {
			t.Errorf("body = %s", body)
		}
		gotAction = "qa_start"
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result":{"run":{"id":"run-1","status":"queued"}}}`))
	}))
	defer server.Close()
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", server.URL)
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")

	result, status, err := callProjectWorkflow(context.Background(), "qa_start", map[string]any{
		"organizationId": "org",
		"userId":         "user",
		"projectId":      "project",
	})
	if err != nil {
		t.Fatal(err)
	}
	if status != http.StatusOK || gotAction != "qa_start" || gotToken == "" || gotPath != projectWorkflowPath {
		t.Fatalf("status %d action %q token %q path %q result %#v", status, gotAction, gotToken, gotPath, result)
	}
}
