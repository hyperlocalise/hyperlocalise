package main

import (
	"bytes"
	"encoding/json"
	"errors"
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
	body := newPdfApplyMultipartBody(t, template, values)

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
		maxPdfApplyTemplateBytes+maxPdfApplyValuesBytes,
	)
	require.Greater(t, maxPdfApplyBodyBytes, maxPdfApplyTemplateBytes)
}

func TestReadPdfApplyRequestAcceptsUploadLimitTemplateWithValues(t *testing.T) {
	body := newPdfApplyMultipartBody(
		t,
		bytes.Repeat([]byte("P"), maxPdfApplyTemplateBytes),
		map[string]string{"page-1#1": "translated"},
	)

	req := httptest.NewRequest(http.MethodPost, "/", body)
	req.Header.Set("Content-Type", body.contentType)
	req.Body = http.MaxBytesReader(httptest.NewRecorder(), req.Body, maxPdfApplyBodyBytes)

	got, err := readPdfApplyRequest(req)
	require.NoError(t, err)
	require.Len(t, got.template, maxPdfApplyTemplateBytes)
	require.Equal(t, "translated", got.values["page-1#1"])
}

func TestReadPdfApplyRequestRejectsOversizedTemplate(t *testing.T) {
	body := newPdfApplyMultipartBody(
		t,
		bytes.Repeat([]byte("P"), maxPdfApplyTemplateBytes+1),
		map[string]string{"page-1#1": "x"},
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

func TestApplyPdfRejectsNonPost(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	h := newHandler()
	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/internal/pdf/apply", nil)
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusMethodNotAllowed, rec.Code)
}

func TestReadPdfApplyRequestValidation(t *testing.T) {
	t.Run("rejects non-multipart bodies", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"values":{}}`))
		req.Header.Set("Content-Type", "application/json")
		_, err := readPdfApplyRequest(req)
		var client pdfApplyClientError
		require.ErrorAs(t, err, &client)
		require.Equal(t, "invalid_multipart", client.code)
	})

	t.Run("rejects a missing template", func(t *testing.T) {
		body := newPdfApplyMultipartBodyParts(t, nil, map[string]string{"page-1#1": "x"})
		req := httptest.NewRequest(http.MethodPost, "/", body)
		req.Header.Set("Content-Type", body.contentType)
		_, err := readPdfApplyRequest(req)
		var client pdfApplyClientError
		require.ErrorAs(t, err, &client)
		require.Equal(t, "missing_template", client.code)
	})

	t.Run("rejects a missing values object", func(t *testing.T) {
		body := newPdfApplyMultipartBodyParts(t, []byte("%PDF-1.4"), nil)
		req := httptest.NewRequest(http.MethodPost, "/", body)
		req.Header.Set("Content-Type", body.contentType)
		_, err := readPdfApplyRequest(req)
		var client pdfApplyClientError
		require.ErrorAs(t, err, &client)
		require.Equal(t, "missing_values", client.code)
	})

	t.Run("rejects invalid values JSON", func(t *testing.T) {
		var buffer bytes.Buffer
		writer := multipart.NewWriter(&buffer)
		valuesPart, err := writer.CreateFormField(pdfApplyValuesFormName)
		require.NoError(t, err)
		_, err = valuesPart.Write([]byte(`["not-an-object"]`))
		require.NoError(t, err)
		filePart, err := writer.CreateFormFile(pdfApplyTemplateFormName, "template.pdf")
		require.NoError(t, err)
		_, err = filePart.Write([]byte("%PDF-1.4"))
		require.NoError(t, err)
		require.NoError(t, writer.Close())

		req := httptest.NewRequest(http.MethodPost, "/", &buffer)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		_, err = readPdfApplyRequest(req)
		var client pdfApplyClientError
		require.ErrorAs(t, err, &client)
		require.Equal(t, "invalid_values", client.code)
	})
}

func TestWritePdfApplyErrorMapping(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	tests := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{
			name:   "malformed template",
			err:    translationfileparser.ErrPDFMalformed,
			status: http.StatusUnprocessableEntity,
			code:   "pdf_invalid",
		},
		{
			name:   "unsupported script",
			err:    translationfileparser.ErrPDFScriptUnsupported,
			status: http.StatusUnprocessableEntity,
			code:   "pdf_script_unsupported",
		},
		{
			name:   "unknown apply failure",
			err:    errors.New("write failed"),
			status: http.StatusInternalServerError,
			code:   "pdf_export_failed",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/internal/pdf/apply", nil)
			writePdfApplyError(rec, req, tt.err)
			require.Equal(t, tt.status, rec.Code)
			require.Contains(t, rec.Body.String(), `"error":"`+tt.code+`"`)
		})
	}
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
	body := newPdfApplyMultipartBody(t, template, values)

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
) pdfApplyMultipartBody {
	t.Helper()
	return newPdfApplyMultipartBodyParts(t, template, values)
}

func newPdfApplyMultipartBodyParts(
	t *testing.T,
	template []byte,
	values map[string]string,
) pdfApplyMultipartBody {
	t.Helper()
	var buffer bytes.Buffer
	writer := multipart.NewWriter(&buffer)

	if values != nil {
		valuesPart, err := writer.CreateFormField(pdfApplyValuesFormName)
		require.NoError(t, err)
		encoded, err := json.Marshal(values)
		require.NoError(t, err)
		_, err = valuesPart.Write(encoded)
		require.NoError(t, err)
	}

	if template != nil {
		filePart, err := writer.CreateFormFile(pdfApplyTemplateFormName, "template.pdf")
		require.NoError(t, err)
		_, err = filePart.Write(template)
		require.NoError(t, err)
	}

	require.NoError(t, writer.Close())
	return pdfApplyMultipartBody{contentType: writer.FormDataContentType(), Reader: &buffer}
}
