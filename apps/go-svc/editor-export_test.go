package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func postEditorFilteredExport(mux *http.ServeMux, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/v1/editor-export/filtered/serialize", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "sealed-session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestSerializeEditorFilteredExportAllFormats(t *testing.T) {
	h := newHandler()
	mux := http.NewServeMux()
	registerRoutes(mux, h, stubSessionVerifier{claims: AuthClaims{UserID: "user_123"}})

	row := map[string]string{
		"key":          `greet,"user"`,
		"sourceText":   "Hello\nworld",
		"targetText":   "Bonjour",
		"sourceLocale": "en",
		"targetLocale": "fr",
		"sourcePath":   "locales/en.json",
	}

	tests := []struct {
		format       string
		extension    string
		contentType  string
		bodyContains []string
	}{
		{
			format:       "csv",
			extension:    "csv",
			contentType:  "text/csv",
			bodyContains: []string{"greet,\"\"user\"\"", "Hello\nworld"},
		},
		{
			format:       "tmx",
			extension:    "tmx",
			contentType:  "application/x-tmx+xml",
			bodyContains: []string{"<tmx version=\"1.4\">", "Bonjour"},
		},
		{
			format:       "xlf",
			extension:    "xlf",
			contentType:  "application/x-xliff+xml",
			bodyContains: []string{"<xliff version=\"1.2\"", "Bonjour"},
		},
		{
			format:       "xliff",
			extension:    "xliff",
			contentType:  "application/xliff+xml",
			bodyContains: []string{"<xliff version=\"1.2\"", "Bonjour"},
		},
		{
			format:       "xlsx",
			extension:    "xlsx",
			contentType:  "spreadsheetml.sheet",
			bodyContains: nil,
		},
	}

	for _, tc := range tests {
		payload, err := json.Marshal(map[string]any{
			"format": tc.format,
			"rows":   []map[string]string{row},
		})
		require.NoError(t, err)

		rec := postEditorFilteredExport(mux, string(payload))

		require.Equal(t, http.StatusOK, rec.Code, tc.format)
		require.Equal(t, tc.extension, rec.Header().Get("X-Export-Extension"), tc.format)
		require.Contains(t, rec.Header().Get("Content-Type"), tc.contentType, tc.format)
		if tc.format == "xlsx" {
			require.NotEmpty(t, rec.Body.Bytes())
			require.Equal(t, byte('P'), rec.Body.Bytes()[0])
			continue
		}
		body := rec.Body.String()
		for _, fragment := range tc.bodyContains {
			require.Contains(t, body, fragment, tc.format)
		}
	}
}

func TestSerializeEditorFilteredExportValidation(t *testing.T) {
	h := newHandler()
	mux := http.NewServeMux()
	registerRoutes(mux, h, stubSessionVerifier{claims: AuthClaims{UserID: "user_123"}})

	require.Equal(t, http.StatusBadRequest, postEditorFilteredExport(mux, `{"format":"docx","rows":[]}`).Code)
	require.Equal(t, http.StatusBadRequest, postEditorFilteredExport(mux, `{"format":"csv","rows":[]}`).Code)

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/editor-export/filtered/serialize",
		strings.NewReader(`{"format":"csv","rows":[{"key":"k","sourceText":"a","targetText":"b","sourceLocale":"en","targetLocale":"de"}]}`),
	)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}
