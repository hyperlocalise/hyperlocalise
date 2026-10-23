package main

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestPdfApplyBodyBudgetIncludesValuesAndFraming(t *testing.T) {
	require.GreaterOrEqual(
		t,
		maxPdfApplyBodyBytes,
		maxPdfApplyTemplateBytes+maxPdfApplyValuesBytes+maxPdfApplyLocaleBytes,
	)
	require.Greater(t, maxPdfApplyBodyBytes, maxPdfApplyTemplateBytes)
}

func TestReadPdfApplyRequestAcceptsUploadLimitTemplateWithValues(t *testing.T) {
	body := newPdfApplyMultipartBody(
		t,
		bytes.Repeat([]byte("P"), maxPdfApplyTemplateBytes),
		map[string]string{"page-1#1": "translated"},
		"fr-FR",
	)

	req := httptest.NewRequest(http.MethodPost, "/", body)
	req.Header.Set("Content-Type", body.contentType)
	req.Body = http.MaxBytesReader(httptest.NewRecorder(), req.Body, maxPdfApplyBodyBytes)

	got, err := readPdfApplyRequest(req)
	require.NoError(t, err)
	require.Len(t, got.template, maxPdfApplyTemplateBytes)
	require.Equal(t, "translated", got.values["page-1#1"])
	require.Equal(t, "fr-FR", got.targetLocale)
}

func TestReadPdfApplyRequestRejectsOversizedTemplate(t *testing.T) {
	body := newPdfApplyMultipartBody(
		t,
		bytes.Repeat([]byte("P"), maxPdfApplyTemplateBytes+1),
		map[string]string{"page-1#1": "x"},
		"en",
	)

	req := httptest.NewRequest(http.MethodPost, "/", body)
	req.Header.Set("Content-Type", body.contentType)

	_, err := readPdfApplyRequest(req)
	require.ErrorIs(t, err, errPdfApplyTooLarge)
}

func TestReadPdfApplyRequestRejectsOversizedValues(t *testing.T) {
	body := newPdfApplyMultipartBody(
		t,
		[]byte("%PDF-1.4"),
		map[string]string{"k": strings.Repeat("x", maxPdfApplyValuesBytes)},
		"en",
	)

	req := httptest.NewRequest(http.MethodPost, "/", body)
	req.Header.Set("Content-Type", body.contentType)

	_, err := readPdfApplyRequest(req)
	var client pdfApplyClientError
	require.ErrorAs(t, err, &client)
	require.Equal(t, "values_too_large", client.code)
}

func TestApplyPdfDoesNotRejectUploadLimitTemplateAsTooLarge(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	body := newPdfApplyMultipartBody(
		t,
		bytes.Repeat([]byte("P"), maxPdfApplyTemplateBytes),
		map[string]string{"page-1#1": "x"},
		"fr",
	)

	h := newHandler()
	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/internal/pdf/apply", body)
	req.Header.Set("Content-Type", body.contentType)
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	mux.ServeHTTP(rec, req)

	require.NotEqual(t, http.StatusRequestEntityTooLarge, rec.Code, rec.Body.String())
}

func TestApplyPdfOverflowHeader(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	template, err := translationfileparser.FixtureSingleBlockPDF()
	require.NoError(t, err)

	entries, err := translationfileparser.ReadPDFEntries(template)
	require.NoError(t, err)
	require.Len(t, entries, 1)

	long := strings.Repeat("overflowword ", 40)
	values := map[string]string{entries[0].Key: long}
	body := newPdfApplyMultipartBody(t, template, values, "en")

	h := newHandler()
	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/internal/pdf/apply", body)
	req.Header.Set("Content-Type", body.contentType)
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	overflow := rec.Header().Get("X-Hyperlocalise-Overflow-Keys")
	require.NotEmpty(t, overflow)
	require.Contains(t, overflow, entries[0].Key)
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
