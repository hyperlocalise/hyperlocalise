package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

func TestOrgJobRetryForwardsWorkflow(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/api/internal/iris/project-action", r.URL.Path)
		require.NoError(t, json.NewDecoder(r.Body).Decode(&got))
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"result": map[string]string{"id": "job-1", "action": "retry"}})
	}))
	defer server.Close()
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", server.URL)
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")

	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.SetPathValue("jobId", "job-1")
	api := &projectAPI{pool: nativeJobActionPool{projectID: "proj-1"}}
	_, _, err := api.orgJobRetryHandler(req, projectActor{
		role:           "admin",
		userID:         "user-1",
		organizationID: "org-1",
	})
	require.Error(t, err)
	require.Equal(t, "job_action", got["action"])
	payload, ok := got["payload"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "retry", payload["action"])
	require.Equal(t, "job-1", payload["jobId"])
	require.Equal(t, "proj-1", payload["projectId"])
}

type nativeJobActionPool struct {
	projectID string
}

func (p nativeJobActionPool) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, errors.New("unexpected query")
}

func (p nativeJobActionPool) QueryRow(_ context.Context, query string, _ ...any) pgx.Row {
	if strings.Contains(query, "select j.project_id") {
		return scalarStringRow{p.projectID}
	}
	return noRowsRow{}
}

func (p nativeJobActionPool) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("unexpected exec")
}

func (p nativeJobActionPool) Begin(context.Context) (pgx.Tx, error) {
	return nil, errors.New("unexpected begin")
}

type scalarStringRow struct {
	value string
}

func (r scalarStringRow) Scan(dest ...any) error {
	p, ok := dest[0].(**string)
	if !ok {
		return errors.New("unexpected scan destination")
	}
	value := r.value
	*p = &value
	return nil
}
