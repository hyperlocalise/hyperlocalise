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

	"github.com/stretchr/testify/require"
)

func TestApplyPlaintextUnauthorized(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	h := newHandler()
	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/internal/plaintext/apply", nil)
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestApplyPlaintextRoundTrip(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	template := []byte("Hello world\n\nSecond paragraph\n")
	values := map[string]string{"txt.0001": "Bonjour le monde"}
	body := newPlaintextApplyMultipartBody(t, template, values)

	h := newHandler()
	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/internal/plaintext/apply", body)
	req.Header.Set("Content-Type", body.contentType)
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Header().Get("Content-Type"), "text/plain")
	require.Equal(t, "Bonjour le monde\n\nSecond paragraph\n", rec.Body.String())
}

func TestApplyPlaintextRejectsNonPost(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	h := newHandler()
	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/internal/plaintext/apply", nil)
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusMethodNotAllowed, rec.Code)
}

func TestReadPlaintextApplyRequestValidation(t *testing.T) {
	t.Run("rejects non-multipart bodies", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"values":{}}`))
		req.Header.Set("Content-Type", "application/json")
		_, err := readPlaintextApplyRequest(req)
		var client plaintextApplyClientError
		require.ErrorAs(t, err, &client)
		require.Equal(t, "invalid_multipart", client.code)
	})

	t.Run("rejects a missing template", func(t *testing.T) {
		body := newPlaintextApplyMultipartBodyParts(t, nil, map[string]string{"txt.0001": "x"})
		req := httptest.NewRequest(http.MethodPost, "/", body)
		req.Header.Set("Content-Type", body.contentType)
		_, err := readPlaintextApplyRequest(req)
		var client plaintextApplyClientError
		require.ErrorAs(t, err, &client)
		require.Equal(t, "missing_template", client.code)
	})

	t.Run("rejects a missing values object", func(t *testing.T) {
		body := newPlaintextApplyMultipartBodyParts(t, []byte("Hello\n"), nil)
		req := httptest.NewRequest(http.MethodPost, "/", body)
		req.Header.Set("Content-Type", body.contentType)
		_, err := readPlaintextApplyRequest(req)
		var client plaintextApplyClientError
		require.ErrorAs(t, err, &client)
		require.Equal(t, "missing_values", client.code)
	})

	t.Run("rejects invalid values JSON", func(t *testing.T) {
		var buffer bytes.Buffer
		writer := multipart.NewWriter(&buffer)
		valuesPart, err := writer.CreateFormField(plaintextApplyValuesFormName)
		require.NoError(t, err)
		_, err = valuesPart.Write([]byte(`["not-an-object"]`))
		require.NoError(t, err)
		filePart, err := writer.CreateFormFile(plaintextApplyTemplateFormName, "template.txt")
		require.NoError(t, err)
		_, err = filePart.Write([]byte("Hello\n"))
		require.NoError(t, err)
		require.NoError(t, writer.Close())

		req := httptest.NewRequest(http.MethodPost, "/", &buffer)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		_, err = readPlaintextApplyRequest(req)
		var client plaintextApplyClientError
		require.ErrorAs(t, err, &client)
		require.Equal(t, "invalid_values", client.code)
	})

	t.Run("rejects an oversized template", func(t *testing.T) {
		body := newPlaintextApplyMultipartBody(
			t,
			bytes.Repeat([]byte("P"), maxPlaintextApplyTemplateBytes+1),
			map[string]string{"txt.0001": "x"},
		)
		req := httptest.NewRequest(http.MethodPost, "/", body)
		req.Header.Set("Content-Type", body.contentType)
		_, err := readPlaintextApplyRequest(req)
		require.ErrorIs(t, err, errPlaintextApplyTooLarge)
	})

	t.Run("rejects oversized values", func(t *testing.T) {
		body := newPlaintextApplyMultipartBody(
			t,
			[]byte("Hello\n"),
			map[string]string{"k": strings.Repeat("x", maxPlaintextApplyValuesBytes)},
		)
		req := httptest.NewRequest(http.MethodPost, "/", body)
		req.Header.Set("Content-Type", body.contentType)
		_, err := readPlaintextApplyRequest(req)
		var client plaintextApplyClientError
		require.ErrorAs(t, err, &client)
		require.Equal(t, "values_too_large", client.code)
	})
}

func TestWritePlaintextApplyErrorMapping(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{
			name:   "client error",
			err:    plaintextApplyClientError{code: "missing_template", message: "required"},
			status: http.StatusBadRequest,
			code:   "missing_template",
		},
		{
			name:   "oversized request",
			err:    errPlaintextApplyTooLarge,
			status: http.StatusRequestEntityTooLarge,
			code:   "",
		},
		{
			name:   "unknown apply failure",
			err:    errors.New("write failed"),
			status: http.StatusInternalServerError,
			code:   "plaintext_export_failed",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/internal/plaintext/apply", nil)
			writePlaintextApplyError(rec, req, tt.err)
			require.Equal(t, tt.status, rec.Code)
			if tt.code != "" {
				require.Contains(t, rec.Body.String(), `"error":"`+tt.code+`"`)
			}
		})
	}
}

type plaintextApplyMultipartBody struct {
	contentType string
	io.Reader
}

func newPlaintextApplyMultipartBody(
	t *testing.T,
	template []byte,
	values map[string]string,
) plaintextApplyMultipartBody {
	t.Helper()
	return newPlaintextApplyMultipartBodyParts(t, template, values)
}

func newPlaintextApplyMultipartBodyParts(
	t *testing.T,
	template []byte,
	values map[string]string,
) plaintextApplyMultipartBody {
	t.Helper()
	var buffer bytes.Buffer
	writer := multipart.NewWriter(&buffer)

	if values != nil {
		valuesPart, err := writer.CreateFormField(plaintextApplyValuesFormName)
		require.NoError(t, err)
		encoded, err := json.Marshal(values)
		require.NoError(t, err)
		_, err = valuesPart.Write(encoded)
		require.NoError(t, err)
	}

	if template != nil {
		filePart, err := writer.CreateFormFile(plaintextApplyTemplateFormName, "template.txt")
		require.NoError(t, err)
		_, err = filePart.Write(template)
		require.NoError(t, err)
	}

	require.NoError(t, writer.Close())
	return plaintextApplyMultipartBody{contentType: writer.FormDataContentType(), Reader: &buffer}
}
