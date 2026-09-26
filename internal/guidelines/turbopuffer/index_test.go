package turbopuffer

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/embedding"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/stretchr/testify/require"
	tp "github.com/turbopuffer/turbopuffer-go/v2"
	"github.com/turbopuffer/turbopuffer-go/v2/option"
)

func testIndex(serverURL string) *Index {
	return &Index{client: tp.NewClient(option.WithAPIKey("test-key"), option.WithBaseURL(serverURL), option.WithMaxRetries(0)), prefix: "test-guidelines"}
}

func TestNewRequiresConfig(t *testing.T) {
	_, err := New("", "gcp-us-central1", "prefix")
	require.ErrorIs(t, err, guidelines.ErrInvalidInput)
	_, err = New("key", "", "prefix")
	require.ErrorIs(t, err, guidelines.ErrInvalidInput)
	_, err = New("key", "gcp-us-central1", "")
	require.ErrorIs(t, err, guidelines.ErrInvalidInput)
	_, err = New("key", "gcp-us-central1", strings.Repeat("p", 41))
	require.ErrorIs(t, err, guidelines.ErrInvalidInput)
	index, err := New("key", "gcp-us-central1", "prefix")
	require.NoError(t, err)
	require.NotNil(t, index)
}

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
		if _, ok := body["queries"].([]any); ok {
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{
				"results": []map[string]any{
					{"rows": []map[string]any{
						{"id": chunks[0].ID, "document_id": "doc", "revision_id": "rev2"},
						{"id": chunks[1].ID, "document_id": "doc", "revision_id": "rev2"},
					}},
				},
			}))
			return
		}
		_, err := io.WriteString(w, `{"rows_affected":2}`)
		require.NoError(t, err)
	}))
	defer server.Close()
	index := testIndex(server.URL)
	require.NoError(t, index.Upsert(t.Context(), doc))
	require.Equal(t, "cosine_distance", bodies[0]["distance_metric"])
	require.Len(t, bodies[0]["upsert_rows"], 2)
	rows, ok := bodies[0]["upsert_rows"].([]any)
	require.True(t, ok)
	first, ok := rows[0].(map[string]any)
	require.True(t, ok)
	_, hasVector := first["vector"]
	require.False(t, hasVector)
	require.Equal(t, "Keep placeholders.", first["text"])
	schema, ok := bodies[0]["schema"].(map[string]any)
	require.True(t, ok)
	require.NotContains(t, schema, "vector")
	textSchema, ok := schema["text"].(map[string]any)
	require.True(t, ok)
	embed, ok := textSchema["embed"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, embedding.Model, embed["model"])
	require.Equal(t, float64(embedding.Dimensions), embed["dims"])
	encoded, err := json.Marshal(bodies[0]["delete_by_filter"])
	require.NoError(t, err)
	require.JSONEq(t, `["And",[["document_id","Eq","doc"],["version","Lte",2]]]`, string(encoded))
	hits, err := index.Search(t.Context(), guidelines.Query{Scope: doc.Scope, Text: "placeholders", Documents: []guidelines.Document{doc}, Limit: 5})
	require.NoError(t, err)
	require.Len(t, hits, 2)
	require.Equal(t, chunks[0].ID, hits[0].ID)
	queries, ok := bodies[1]["queries"].([]any)
	require.True(t, ok)
	require.Len(t, queries, 2)
	encoded, err = json.Marshal(bodies[1])
	require.NoError(t, err)
	require.Contains(t, string(encoded), `"BM25"`)
	require.Contains(t, string(encoded), `"ANN"`)
	require.Contains(t, string(encoded), `"Embed"`)
	require.Contains(t, string(encoded), `"RRF"`)
	require.Contains(t, string(encoded), "placeholders")
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
	index := testIndex(server.URL)
	doc := guidelines.Document{ID: "doc", RevisionID: "r1", Version: 1, Scope: guidelines.Scope{OrganizationID: "org"}}
	hits, err := index.Search(t.Context(), guidelines.Query{Scope: doc.Scope, Text: "query", Documents: []guidelines.Document{doc}, Limit: 5})
	require.NoError(t, err)
	require.Empty(t, hits)
	require.NoError(t, index.DeleteThrough(t.Context(), doc.Scope, doc.ID, 1))
}
