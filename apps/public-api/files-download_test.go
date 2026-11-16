package main

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/vercelblob"
	"github.com/stretchr/testify/require"
)

type fakeFileStore struct {
	fileErr error
	fileID  string
}

func (s *fakeFileStore) openStoredFile(_ context.Context, _ principal, fileID string) (storedFileDownload, error) {
	s.fileID = fileID
	if s.fileErr != nil {
		return storedFileDownload{}, s.fileErr
	}
	return storedFileDownload{
		Filename: "fr résumé.json", ContentType: "application/json", Size: 9,
		Body: io.NopCloser(strings.NewReader(`{"a":"b"}`)),
	}, nil
}

func TestFileDownloadRoute(t *testing.T) {
	readScopes := effectivePermissions([]string{"files:read"}, "member")

	t.Run("streams the file as an attachment", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/files/file-1/download", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "file-1", store.fileID)
		require.Equal(t, `{"a":"b"}`, w.Body.String())
		require.Equal(t, "application/json", w.Header().Get("Content-Type"))
		require.Equal(t, "attachment; filename*=UTF-8''fr%20r%C3%A9sum%C3%A9.json", w.Header().Get("Content-Disposition"))
		require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
		require.Equal(t, "nosniff", w.Header().Get("X-Content-Type-Options"))
		require.Equal(t, "9", w.Header().Get("Content-Length"))
	})

	t.Run("needs files:read", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(jobReadScopes...), &fakeResourceStore{}, http.MethodGet, "/v1/files/file-1/download", "")
		require.Equal(t, http.StatusForbidden, w.Code)
	})

	for _, tc := range []struct {
		err    error
		status int
		code   string
	}{
		{errStoredFileNotFound, http.StatusNotFound, "file_not_found"},
		{errFileStorageUnavailable, http.StatusServiceUnavailable, "file_storage_unavailable"},
	} {
		t.Run("maps "+tc.code, func(t *testing.T) {
			store := &fakeResourceStore{}
			store.fileErr = tc.err
			w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/files/file-1/download", "")
			require.Equal(t, tc.status, w.Code)
			require.Contains(t, w.Body.String(), `"error":"`+tc.code+`"`)
		})
	}
}

// blobServer serves stored objects at /blob/{pathname} the way a Vercel Blob store host does.
func blobServer(t *testing.T, objects map[string]string) *vercelblob.Store {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer vercel_blob_rw_store1_secret", r.Header.Get("authorization"))
		body, ok := objects[strings.TrimPrefix(r.URL.Path, "/blob/")]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)
	store, err := vercelblob.New(vercelblob.Config{
		Token: "vercel_blob_rw_store1_secret", APIURL: server.URL + "/api", BlobBaseURL: server.URL + "/blob", HTTPClient: server.Client(),
	})
	require.NoError(t, err)
	return store
}

func TestStoredFileDownloadDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	insertFile := func(t *testing.T, projectID, createdBy *string, key string) string {
		id := "file_" + uuid.NewString()
		f.exec(t, `INSERT INTO stored_files (id, organization_id, project_id, created_by_user_id, role, source_kind,
				storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256)
			VALUES ($1, $2, $3, $4, 'output', 'job_output', 'vercel_blob', $5, 'https://blob.test/' || $5,
				'fr.json', 'application/octet-stream', 9, 'abc')`,
			id, f.actor.OrganizationID, projectID, createdBy, key)
		return id
	}
	prefix := f.actor.OrganizationID + "/"
	projectFile := insertFile(t, &f.project, nil, prefix+"fr.json")
	missingBlob := insertFile(t, &f.project, nil, prefix+"gone.json")

	t.Run("without Vercel Blob configured", func(t *testing.T) {
		_, err := f.store.openStoredFile(ctx, f.actor, projectFile)
		require.ErrorIs(t, err, errFileStorageUnavailable)
	})

	f.store.fileStores = map[string]objectstore.Store{
		storageProviderVercelBlob: blobServer(t, map[string]string{prefix + "fr.json": `{"a":"b"}`, prefix + "loose.json": `{}`}),
	}

	t.Run("reads a project file from Vercel Blob", func(t *testing.T) {
		file, err := f.store.openStoredFile(ctx, f.actor, projectFile)
		require.NoError(t, err)
		body, err := io.ReadAll(file.Body)
		require.NoError(t, file.Body.Close())
		require.NoError(t, err)
		require.Equal(t, `{"a":"b"}`, string(body))
		require.Equal(t, "fr.json", file.Filename)
		require.Equal(t, "application/json", file.ContentType)
	})

	t.Run("missing files and blobs", func(t *testing.T) {
		_, err := f.store.openStoredFile(ctx, f.actor, "file_missing")
		require.ErrorIs(t, err, errStoredFileNotFound)
		_, err = f.store.openStoredFile(ctx, f.actor, missingBlob)
		require.ErrorIs(t, err, errStoredFileNotFound)
	})

	t.Run("access follows project access and the uploader", func(t *testing.T) {
		outsider := principal{UserID: uuid.NewString(), OrganizationID: f.actor.OrganizationID, Role: "translator"}
		_, err := f.store.openStoredFile(ctx, outsider, projectFile)
		require.ErrorIs(t, err, errStoredFileNotFound)

		someoneElse := uuid.NewString()
		f.exec(t, `INSERT INTO users (id, workos_user_id, email) VALUES ($1, $2, $3)`, someoneElse, "user_"+someoneElse, someoneElse+"@example.com")
		t.Cleanup(func() { _, _ = f.pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, someoneElse) })
		loose := insertFile(t, nil, &someoneElse, prefix+"loose.json")
		translator := f.actor
		translator.Role = "translator"
		_, err = f.store.openStoredFile(ctx, translator, loose)
		require.ErrorIs(t, err, errStoredFileNotFound)
		file, err := f.store.openStoredFile(ctx, f.actor, loose)
		require.NoError(t, err)
		require.NoError(t, file.Body.Close())
	})
}
