package turbopuffer

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/stretchr/testify/require"
	tp "github.com/turbopuffer/turbopuffer-go"
	"github.com/turbopuffer/turbopuffer-go/option"
)

func TestIndexRequestsAreScopedAndRevisionFiltered(t *testing.T) {
	var bodies []map[string]any
	var paths []string
	doc := guidelines.Document{ID: "doc", RevisionID: "rev2", Version: 2, Scope: guidelines.Scope{OrganizationID: "org1", ProjectID: "proj"}, Content: "Keep placeholders.\n\nUse friendly wording."}
	chunks := guidelines.Chunks(doc)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
		var body map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		bodies = append(bodies, body)
		paths = append(paths, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/query") {
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{"rows": []map[string]any{{"id": chunks[0].ID, "document_id": "doc", "revision_id": "rev2"}}}))
		} else {
			_, err := io.WriteString(w, `{"rows_affected":2}`)
			require.NoError(t, err)
		}
	}))
	defer server.Close()
	index := &Index{client: tp.NewClient(option.WithAPIKey("test-key"), option.WithBaseURL(server.URL), option.WithMaxRetries(0)), prefix: "test-guidelines"}
	require.NoError(t, index.Upsert(t.Context(), doc))
	require.Len(t, bodies[0]["upsert_rows"], 2)
	encoded, err := json.Marshal(bodies[0]["delete_by_filter"])
	require.NoError(t, err)
	require.JSONEq(t, `["And",[["document_id","Eq","doc"],["version","Lte",2]]]`, string(encoded))
	hits, err := index.Search(t.Context(), guidelines.Query{Scope: doc.Scope, Text: "placeholders", Documents: []guidelines.Document{doc}, Limit: 5})
	require.NoError(t, err)
	require.Len(t, hits, 1)
	require.Equal(t, chunks[0].ID, hits[0].ID)
	encoded, err = json.Marshal(bodies[1]["filters"])
	require.NoError(t, err)
	require.Contains(t, string(encoded), "rev2")
	require.Contains(t, string(encoded), "doc")
	require.NoError(t, index.DeleteThrough(t.Context(), doc.Scope, doc.ID, 1))
	encoded, err = json.Marshal(bodies[2]["delete_by_filter"])
	require.NoError(t, err)
	require.Contains(t, string(encoded), `"Lte",1`)
	second := doc
	second.Scope.OrganizationID = "org2"
	require.NoError(t, index.Upsert(t.Context(), second))
	require.NotEqual(t, paths[0], paths[3])
	_, err = index.Search(t.Context(), guidelines.Query{Scope: doc.Scope, Text: "query", Documents: []guidelines.Document{second}, Limit: 5})
	require.ErrorIs(t, err, guidelines.ErrInvalidInput)
	require.Len(t, bodies, 4)
}

func TestIndexMissingNamespace(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, err := io.WriteString(w, `{"error":"not found"}`)
		require.NoError(t, err)
	}))
	defer server.Close()
	index := &Index{client: tp.NewClient(option.WithAPIKey("test"), option.WithBaseURL(server.URL), option.WithMaxRetries(0)), prefix: "test"}
	doc := guidelines.Document{ID: "doc", RevisionID: "r1", Version: 1, Scope: guidelines.Scope{OrganizationID: "org"}}
	hits, err := index.Search(t.Context(), guidelines.Query{Scope: doc.Scope, Text: "query", Documents: []guidelines.Document{doc}, Limit: 5})
	require.NoError(t, err)
	require.Empty(t, hits)
	require.NoError(t, index.DeleteThrough(t.Context(), doc.Scope, doc.ID, 1))
}
