package vercelblob

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/stretchr/testify/require"
)

const testToken = "vercel_blob_rw_store123_secret"

// fakeBlob serves the Blob API and the store host the way Vercel Blob answers the SDK.
type fakeBlob struct {
	mu      sync.Mutex
	objects map[string][]byte
	types   map[string]string
	seen    []*http.Request
}

func (f *fakeBlob) handler(t *testing.T) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		f.seen = append(f.seen, r.Clone(context.Background()))
		require.Equal(t, "Bearer "+testToken, r.Header.Get("authorization"))
		writeErr := func(status int, code, message string) {
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"code": code, "message": message}})
		}
		switch {
		case strings.HasPrefix(r.URL.Path, "/blob/") && r.Method == http.MethodGet:
			key := strings.TrimPrefix(r.URL.Path, "/blob/")
			body, ok := f.objects[key]
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", f.types[key])
			w.Header().Set("ETag", `"e1"`)
			_, _ = w.Write(body)
		case (r.URL.Path == "/api" || r.URL.Path == "/api/") && r.Method == http.MethodPut:
			require.Equal(t, "13", r.Header.Get("x-api-version"))
			require.Equal(t, "store123", r.Header.Get("x-vercel-blob-store-id"))
			require.Equal(t, "private", r.Header.Get("x-vercel-blob-access"))
			require.Equal(t, "0", r.Header.Get("x-add-random-suffix"))
			key := r.URL.Query().Get("pathname")
			if _, exists := f.objects[key]; exists && r.Header.Get("x-allow-overwrite") == "0" {
				writeErr(http.StatusBadRequest, "bad_request", "Vercel Blob: This blob already exists")
				return
			}
			body, _ := io.ReadAll(r.Body)
			f.objects[key] = body
			f.types[key] = r.Header.Get("x-content-type")
			_ = json.NewEncoder(w).Encode(map[string]any{"pathname": key, "contentType": f.types[key], "etag": `"e1"`})
		case r.URL.Path == "/api" && r.Method == http.MethodGet && r.URL.Query().Has("url"):
			key := r.URL.Query().Get("url")
			body, ok := f.objects[key]
			if !ok {
				writeErr(http.StatusNotFound, "not_found", "The requested blob does not exist")
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"pathname": key, "size": len(body), "contentType": f.types[key], "etag": `"e1"`})
		case r.URL.Path == "/api" && r.Method == http.MethodGet:
			prefix := r.URL.Query().Get("prefix")
			var blobs []map[string]any
			for key := range f.objects {
				if strings.HasPrefix(key, prefix) {
					blobs = append(blobs, map[string]any{"pathname": key})
				}
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"blobs": blobs, "hasMore": false})
		case r.URL.Path == "/api/delete" && r.Method == http.MethodPost:
			var body struct {
				URLs []string `json:"urls"`
			}
			require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
			for _, target := range body.URLs {
				delete(f.objects, target[strings.Index(target, "/blob/")+len("/blob/"):])
			}
			w.WriteHeader(http.StatusOK)
		default:
			t.Errorf("unexpected request %s %s", r.Method, r.URL)
			w.WriteHeader(http.StatusTeapot)
		}
	})
}

func newTestStore(t *testing.T) (*Store, *fakeBlob) {
	t.Helper()
	fake := &fakeBlob{objects: map[string][]byte{}, types: map[string]string{}}
	server := httptest.NewServer(fake.handler(t))
	t.Cleanup(server.Close)
	store, err := New(Config{Token: testToken, APIURL: server.URL + "/api", BlobBaseURL: server.URL + "/blob", HTTPClient: server.Client()})
	require.NoError(t, err)
	return store, fake
}

func TestStoreRoundTrip(t *testing.T) {
	ctx := t.Context()
	store, fake := newTestStore(t)

	info, err := store.Put(ctx, objectstore.PutInput{
		Key: "org/project/en.json", Body: bytes.NewReader([]byte(`{"a":1}`)), Size: 7, ContentType: "application/json", IfAbsent: true,
	})
	require.NoError(t, err)
	require.Equal(t, int64(7), info.Size)
	require.Equal(t, "application/json", info.ContentType)

	_, err = store.Put(ctx, objectstore.PutInput{
		Key: "org/project/en.json", Body: bytes.NewReader([]byte(`{}`)), Size: 2, ContentType: "application/json", IfAbsent: true,
	})
	require.ErrorIs(t, err, objectstore.ErrAlreadyExists)

	body, info, err := store.Get(ctx, "org/project/en.json")
	require.NoError(t, err)
	content, err := io.ReadAll(body)
	require.NoError(t, body.Close())
	require.NoError(t, err)
	require.Equal(t, `{"a":1}`, string(content))
	require.Equal(t, "application/json", info.ContentType)

	stat, err := store.Stat(ctx, "org/project/en.json")
	require.NoError(t, err)
	require.Equal(t, int64(7), stat.Size)

	keys, err := store.List(ctx, "org/")
	require.NoError(t, err)
	require.Equal(t, []string{"org/project/en.json"}, keys)

	require.NoError(t, store.Delete(ctx, "org/project/en.json"))
	_, _, err = store.Get(ctx, "org/project/en.json")
	require.ErrorIs(t, err, objectstore.ErrNotFound)
	_, err = store.Stat(ctx, "org/project/en.json")
	require.ErrorIs(t, err, objectstore.ErrNotFound)
	require.NotEmpty(t, fake.seen)
}

func TestStoreReadsStoredBlobURLsOnItsHostOnly(t *testing.T) {
	ctx := t.Context()
	store, fake := newTestStore(t)
	fake.objects["files/a b.txt"] = []byte("hi")
	fake.types["files/a b.txt"] = "text/plain"

	body, _, err := store.Get(ctx, store.blobBaseURL+"/files/a%20b.txt")
	require.NoError(t, err)
	require.NoError(t, body.Close())

	body, _, err = store.Get(ctx, "files/a b.txt")
	require.NoError(t, err)
	require.NoError(t, body.Close())

	_, _, err = store.Get(ctx, "https://evil.example.com/files/a.txt")
	require.ErrorIs(t, err, objectstore.ErrInvalidInput)
}

func TestNewValidatesConfig(t *testing.T) {
	_, err := New(Config{Token: "not-a-token"})
	require.ErrorIs(t, err, ErrInvalidToken)
	_, err = New(Config{Token: testToken, Access: "secret"})
	require.Error(t, err)
	store, err := New(Config{Token: testToken})
	require.NoError(t, err)
	require.Equal(t, "https://store123.private.blob.vercel-storage.com", store.blobBaseURL)
	require.Equal(t, DefaultAPIURL, store.apiURL)
	require.Equal(t, "store123", StoreIDFromToken(testToken))
}

func TestStoreMapsUnexpectedErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":{"code":"service_unavailable"}}`))
	}))
	t.Cleanup(server.Close)
	store, err := New(Config{Token: testToken, APIURL: server.URL, BlobBaseURL: server.URL, HTTPClient: server.Client()})
	require.NoError(t, err)
	_, err = store.Stat(t.Context(), "a")
	require.Error(t, err)
	require.NotErrorIs(t, err, objectstore.ErrNotFound)
	_, _, err = store.Get(t.Context(), "a")
	require.Error(t, err)
}

func TestFromEnv(t *testing.T) {
	t.Setenv("BLOB_READ_WRITE_TOKEN", "")
	store, err := FromEnv()
	require.NoError(t, err)
	require.Nil(t, store)

	t.Setenv("BLOB_READ_WRITE_TOKEN", testToken)
	t.Setenv("FILE_STORAGE_ACCESS", "public")
	store, err = FromEnv()
	require.NoError(t, err)
	require.Equal(t, "https://store123.public.blob.vercel-storage.com", store.blobBaseURL)
}
