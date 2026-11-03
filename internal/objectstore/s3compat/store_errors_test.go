package s3compat

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/aws/smithy-go"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/stretchr/testify/require"
)

func writeS3Error(t *testing.T, w http.ResponseWriter, status int, code string) {
	t.Helper()
	w.Header().Set("Content-Type", "application/xml")
	w.WriteHeader(status)
	_, err := io.WriteString(w, `<Error><Code>`+code+`</Code><Message>`+code+`</Message></Error>`)
	require.NoError(t, err)
}

func TestListFollowsContinuationTokens(t *testing.T) {
	var mu sync.Mutex
	var tokens []string
	store := testStore(t, func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "2", r.URL.Query().Get("list-type"))
		require.Equal(t, "jobs/", r.URL.Query().Get("prefix"))
		token := r.URL.Query().Get("continuation-token")
		mu.Lock()
		tokens = append(tokens, token)
		mu.Unlock()
		w.Header().Set("Content-Type", "application/xml")
		var body string
		switch token {
		case "":
			body = `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>page-2</NextContinuationToken><Contents><Key>jobs/a.json</Key></Contents><Contents><Key></Key></Contents></ListBucketResult>`
		case "page-2":
			body = `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>page-3</NextContinuationToken><Contents><Key>jobs/b.json</Key></Contents></ListBucketResult>`
		default:
			body = `<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>jobs/c.json</Key></Contents></ListBucketResult>`
		}
		_, err := io.WriteString(w, body)
		require.NoError(t, err)
	})
	keys, err := store.List(t.Context(), "jobs/")
	require.NoError(t, err)
	require.Equal(t, []string{"jobs/a.json", "jobs/b.json", "jobs/c.json"}, keys)
	require.Equal(t, []string{"", "page-2", "page-3"}, tokens)
}

func TestListStopsWhenTruncatedWithoutToken(t *testing.T) {
	calls := 0
	store := testStore(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/xml")
		_, err := io.WriteString(w, `<ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>jobs/a.json</Key></Contents></ListBucketResult>`)
		require.NoError(t, err)
	})
	keys, err := store.List(t.Context(), "jobs/")
	require.NoError(t, err)
	require.Equal(t, []string{"jobs/a.json"}, keys)
	require.Equal(t, 1, calls)
}

func TestListTranslatesErrors(t *testing.T) {
	store := testStore(t, func(w http.ResponseWriter, r *http.Request) {
		writeS3Error(t, w, http.StatusForbidden, "AccessDenied")
	})
	_, err := store.List(t.Context(), "jobs/")
	require.ErrorContains(t, err, "object storage operation")
	var apiErr smithy.APIError
	require.ErrorAs(t, err, &apiErr)
	require.Equal(t, "AccessDenied", apiErr.ErrorCode())
}

func TestGetAndDeleteErrorTranslation(t *testing.T) {
	store := testStore(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/files/missing":
			writeS3Error(t, w, http.StatusNotFound, "NoSuchKey")
		case "/files/conflict":
			writeS3Error(t, w, http.StatusConflict, "ConditionalRequestConflict")
		default:
			writeS3Error(t, w, http.StatusForbidden, "AccessDenied")
		}
	})
	_, _, err := store.Get(t.Context(), "missing")
	require.ErrorIs(t, err, objectstore.ErrNotFound)
	require.NoError(t, store.Delete(t.Context(), "missing"))

	_, err = store.Put(t.Context(), objectstore.PutInput{Key: "conflict", Body: strings.NewReader("x"), Size: 1, ContentType: "text/plain", IfMatch: `"stale"`})
	require.ErrorIs(t, err, objectstore.ErrAlreadyExists)

	_, _, err = store.Get(t.Context(), "forbidden")
	require.ErrorContains(t, err, "object storage operation")
	require.NotErrorIs(t, err, objectstore.ErrNotFound)
	err = store.Delete(t.Context(), "forbidden")
	require.ErrorContains(t, err, "object storage operation")
	_, err = store.Stat(t.Context(), "forbidden")
	require.ErrorContains(t, err, "object storage operation")
}

func TestOperationsValidateBeforeRequests(t *testing.T) {
	store := testStore(t, func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
	})
	for _, key := range []string{"", "a\nb"} {
		_, _, err := store.Get(t.Context(), key)
		require.ErrorIs(t, err, objectstore.ErrInvalidInput)
		_, err = store.Stat(t.Context(), key)
		require.ErrorIs(t, err, objectstore.ErrInvalidInput)
		_, err = store.List(t.Context(), key)
		require.ErrorIs(t, err, objectstore.ErrInvalidInput)
		require.ErrorIs(t, store.Delete(t.Context(), key), objectstore.ErrInvalidInput)
		_, err = store.PresignDownload(t.Context(), key, time.Minute)
		require.ErrorIs(t, err, objectstore.ErrInvalidInput)
		_, err = store.PresignUpload(t.Context(), objectstore.Upload{Key: key, ContentType: "text/plain"}, time.Minute)
		require.ErrorIs(t, err, objectstore.ErrInvalidInput)
	}
	_, err := store.Put(t.Context(), objectstore.PutInput{Key: "k", Body: strings.NewReader("x"), Size: 1})
	require.ErrorIs(t, err, objectstore.ErrInvalidInput)
	_, err = store.PresignUpload(t.Context(), objectstore.Upload{Key: "k", ContentType: " "}, time.Minute)
	require.ErrorIs(t, err, objectstore.ErrInvalidInput)
	_, err = store.PresignUpload(t.Context(), objectstore.Upload{Key: "k", ContentType: "text/plain"}, 2*time.Hour)
	require.ErrorIs(t, err, objectstore.ErrInvalidInput)
}

func TestPutSendsMetadataWithoutConditionalHeaders(t *testing.T) {
	store := testStore(t, func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPut, r.Method)
		require.Empty(t, r.Header.Get("If-None-Match"))
		require.Empty(t, r.Header.Get("If-Match"))
		require.Empty(t, r.Header.Get("Cache-Control"))
		require.Equal(t, "owner-1", r.Header.Get("X-Amz-Meta-Owner"))
		w.Header().Set("ETag", `"v1"`)
	})
	info, err := store.Put(t.Context(), objectstore.PutInput{Key: "k", Body: strings.NewReader("abc"), Size: 3, ContentType: "text/plain", IfMatch: "  ", Metadata: map[string]string{"owner": "owner-1"}})
	require.NoError(t, err)
	require.Equal(t, objectstore.Info{Size: 3, ContentType: "text/plain", ETag: `"v1"`, Metadata: map[string]string{"owner": "owner-1"}}, info)
}

func TestTranslateError(t *testing.T) {
	require.NoError(t, translateError(nil))
	plain := errors.New("dial tcp: refused")
	err := translateError(plain)
	require.ErrorIs(t, err, plain)
	require.EqualError(t, err, "object storage operation: dial tcp: refused")
	require.ErrorIs(t, translateError(&smithy.GenericAPIError{Code: "NotFound"}), objectstore.ErrNotFound)
	require.ErrorIs(t, translateError(&smithy.GenericAPIError{Code: "PreconditionFailed"}), objectstore.ErrAlreadyExists)
}

func TestNewRejectsUnsafeConfiguration(t *testing.T) {
	isolateAWSConfig(t)
	for _, tc := range []struct {
		name string
		cfg  Config
	}{
		{name: "missing bucket", cfg: Config{Provider: "s3", Region: "us-east-1"}},
		{name: "secret without key", cfg: Config{Provider: "s3", Bucket: "files", Region: "us-east-1", SecretAccessKey: "secret"}},
		{name: "endpoint with credentials", cfg: Config{Provider: "s3", Bucket: "files", Region: "us-east-1", Endpoint: "https://user:pass@s3.example.com"}},
		{name: "endpoint with query", cfg: Config{Provider: "s3", Bucket: "files", Region: "us-east-1", Endpoint: "https://s3.example.com?x=1"}},
		{name: "endpoint with fragment", cfg: Config{Provider: "s3", Bucket: "files", Region: "us-east-1", Endpoint: "https://s3.example.com#frag"}},
		{name: "endpoint without host", cfg: Config{Provider: "s3", Bucket: "files", Region: "us-east-1", Endpoint: "https://"}},
		{name: "unparseable endpoint", cfg: Config{Provider: "s3", Bucket: "files", Region: "us-east-1", Endpoint: "https://s3 example.com/%zz"}},
		{name: "r2 without keys", cfg: Config{Provider: "r2", Bucket: "files", Endpoint: "https://account.r2.cloudflarestorage.com"}},
		{name: "s3 without region", cfg: Config{Provider: "s3", Bucket: "files"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := New(t.Context(), tc.cfg)
			require.ErrorIs(t, err, objectstore.ErrInvalidInput)
		})
	}

	store, err := New(t.Context(), Config{Provider: "s3", Bucket: "files", Region: "eu-central-1", Endpoint: "https://s3.example.com", AccessKeyID: "key", SecretAccessKey: "secret", SessionToken: "token", UsePathStyle: true})
	require.NoError(t, err)
	require.Equal(t, "eu-central-1", store.client.Options().Region)
	require.True(t, store.client.Options().UsePathStyle)
	require.Equal(t, "https://s3.example.com", *store.client.Options().BaseEndpoint)
	credentials, err := store.client.Options().Credentials.Retrieve(t.Context())
	require.NoError(t, err)
	require.Equal(t, "token", credentials.SessionToken)
}
