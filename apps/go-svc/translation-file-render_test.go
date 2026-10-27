package main

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

type translationFileRenderParts struct {
	source  []byte
	request any
	// skipSource and skipRequest leave that part out of the form.
	skipSource  bool
	skipRequest bool
}

func postTranslationFileRender(t *testing.T, mux *http.ServeMux, token string, parts translationFileRenderParts) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	if !parts.skipRequest {
		encoded, err := json.Marshal(parts.request)
		require.NoError(t, err)
		require.NoError(t, form.WriteField(translationFileRenderRequestFormName, string(encoded)))
	}
	if !parts.skipSource {
		file, err := form.CreateFormFile(translationFileRenderSourceFormName, "source")
		require.NoError(t, err)
		_, err = file.Write(parts.source)
		require.NoError(t, err)
	}
	require.NoError(t, form.Close())

	req := httptest.NewRequest(http.MethodPost, "/internal/translation-files/render", &body)
	req.Header.Set("Content-Type", form.FormDataContentType())
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

	rec := postTranslationFileRender(t, mux, token, translationFileRenderParts{
		source: []byte("key,value\ngreeting,\"Hello, world!\"\nfarewell,Goodbye\n"),
		request: translationFileRenderRequest{
			SourcePath:   "messages.csv",
			SourceLocale: "en-US",
			TargetLocale: "de-DE",
			Values:       map[string]string{"greeting": "Hallo, Welt!"},
		},
	})

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "application/octet-stream", rec.Header().Get("Content-Type"))
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	require.Equal(t, "nosniff", rec.Header().Get("X-Content-Type-Options"))
	require.Equal(t, "key,value\ngreeting,\"Hallo, Welt!\"\nfarewell,Goodbye\n", rec.Body.String())
}

func TestRenderTranslationFileJoinsSegmentedTranslations(t *testing.T) {
	mux, token := newTranslationFileRenderMux(t)

	rec := postTranslationFileRender(t, mux, token, translationFileRenderParts{
		source: []byte("key,value\nintro,Hello. World.\noutro,Bye. See you.\n"),
		request: translationFileRenderRequest{
			SourcePath:   "messages.csv",
			SourceLocale: "en-US",
			TargetLocale: "de-DE",
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
		},
	})

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "key,value\nintro,Hallo. Welt.\noutro,Bye. See you.\n", rec.Body.String())
}

func TestRenderTranslationFileIgnoresFieldsItDoesNotKnow(t *testing.T) {
	mux, token := newTranslationFileRenderMux(t)

	rec := postTranslationFileRender(t, mux, token, translationFileRenderParts{
		source: []byte("key,value\ngreeting,Hello\n"),
		request: map[string]any{
			"sourcePath":   "messages.csv",
			"targetLocale": "de-DE",
			"values":       map[string]string{"greeting": "Hallo"},
			"addedLater":   true,
		},
	})

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "key,value\ngreeting,Hallo\n", rec.Body.String())
}

func TestRenderTranslationFileAcceptsASourceAtTheUploadLimit(t *testing.T) {
	mux, token := newTranslationFileRenderMux(t)
	source := append([]byte("key,value\ngreeting,Hello\n"), bytes.Repeat([]byte("#"), maxTranslationFileRenderSourceBytes-26)...)
	source = append(source, '\n')

	rec := postTranslationFileRender(t, mux, token, translationFileRenderParts{
		source: source,
		request: translationFileRenderRequest{
			SourcePath:   "messages.csv",
			TargetLocale: "de-DE",
			Values:       map[string]string{"greeting": "Hallo"},
		},
	})

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
}

func TestRenderTranslationFileRejectsASourceOverTheUploadLimit(t *testing.T) {
	mux, token := newTranslationFileRenderMux(t)

	rec := postTranslationFileRender(t, mux, token, translationFileRenderParts{
		source:  bytes.Repeat([]byte("a"), maxTranslationFileRenderSourceBytes+1),
		request: translationFileRenderRequest{SourcePath: "messages.csv", TargetLocale: "de-DE"},
	})

	require.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
}

func TestRenderTranslationFileRequiresTheServerCallToken(t *testing.T) {
	mux, _ := newTranslationFileRenderMux(t)
	parts := translationFileRenderParts{
		source:  []byte("key,value\n"),
		request: translationFileRenderRequest{SourcePath: "messages.csv", TargetLocale: "de-DE"},
	}

	require.Equal(t, http.StatusUnauthorized, postTranslationFileRender(t, mux, "", parts).Code)
	require.Equal(t, http.StatusUnauthorized, postTranslationFileRender(t, mux, "wrong", parts).Code)
}

func TestRenderTranslationFileIsClosedWithoutAServerSecret(t *testing.T) {
	mux, token := newTranslationFileRenderMux(t)
	t.Setenv("WORKOS_COOKIE_PASSWORD", "")

	rec := postTranslationFileRender(t, mux, token, translationFileRenderParts{
		source:  []byte("key,value\n"),
		request: translationFileRenderRequest{SourcePath: "messages.csv", TargetLocale: "de-DE"},
	})

	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestRenderTranslationFileRejectsBadRequests(t *testing.T) {
	mux, token := newTranslationFileRenderMux(t)

	tests := []struct {
		name  string
		parts translationFileRenderParts
		code  int
	}{
		{
			name: "file type with no writer",
			parts: translationFileRenderParts{
				source:  []byte("Hello"),
				request: translationFileRenderRequest{SourcePath: "notes.bin", TargetLocale: "de-DE"},
			},
			code: http.StatusBadRequest,
		},
		{
			name: "missing source path",
			parts: translationFileRenderParts{
				source:  []byte("key,value\n"),
				request: translationFileRenderRequest{TargetLocale: "de-DE"},
			},
			code: http.StatusBadRequest,
		},
		{
			name: "missing target locale",
			parts: translationFileRenderParts{
				source:  []byte("key,value\n"),
				request: translationFileRenderRequest{SourcePath: "messages.csv"},
			},
			code: http.StatusBadRequest,
		},
		{
			name: "missing source part",
			parts: translationFileRenderParts{
				request:    translationFileRenderRequest{SourcePath: "messages.csv", TargetLocale: "de-DE"},
				skipSource: true,
			},
			code: http.StatusBadRequest,
		},
		{
			name: "missing request part",
			parts: translationFileRenderParts{
				source:      []byte("key,value\n"),
				skipRequest: true,
			},
			code: http.StatusBadRequest,
		},
		{
			name: "request part that is not JSON",
			parts: translationFileRenderParts{
				source:  []byte("key,value\n"),
				request: "not an object",
			},
			code: http.StatusBadRequest,
		},
		{
			name: "source that is not its file type",
			parts: translationFileRenderParts{
				source:  []byte("not xml <"),
				request: translationFileRenderRequest{SourcePath: "messages.xlf", TargetLocale: "de-DE"},
			},
			code: http.StatusUnprocessableEntity,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := postTranslationFileRender(t, mux, token, tc.parts)
			require.Equal(t, tc.code, rec.Code, rec.Body.String())
			require.NotContains(t, rec.Body.String(), "not xml")
		})
	}
}

func TestRenderTranslationFileRejectsAPlainJSONBody(t *testing.T) {
	mux, token := newTranslationFileRenderMux(t)
	req := httptest.NewRequest(http.MethodPost, "/internal/translation-files/render", strings.NewReader(`{"sourcePath":"messages.csv"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(serverCallTokenHeader, token)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}
