package main

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	"github.com/stretchr/testify/require"
)

func TestApplyPdfUnauthorized(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	h := newHandler()
	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/internal/pdf/apply", nil)
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestApplyPdfRoundTrip(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	template, err := translationfileparser.FixtureSingleBlockPDF()
	require.NoError(t, err)

	entries, err := translationfileparser.ReadPDFEntries(template)
	require.NoError(t, err)
	require.Len(t, entries, 1)

	values := map[string]string{entries[0].Key: "Translated PDF block"}
	body := newPdfApplyMultipartBody(t, template, values, "fr-FR")

	h := newHandler()
	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/internal/pdf/apply", body)
	req.Header.Set("Content-Type", body.contentType)
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "application/pdf", rec.Header().Get("Content-Type"))
	reRead, err := translationfileparser.ReadPDFEntries(rec.Body.Bytes())
	require.NoError(t, err)
	require.NotEmpty(t, reRead)
}

type pdfApplyMultipartBody struct {
	contentType string
	io.Reader
}

func newPdfApplyMultipartBody(
	t *testing.T,
	template []byte,
	values map[string]string,
	targetLocale string,
) pdfApplyMultipartBody {
	t.Helper()
	var buffer bytes.Buffer
	writer := multipart.NewWriter(&buffer)

	valuesPart, err := writer.CreateFormField(pdfApplyValuesFormName)
	require.NoError(t, err)
	encoded, err := json.Marshal(values)
	require.NoError(t, err)
	_, err = valuesPart.Write(encoded)
	require.NoError(t, err)

	localePart, err := writer.CreateFormField(pdfApplyLocaleFormName)
	require.NoError(t, err)
	_, err = localePart.Write([]byte(targetLocale))
	require.NoError(t, err)

	filePart, err := writer.CreateFormFile(pdfApplyTemplateFormName, "template.pdf")
	require.NoError(t, err)
	_, err = filePart.Write(template)
	require.NoError(t, err)

	require.NoError(t, writer.Close())
	return pdfApplyMultipartBody{contentType: writer.FormDataContentType(), Reader: &buffer}
}
