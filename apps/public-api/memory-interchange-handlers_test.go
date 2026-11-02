package main

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

type fakeMemoryInterchangeStore struct {
	glossaryFormat string
	memoryErr      error
	memoryQuery    memoryExportQuery
	memoryImport   memoryImportInput
}

func (s *fakeMemoryInterchangeStore) exportMemoryEntries(_ context.Context, _ principal, _ string, query memoryExportQuery) (interchangeFile, error) {
	s.memoryQuery = query
	return interchangeFile{ContentType: "application/x-tmx+xml; charset=utf-8", Filename: "product.tmx", Body: []byte("<tmx/>")}, s.memoryErr
}

func (s *fakeMemoryInterchangeStore) importMemoryEntries(_ context.Context, _ principal, _ string, input memoryImportInput) (memoryImportResult, error) {
	s.memoryImport = input
	return memoryImportResult{Created: 1, Issues: []memoryImportIssue{}}, s.memoryErr
}

func (s *fakeMemoryInterchangeStore) exportGlossary(_ context.Context, _ principal, _ string, format string) (interchangeFile, error) {
	s.glossaryFormat = format
	return interchangeFile{ContentType: "application/xml; charset=utf-8", Filename: "terms.tbx", Body: []byte("<tbx/>")}, s.memoryErr
}

func TestGlossaryExportRoute(t *testing.T) {
	store := &fakeResourceStore{}
	w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/glossaries/gl-1/export", "")
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "tbx", store.glossaryFormat)
	require.Equal(t, "attachment; filename*=UTF-8''terms.tbx", w.Header().Get("Content-Disposition"))

	w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/glossaries/gl-1/export?format=XLSX", "")
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "xlsx", store.glossaryFormat)

	w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/glossaries/gl-1/export?format=tmx", "")
	require.Equal(t, http.StatusBadRequest, w.Code)

	store.memoryErr = errGlossaryNotNative
	w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/glossaries/gl-1/export", "")
	require.Equal(t, http.StatusConflict, w.Code)
	store.memoryErr = errGlossaryNotFound
	w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/glossaries/gl-1/export", "")
	require.Equal(t, http.StatusNotFound, w.Code)
}

var (
	memoryReadScopes  = effectivePermissions([]string{"memories:read"}, "member")
	memoryWriteScopes = effectivePermissions([]string{"memories:read", "memories:write"}, "localization_manager")
)

func TestMemoryScopes(t *testing.T) {
	require.Contains(t, memoryReadScopes, "translation-memories:read")
	require.NotContains(t, effectivePermissions([]string{"memories:write"}, "developer"), "translation-memories:write")
	require.Contains(t, memoryWriteScopes, "translation-memories:write")
}

func TestMemoryExportRoute(t *testing.T) {
	store := &fakeResourceStore{}
	w := sendResource(t, resourcePrincipal(memoryReadScopes...), store, http.MethodGet, "/v1/translation-memories/mem-1/export?sourceLocale=en_US&targetLocale=fr", "")
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, memoryExportQuery{Format: "tmx", SourceLocale: "en-US", TargetLocale: "fr"}, store.memoryQuery)
	require.Equal(t, "attachment; filename*=UTF-8''product.tmx", w.Header().Get("Content-Disposition"))
	require.Equal(t, "<tmx/>", w.Body.String())

	w = sendResource(t, resourcePrincipal(memoryReadScopes...), store, http.MethodGet, "/v1/translation-memories/mem-1/export?format=xlsx", "")
	require.Equal(t, http.StatusBadRequest, w.Code)

	store.memoryErr = errMemoryNotFound
	w = sendResource(t, resourcePrincipal(memoryReadScopes...), store, http.MethodGet, "/v1/translation-memories/mem-1/export", "")
	require.Equal(t, http.StatusNotFound, w.Code)
}

func TestMemoryImportRoute(t *testing.T) {
	t.Run("json body", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(memoryWriteScopes...), store, http.MethodPost, "/v1/translation-memories/mem-1/import", `{"format":"TMX","content":"<tmx/>","sourceFilename":"a.tmx"}`)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
		require.Equal(t, memoryImportInput{Format: "tmx", Content: "<tmx/>", SourceFilename: ptr("a.tmx")}, store.memoryImport)
	})

	t.Run("multipart file takes format from its name", func(t *testing.T) {
		store := &fakeResourceStore{}
		var buf bytes.Buffer
		form := multipart.NewWriter(&buf)
		part, err := form.CreateFormFile("file", "product.csv")
		require.NoError(t, err)
		_, _ = part.Write([]byte("source_locale,target_locale,source_text,target_text\nen,fr,Hi,Salut\n"))
		require.NoError(t, form.Close())
		h := newHandler(authFunc(func(context.Context, string) (principal, error) { return resourcePrincipal(memoryWriteScopes...), nil }), store)
		r := httptest.NewRequest(http.MethodPost, "/v1/translation-memories/mem-1/import", &buf)
		r.Header.Set("X-Api-Key", "hl_test")
		r.Header.Set("Content-Type", form.FormDataContentType())
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		require.Equal(t, "csv", store.memoryImport.Format)
		require.Equal(t, "product.csv", *store.memoryImport.SourceFilename)
	})

	t.Run("rejects invalid requests", func(t *testing.T) {
		for _, body := range []string{`{"format":"xliff","content":"x"}`, `{"format":"tmx","content":"  "}`} {
			w := sendResource(t, resourcePrincipal(memoryWriteScopes...), &fakeResourceStore{}, http.MethodPost, "/v1/translation-memories/mem-1/import", body)
			require.Equal(t, http.StatusBadRequest, w.Code, body)
		}
		w := sendResource(t, resourcePrincipal(memoryReadScopes...), &fakeResourceStore{}, http.MethodPost, "/v1/translation-memories/mem-1/import", `{"format":"tmx","content":"x"}`)
		require.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("maps store errors", func(t *testing.T) {
		for err, code := range map[error]string{errMemoryNotNative: "external_tms_memory_immutable", errMemoryArchived: "memory_action_archived"} {
			store := &fakeResourceStore{}
			store.memoryErr = err
			w := sendResource(t, resourcePrincipal(memoryWriteScopes...), store, http.MethodPost, "/v1/translation-memories/mem-1/import", `{"format":"tmx","content":"x"}`)
			require.Equal(t, http.StatusConflict, w.Code)
			require.Contains(t, w.Body.String(), code)
		}
	})
}
