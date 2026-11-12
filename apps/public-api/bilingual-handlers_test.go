package main

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	editor_export "github.com/hyperlocalise/hyperlocalise/internal/i18n/editor-export"
	"github.com/stretchr/testify/require"
)

type fakeBilingualStore struct {
	bilingualErr    error
	bilingualRows   []editor_export.Row
	bilingualQuery  bilingualExportQuery
	bilingualImport bilingualImportInput
	bilingualCounts bilingualImportCounts
}

func (s *fakeBilingualStore) exportBilingualRows(_ context.Context, _ principal, _ string, query bilingualExportQuery) ([]editor_export.Row, error) {
	s.bilingualQuery = query
	return s.bilingualRows, s.bilingualErr
}

func (s *fakeBilingualStore) importBilingualRows(_ context.Context, _ principal, _ string, input bilingualImportInput) (bilingualImportCounts, error) {
	s.bilingualImport = input
	return s.bilingualCounts, s.bilingualErr
}

func sendBilingualForm(t *testing.T, p principal, store resourceStore, fields map[string]string, filename string, body []byte) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	form := multipart.NewWriter(&buf)
	for name, value := range fields {
		require.NoError(t, form.WriteField(name, value))
	}
	if filename != "" {
		part, err := form.CreateFormFile("file", filename)
		require.NoError(t, err)
		_, err = part.Write(body)
		require.NoError(t, err)
	}
	require.NoError(t, form.Close())
	h := newHandler(authFunc(func(context.Context, string) (principal, error) { return p, nil }), store)
	r := httptest.NewRequest(http.MethodPost, "/v1/projects/project-1/bilingual-file", &buf)
	r.Header.Set("X-Api-Key", "hl_test")
	r.Header.Set("Content-Type", form.FormDataContentType())
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestBilingualExportRoute(t *testing.T) {
	t.Run("exports xliff by default", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.bilingualRows = []editor_export.Row{{Key: "home.title", SourceText: "Home", TargetText: "Accueil", SourceLocale: "en", TargetLocale: "fr", SourcePath: "en.json"}}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/bilingual-file?locale=fr&filePath=en.json", "")
		require.Equal(t, http.StatusOK, w.Code)
		require.Equal(t, bilingualExportQuery{Locale: "fr", FilePath: ptr("en.json")}, store.bilingualQuery)
		require.Contains(t, w.Header().Get("Content-Type"), "xliff")
		require.Equal(t, "attachment; filename*=UTF-8''en-fr.xliff", w.Header().Get("Content-Disposition"))
		require.Contains(t, w.Body.String(), "Accueil")
	})

	t.Run("whole project export and csv", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.bilingualRows = []editor_export.Row{{Key: "a", SourceText: "A", TargetLocale: "fr"}}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/bilingual-file?locale=fr&format=csv&includeHidden=true", "")
		require.Equal(t, http.StatusOK, w.Code)
		require.Equal(t, bilingualExportQuery{Locale: "fr", IncludeHidden: true}, store.bilingualQuery)
		require.Equal(t, "attachment; filename*=UTF-8''all-files-fr.csv", w.Header().Get("Content-Disposition"))
	})

	t.Run("rejects invalid queries", func(t *testing.T) {
		store := &fakeResourceStore{}
		for _, target := range []string{
			"/v1/projects/project-1/bilingual-file",
			"/v1/projects/project-1/bilingual-file?locale=fr&format=docx",
			"/v1/projects/project-1/bilingual-file?locale=fr&includeHidden=yes",
		} {
			w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, target, "")
			require.Equal(t, http.StatusBadRequest, w.Code, target)
		}
	})

	t.Run("maps store errors and empty exports", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/bilingual-file?locale=fr", "")
		require.Equal(t, http.StatusNotFound, w.Code)
		require.Contains(t, w.Body.String(), "no_strings")

		store.bilingualErr = errTooManyBilingualRows
		w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/bilingual-file?locale=fr", "")
		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Contains(t, w.Body.String(), "too_many_bilingual_rows")

		store.bilingualErr = errLocaleNotInProject
		w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/bilingual-file?locale=xx", "")
		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Contains(t, w.Body.String(), "invalid_locale")
	})
}

func TestBilingualImportRoute(t *testing.T) {
	csv := editor_export.SerializeCSV([]editor_export.Row{{Key: "home.title", SourceText: "Home", TargetText: "Accueil", SourceLocale: "en", TargetLocale: "fr", SourcePath: "en.json"}})

	t.Run("imports a file", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.bilingualCounts = bilingualImportCounts{Matched: 1, Imported: 1, Files: 1}
		w := sendBilingualForm(t, resourcePrincipal(approveScopes...), store, map[string]string{"locale": "fr", "filePath": "en.json"}, "fixed.csv", csv)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.JSONEq(t, `{"import":{"matched":1,"imported":1,"skipped":0,"files":1}}`, w.Body.String())
		require.Equal(t, "fr", store.bilingualImport.Locale)
		require.Equal(t, ptr("en.json"), store.bilingualImport.FilePath)
		require.Len(t, store.bilingualImport.Rows, 1)
		require.Equal(t, "Accueil", store.bilingualImport.Rows[0].TargetText)
	})

	t.Run("format field overrides the file name", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendBilingualForm(t, resourcePrincipal(approveScopes...), store, map[string]string{"locale": "fr", "format": "csv"}, "upload.bin", csv)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Nil(t, store.bilingualImport.FilePath)
	})

	t.Run("requires translations:approve", func(t *testing.T) {
		w := sendBilingualForm(t, resourcePrincipal(readScopes...), &fakeResourceStore{}, map[string]string{"locale": "fr"}, "fixed.csv", csv)
		require.Equal(t, http.StatusForbidden, w.Code)
		for _, role := range []string{"developer", "translator"} {
			scopes := effectivePermissions([]string{"files:read", "files:write"}, role)
			w := sendBilingualForm(t, resourcePrincipal(scopes...), &fakeResourceStore{}, map[string]string{"locale": "fr"}, "fixed.csv", csv)
			require.Equal(t, http.StatusForbidden, w.Code, role)
		}
	})

	t.Run("rejects bad forms", func(t *testing.T) {
		cases := []struct {
			fields   map[string]string
			filename string
			body     []byte
			code     string
		}{
			{map[string]string{}, "fixed.csv", csv, "invalid_body"},
			{map[string]string{"locale": "fr"}, "", nil, "invalid_body"},
			{map[string]string{"locale": "fr"}, "fixed.docx", csv, "unsupported_bilingual_format"},
			{map[string]string{"locale": "fr", "extra": "x"}, "fixed.csv", csv, "invalid_body"},
			{map[string]string{"locale": "fr"}, "fixed.tmx", []byte("<not-tmx"), "invalid_bilingual_file"},
		}
		for _, tc := range cases {
			w := sendBilingualForm(t, resourcePrincipal(approveScopes...), &fakeResourceStore{}, tc.fields, tc.filename, tc.body)
			require.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())
			require.Contains(t, w.Body.String(), tc.code)
		}
	})

	t.Run("rejects json bodies", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(approveScopes...), &fakeResourceStore{}, http.MethodPost, "/v1/projects/project-1/bilingual-file", `{}`)
		require.Equal(t, http.StatusUnsupportedMediaType, w.Code)
	})

	t.Run("maps store errors", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.bilingualErr = errProjectNotNative
		w := sendBilingualForm(t, resourcePrincipal(approveScopes...), store, map[string]string{"locale": "fr"}, "fixed.csv", csv)
		require.Equal(t, http.StatusConflict, w.Code)
		require.Contains(t, w.Body.String(), "project_not_native")
	})
}

func TestGroupBilingualImportRows(t *testing.T) {
	rows := []editor_export.Row{
		{Key: " a ", TargetText: "A1", TargetLocale: "FR", SourcePath: "en.json"},
		{Key: "b", TargetText: "  ", SourcePath: "en.json"},
		{Key: "", TargetText: "x"},
		{Key: "c", TargetText: "C", TargetLocale: "de"},
		{Key: "d", TargetText: "D"},
		{Key: "e", TargetText: "E", SourcePath: "other.json"},
		{Key: "a", TargetText: "A2", SourcePath: "en.json"},
	}

	entries, skipped := groupBilingualImportRows(rows, "fr", ptr("en.json"))
	require.Equal(t, []bilingualEntry{{Path: "en.json", Key: "a", Text: "A2"}, {Path: "en.json", Key: "d", Text: "D"}}, entries)
	require.Equal(t, 5, skipped)
	require.Equal(t, 1, countBilingualFiles(entries))

	entries, skipped = groupBilingualImportRows(rows, "fr", nil)
	require.Equal(t, []bilingualEntry{
		{Path: "en.json", Key: "a", Text: "A2"},
		{Path: "", Key: "d", Text: "D"},
		{Path: "other.json", Key: "e", Text: "E"},
	}, entries)
	require.Equal(t, 4, skipped)
	require.Equal(t, 3, countBilingualFiles(entries))
}

func FuzzGroupBilingualImportRows(f *testing.F) {
	f.Add("a", "A", "fr", "en.json", "fr", true)
	f.Add("", "x", "", "", "de", false)
	f.Fuzz(func(t *testing.T, key, text, rowLocale, path, locale string, scoped bool) {
		var filePath *string
		if scoped {
			filePath = &path
		}
		rows := []editor_export.Row{{Key: key, TargetText: text, TargetLocale: rowLocale, SourcePath: path}}
		entries, skipped := groupBilingualImportRows(rows, locale, filePath)
		require.Equal(t, 1, len(entries)+skipped)
		for _, entry := range entries {
			require.NotEmpty(t, strings.TrimSpace(entry.Key))
			require.NotEmpty(t, strings.TrimSpace(entry.Text))
			if filePath != nil {
				require.Equal(t, *filePath, entry.Path)
			}
		}
	})
}

func ptr[T any](value T) *T { return &value }
