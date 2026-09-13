package s3compat

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/stretchr/testify/require"
)

func testStore(t *testing.T, handler http.HandlerFunc) *Store {
	t.Helper()
	server := httptest.NewTLSServer(handler)
	t.Cleanup(server.Close)
	client := s3.NewFromConfig(aws.Config{Region: "auto", Credentials: credentials.NewStaticCredentialsProvider("test-key", "test-secret", ""), HTTPClient: server.Client()}, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(server.URL)
		o.UsePathStyle = true
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	})
	return &Store{client: client, signer: s3.NewPresignClient(client), bucket: "files"}
}

func TestObjectOperations(t *testing.T) {
	var payload string
	store := testStore(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/files/missing" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		switch r.Method {
		case http.MethodPut:
			require.Equal(t, "*", r.Header.Get("If-None-Match"))
			require.Equal(t, "text/plain", r.Header.Get("Content-Type"))
			require.Equal(t, "immutable", r.Header.Get("Cache-Control"))
			content, err := io.ReadAll(r.Body)
			require.NoError(t, err)
			payload = string(content)
			require.EqualValues(t, len(content), r.ContentLength)
			w.Header().Set("ETag", `"opaque"`)
		case http.MethodHead, http.MethodGet:
			w.Header().Set("Content-Length", "5")
			w.Header().Set("Content-Type", "text/plain")
			w.Header().Set("ETag", `"opaque"`)
			w.Header().Set("X-Amz-Meta-Example", "value")
			if r.Method == http.MethodGet {
				_, err := io.WriteString(w, payload)
				require.NoError(t, err)
			}
		case http.MethodDelete:
			w.WriteHeader(http.StatusNoContent)
		}
	})
	// Hide Seek to exercise actual streaming support in the SDK.
	reader := struct{ io.Reader }{strings.NewReader("hello")}
	info, err := store.Put(t.Context(), objectstore.PutInput{Key: "a space/日本語.txt", Body: reader, Size: 5, ContentType: "text/plain", CacheControl: "immutable", IfAbsent: true})
	require.NoError(t, err)
	require.Equal(t, `"opaque"`, info.ETag)
	body, info, err := store.Get(t.Context(), "a space/日本語.txt")
	require.NoError(t, err)
	content, err := io.ReadAll(body)
	require.NoError(t, err)
	require.NoError(t, body.Close())
	require.Equal(t, "hello", string(content))
	require.Equal(t, "value", info.Metadata["example"])
	info, err = store.Stat(t.Context(), "a space/日本語.txt")
	require.NoError(t, err)
	require.EqualValues(t, 5, info.Size)
	_, err = store.Stat(t.Context(), "missing")
	require.ErrorIs(t, err, objectstore.ErrNotFound)
	require.NoError(t, store.Delete(t.Context(), "a space/日本語.txt"))
}

func TestPresignedRequests(t *testing.T) {
	store := testStore(t, func(w http.ResponseWriter, r *http.Request) { t.Error("signing must not send an object request") })
	signed, err := store.PresignUpload(t.Context(), objectstore.Upload{Key: "file.json", ContentType: "application/json", IfAbsent: true}, 5*time.Minute)
	require.NoError(t, err)
	u, err := url.Parse(signed.URL)
	require.NoError(t, err)
	require.Equal(t, "300", u.Query().Get("X-Amz-Expires"))
	require.Contains(t, u.Query().Get("X-Amz-SignedHeaders"), "content-type")
	require.Contains(t, u.Query().Get("X-Amz-SignedHeaders"), "if-none-match")
	require.Equal(t, "application/json", signed.Headers.Get("Content-Type"))
	require.Equal(t, "*", signed.Headers.Get("If-None-Match"))
	require.Equal(t, http.MethodPut, signed.Method)
	require.WithinDuration(t, time.Now().Add(5*time.Minute), signed.ExpiresAt, time.Second)
	signed, err = store.PresignDownload(t.Context(), "file.json", time.Minute)
	require.NoError(t, err)
	require.Equal(t, http.MethodGet, signed.Method)
	for _, ttl := range []time.Duration{0, time.Millisecond, 2 * time.Hour} {
		t.Run(ttl.String(), func(t *testing.T) {
			_, err := store.PresignDownload(t.Context(), "file", ttl)
			require.ErrorIs(t, err, objectstore.ErrInvalidInput)
		})
	}
}

func TestProviderConfiguration(t *testing.T) {
	for _, tc := range []struct {
		name  string
		cfg   Config
		valid bool
	}{
		{"s3", Config{Provider: "s3", Bucket: "files", Region: "us-east-1", AccessKeyID: "key", SecretAccessKey: "secret"}, true},
		{"r2", Config{Provider: "r2", Bucket: "files", Endpoint: "https://account.r2.cloudflarestorage.com", AccessKeyID: "key", SecretAccessKey: "secret"}, true},
		{"r2 missing endpoint", Config{Provider: "r2", Bucket: "files"}, false},
		{"unknown", Config{Provider: "other", Bucket: "files"}, false},
		{"partial credentials", Config{Provider: "s3", Bucket: "files", AccessKeyID: "key"}, false},
		{"insecure endpoint", Config{Provider: "s3", Bucket: "files", Endpoint: "http://example.test"}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store, err := New(t.Context(), tc.cfg)
			if !tc.valid {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			if tc.cfg.Provider == "r2" {
				require.Equal(t, "auto", store.client.Options().Region)
			}
		})
	}
}

func TestConditionalErrorAndCancellation(t *testing.T) {
	store := testStore(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		w.WriteHeader(http.StatusPreconditionFailed)
		_, err := io.WriteString(w, `<Error><Code>PreconditionFailed</Code></Error>`)
		require.NoError(t, err)
	})
	_, err := store.Put(t.Context(), objectstore.PutInput{Key: "key", Body: strings.NewReader(""), ContentType: "text/plain", IfAbsent: true})
	require.ErrorIs(t, err, objectstore.ErrAlreadyExists)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	_, err = store.Stat(ctx, "key")
	require.ErrorIs(t, err, context.Canceled)
}
