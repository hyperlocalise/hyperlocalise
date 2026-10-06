package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func postTranslationFileRender(t *testing.T, mux *http.ServeMux, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	encoded, err := json.Marshal(body)
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPost, "/internal/translation-files/render", strings.NewReader(string(encoded)))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set(serverCallTokenHeader, token)
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func newTranslationFileRenderMux(t *testing.T) (*http.ServeMux, string) {
	t.Helper()
	t.Setenv("WORKOS_COOKIE_PASSWORD", strings.Repeat("a", 32))
	mux := http.NewServeMux()
	registerRoutes(mux, newHandler(), stubSessionVerifier{claims: AuthClaims{UserID: "user_123"}})
	return mux, serverCallToken()
}

func TestRenderTranslationFileWritesTheSourceFormat(t *testing.T) {
	mux, token := newTranslationFileRenderMux(t)

	rec := postTranslationFileRender(t, mux, token, translationFileRenderRequest{
		SourcePath:   "messages.csv",
		SourceLocale: "en-US",
		TargetLocale: "de-DE",
		Source:       []byte("key,value\ngreeting,\"Hello, world!\"\nfarewell,Goodbye\n"),
		Values:       map[string]string{"greeting": "Hallo, Welt!"},
	})

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "application/octet-stream", rec.Header().Get("Content-Type"))
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	require.Equal(t, "key,value\ngreeting,\"Hallo, Welt!\"\nfarewell,Goodbye\n", rec.Body.String())
}

func TestRenderTranslationFileJoinsSegmentedTranslations(t *testing.T) {
	mux, token := newTranslationFileRenderMux(t)

	rec := postTranslationFileRender(t, mux, token, translationFileRenderRequest{
		SourcePath:   "messages.csv",
		SourceLocale: "en-US",
		TargetLocale: "de-DE",
		Source:       []byte("key,value\nintro,Hello. World.\noutro,Bye. See you.\n"),
		Values: map[string]string{
			"intro#srx.0": "Hallo.",
			"intro#srx.1": "Welt.",
			"outro#srx.0": "Tschüss.",
		},
		SourceSpans: map[string]string{
			"intro#srx.0": "Hello.",
			"intro#srx.1": " World.",
			"outro#srx.0": "Bye.",
			"outro#srx.1": " See you.",
		},
	})

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "key,value\nintro,Hallo. Welt.\noutro,Bye. See you.\n", rec.Body.String())
}

func TestRenderTranslationFileRequiresTheServerCallToken(t *testing.T) {
	mux, _ := newTranslationFileRenderMux(t)
	body := translationFileRenderRequest{SourcePath: "messages.csv", TargetLocale: "de-DE", Source: []byte("key,value\n")}

	require.Equal(t, http.StatusUnauthorized, postTranslationFileRender(t, mux, "", body).Code)
	require.Equal(t, http.StatusUnauthorized, postTranslationFileRender(t, mux, "wrong", body).Code)
}

func TestRenderTranslationFileIsClosedWithoutAServerSecret(t *testing.T) {
	mux, token := newTranslationFileRenderMux(t)
	t.Setenv("WORKOS_COOKIE_PASSWORD", "")

	rec := postTranslationFileRender(t, mux, token, translationFileRenderRequest{
		SourcePath: "messages.csv", TargetLocale: "de-DE", Source: []byte("key,value\n"),
	})

	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestRenderTranslationFileRejectsBadRequests(t *testing.T) {
	mux, token := newTranslationFileRenderMux(t)

	tests := []struct {
		name string
		body any
		code int
	}{
		{
			name: "file type with no writer",
			body: translationFileRenderRequest{SourcePath: "notes.txt", TargetLocale: "de-DE", Source: []byte("Hello")},
			code: http.StatusBadRequest,
		},
		{
			name: "missing source path",
			body: translationFileRenderRequest{TargetLocale: "de-DE", Source: []byte("key,value\n")},
			code: http.StatusBadRequest,
		},
		{
			name: "missing target locale",
			body: translationFileRenderRequest{SourcePath: "messages.csv", Source: []byte("key,value\n")},
			code: http.StatusBadRequest,
		},
		{
			name: "unknown field",
			body: map[string]any{"sourcePath": "messages.csv", "targetLocale": "de-DE", "extra": true},
			code: http.StatusBadRequest,
		},
		{
			name: "source that is not its file type",
			body: translationFileRenderRequest{SourcePath: "messages.xlf", TargetLocale: "de-DE", Source: []byte("not xml <")},
			code: http.StatusUnprocessableEntity,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := postTranslationFileRender(t, mux, token, tc.body)
			require.Equal(t, tc.code, rec.Code, rec.Body.String())
			require.NotContains(t, rec.Body.String(), "not xml")
		})
	}
}
