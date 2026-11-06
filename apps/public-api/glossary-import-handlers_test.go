package main

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

var (
	glossaryReadScopes   = effectivePermissions([]string{"files:read"}, "member")
	glossaryWriteScopes  = effectivePermissions([]string{"files:read", "files:write"}, "localization_manager")
	developerWriteScopes = effectivePermissions([]string{"files:read", "files:write"}, "developer")
)

func sendGlossaryImport(t *testing.T, p principal, store resourceStore, fields map[string]string, files []struct {
	filename string
	body     []byte
},
) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	form := multipart.NewWriter(&buf)
	for name, value := range fields {
		require.NoError(t, form.WriteField(name, value))
	}
	for _, file := range files {
		part, err := form.CreateFormFile("file", file.filename)
		require.NoError(t, err)
		_, err = part.Write(file.body)
		require.NoError(t, err)
	}
	require.NoError(t, form.Close())
	h := newHandler(authFunc(func(context.Context, string) (principal, error) { return p, nil }), store)
	r := httptest.NewRequest(http.MethodPost, "/v1/glossaries/gl-1/import", &buf)
	r.Header.Set("X-Api-Key", "hl_test")
	r.Header.Set("Content-Type", form.FormDataContentType())
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestGlossaryImportRoute(t *testing.T) {
	t.Run("queues a TBX file as merge by default", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendGlossaryImport(t, resourcePrincipal(glossaryWriteScopes...), store, nil, []struct {
			filename string
			body     []byte
		}{{filename: "terms.tbx", body: []byte("<tbx/>")}})
		require.Equal(t, http.StatusAccepted, w.Code, w.Body.String())
		require.Equal(t, "gl-1", store.importGlossaryID)
		require.Equal(t, "tbx", store.importInput.Format)
		require.Equal(t, "merge", store.importInput.Mode)
		require.Equal(t, "terms.tbx", *store.importInput.SourceFilename)
		require.Contains(t, w.Body.String(), `"status":"queued"`)
	})

	t.Run("takes format and mode from the form", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendGlossaryImport(t, resourcePrincipal(glossaryWriteScopes...), store, map[string]string{
			"format":       "CSV",
			"mode":         "replace",
			"strictLocale": "true",
		}, []struct {
			filename string
			body     []byte
		}{{filename: "terms.bin", body: []byte("term,locale\nHello,en\n")}})
		require.Equal(t, http.StatusAccepted, w.Code, w.Body.String())
		require.Equal(t, "csv", store.importInput.Format)
		require.Equal(t, "replace", store.importInput.Mode)
		require.NotNil(t, store.importInput.StrictLocale)
		require.True(t, *store.importInput.StrictLocale)
	})

	t.Run("rejects a developer token without glossaries:write", func(t *testing.T) {
		w := sendGlossaryImport(t, resourcePrincipal(developerWriteScopes...), &fakeResourceStore{}, nil, []struct {
			filename string
			body     []byte
		}{{filename: "terms.tbx", body: []byte("<tbx/>")}})
		require.Equal(t, http.StatusForbidden, w.Code)
		require.Contains(t, w.Body.String(), "glossaries:write")
	})

	t.Run("rejects invalid requests", func(t *testing.T) {
		tests := []struct {
			name   string
			fields map[string]string
			files  []struct {
				filename string
				body     []byte
			}
			code int
			err  string
		}{
			{
				name:  "missing file",
				files: nil,
				code:  http.StatusBadRequest,
				err:   "invalid_body",
			},
			{
				name: "empty file",
				files: []struct {
					filename string
					body     []byte
				}{{filename: "terms.tbx", body: []byte{}}},
				code: http.StatusBadRequest,
				err:  "invalid_body",
			},
			{
				name: "unknown format",
				files: []struct {
					filename string
					body     []byte
				}{{filename: "terms.txt", body: []byte("hello")}},
				code: http.StatusBadRequest,
				err:  "unsupported_glossary_format",
			},
			{
				name:   "unknown mode",
				fields: map[string]string{"mode": "upsert"},
				files: []struct {
					filename string
					body     []byte
				}{{filename: "terms.tbx", body: []byte("<tbx/>")}},
				code: http.StatusBadRequest,
				err:  "invalid_body",
			},
			{
				name:   "unknown field",
				fields: map[string]string{"dryRun": "true"},
				files: []struct {
					filename string
					body     []byte
				}{{filename: "terms.tbx", body: []byte("<tbx/>")}},
				code: http.StatusBadRequest,
				err:  "invalid_body",
			},
			{
				name:   "strictLocale is not a boolean",
				fields: map[string]string{"strictLocale": "yes"},
				files: []struct {
					filename string
					body     []byte
				}{{filename: "terms.tbx", body: []byte("<tbx/>")}},
				code: http.StatusBadRequest,
				err:  "invalid_body",
			},
			{
				name: "two files",
				files: []struct {
					filename string
					body     []byte
				}{
					{filename: "a.tbx", body: []byte("<tbx/>")},
					{filename: "b.tbx", body: []byte("<tbx/>")},
				},
				code: http.StatusBadRequest,
				err:  "invalid_body",
			},
			{
				name: "file over 25 MB",
				files: []struct {
					filename string
					body     []byte
				}{{filename: "terms.csv", body: bytes.Repeat([]byte("a"), maxGlossaryImportBytes+1)}},
				code: http.StatusRequestEntityTooLarge,
				err:  "body_too_large",
			},
		}
		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				w := sendGlossaryImport(t, resourcePrincipal(glossaryWriteScopes...), &fakeResourceStore{}, tc.fields, tc.files)
				require.Equal(t, tc.code, w.Code, w.Body.String())
				require.Contains(t, w.Body.String(), tc.err)
			})
		}
	})

	t.Run("rejects a JSON body", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(glossaryWriteScopes...), &fakeResourceStore{}, http.MethodPost, "/v1/glossaries/gl-1/import", `{"format":"tbx"}`)
		require.Equal(t, http.StatusUnsupportedMediaType, w.Code)
		require.Contains(t, w.Body.String(), "unsupported_media_type")
	})

	t.Run("maps store errors", func(t *testing.T) {
		for err, want := range map[error]struct {
			code int
			body string
		}{
			errGlossaryNotNative:         {http.StatusConflict, "glossary_import_unsupported"},
			errGlossaryWriteForbidden:    {http.StatusForbidden, "forbidden"},
			errGlossaryImportUnavailable: {http.StatusServiceUnavailable, "glossary_import_unavailable"},
		} {
			store := &fakeResourceStore{}
			store.importErr = err
			w := sendGlossaryImport(t, resourcePrincipal(glossaryWriteScopes...), store, nil, []struct {
				filename string
				body     []byte
			}{{filename: "terms.tbx", body: []byte("<tbx/>")}})
			require.Equal(t, want.code, w.Code, w.Body.String())
			require.Contains(t, w.Body.String(), want.body)
		}
	})
}

func TestGlossaryImportReportRoute(t *testing.T) {
	t.Run("returns a queued import", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.report = glossaryImportReport{
			ID:         "run-1",
			GlossaryID: "gl-1",
			Format:     "tbx",
			Mode:       "merge",
			Status:     "queued",
			Counts:     map[string]int{},
			CreatedAt:  time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC),
		}
		w := sendResource(t, resourcePrincipal(glossaryReadScopes...), store, http.MethodGet, "/v1/glossaries/gl-1/import-reports/run-1", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "gl-1", store.reportGlossaryID)
		require.Equal(t, "run-1", store.reportID)
		require.Contains(t, w.Body.String(), `"id":"run-1"`)
	})

	t.Run("maps a missing report", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.reportErr = errGlossaryImportNotFound
		w := sendResource(t, resourcePrincipal(glossaryReadScopes...), store, http.MethodGet, "/v1/glossaries/gl-1/import-reports/missing", "")
		require.Equal(t, http.StatusNotFound, w.Code)
		require.Contains(t, w.Body.String(), "glossary_import_not_found")
	})

	t.Run("rejects a write-only token", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(effectivePermissions([]string{"files:write"}, "localization_manager")...), &fakeResourceStore{}, http.MethodGet, "/v1/glossaries/gl-1/import-reports/run-1", "")
		require.Equal(t, http.StatusForbidden, w.Code)
		require.Contains(t, w.Body.String(), "glossaries:read")
	})
}
