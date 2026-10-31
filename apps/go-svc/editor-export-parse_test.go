package main

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/editor-export"
	"github.com/stretchr/testify/require"
)

func TestParseEditorFilteredExportUnauthorized(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	h := newHandler()
	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/internal/editor-export/filtered/parse", nil)
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestParseEditorFilteredExportRoundTrip(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	rows := []editor_export.Row{{
		Key:          "hello",
		SourceText:   "Hello <b>world</b>",
		TargetText:   "Bonjour <b>monde</b>",
		SourceLocale: "en",
		TargetLocale: "fr",
		SourcePath:   "locales/en.json",
	}}
	serialized, err := editor_export.Serialize(editor_export.FormatXLIFF, rows)
	require.NoError(t, err)
	body := newEditorFilteredParseMultipart(t, "xliff", "queue-fr.xliff", serialized.Body)

	h := newHandler()
	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/internal/editor-export/filtered/parse", body)
	req.Header.Set("Content-Type", body.contentType)
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var parsed editorFilteredParseResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &parsed))
	require.Equal(t, rows, parsed.Rows)
}

func TestParseEditorFilteredExportInfersFormatFromFilename(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	serialized, err := editor_export.Serialize(editor_export.FormatCSV, []editor_export.Row{{
		Key:          "hello",
		SourceText:   "Hello",
		TargetText:   "Bonjour",
		SourceLocale: "en",
		TargetLocale: "fr",
		SourcePath:   "a.json",
	}})
	require.NoError(t, err)
	body := newEditorFilteredParseMultipart(t, "", "queue-fr.csv", serialized.Body)

	h := newHandler()
	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/internal/editor-export/filtered/parse", body)
	req.Header.Set("Content-Type", body.contentType)
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
}

func TestParseEditorFilteredExportRejectsEmptyFile(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	body := newEditorFilteredParseMultipart(t, "csv", "queue.csv", []byte{})

	h := newHandler()
	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/internal/editor-export/filtered/parse", body)
	req.Header.Set("Content-Type", body.contentType)
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

type editorFilteredParseMultipartBody struct {
	contentType string
	io.Reader
}

func newEditorFilteredParseMultipart(
	t *testing.T,
	format string,
	filename string,
	file []byte,
) editorFilteredParseMultipartBody {
	t.Helper()
	var buffer bytes.Buffer
	writer := multipart.NewWriter(&buffer)
	if format != "" {
		require.NoError(t, writer.WriteField(editorFilteredParseFormatFormName, format))
	}
	if file != nil {
		part, err := writer.CreateFormFile(editorFilteredParseFileFormName, filename)
		require.NoError(t, err)
		_, err = part.Write(file)
		require.NoError(t, err)
	}
	require.NoError(t, writer.Close())
	return editorFilteredParseMultipartBody{
		contentType: writer.FormDataContentType(),
		Reader:      &buffer,
	}
}
