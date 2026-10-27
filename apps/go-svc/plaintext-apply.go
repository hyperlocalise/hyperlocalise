package main

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

const (
	// Template size matches the project upload limit. Values and multipart
	// framing sit outside that budget so a 25 MiB text template can still render.
	maxPlaintextApplyTemplateBytes          = 25 << 20
	maxPlaintextApplyValuesBytes            = 4 << 20
	maxPlaintextApplyMultipartOverheadBytes = 1 << 20
	maxPlaintextApplyBodyBytes              = maxPlaintextApplyTemplateBytes +
		maxPlaintextApplyValuesBytes +
		maxPlaintextApplyMultipartOverheadBytes
	plaintextApplyTemplateFormName = "template"
	plaintextApplyValuesFormName   = "values"
)

type plaintextApplyRequest struct {
	template []byte
	values   map[string]string
}

func (h *handler) applyPlaintext(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodPost {
		writeBadRequest(w, r, "method not allowed")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxPlaintextApplyBodyBytes)
	req, err := readPlaintextApplyRequest(r)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writePayloadTooLarge(w, r)
			return
		}
		writePlaintextApplyError(w, r, err)
		return
	}

	content := translationfileparser.MarshalPlainText(req.template, req.values)

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content)
}

func readPlaintextApplyRequest(r *http.Request) (plaintextApplyRequest, error) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "multipart/form-data" {
		return plaintextApplyRequest{}, plaintextApplyClientError{code: "invalid_multipart", message: "Expected multipart form data"}
	}

	reader, err := r.MultipartReader()
	if err != nil {
		return plaintextApplyRequest{}, plaintextApplyClientError{code: "invalid_multipart", message: "Expected multipart form data"}
	}

	var req plaintextApplyRequest
	seenTemplate := false
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return plaintextApplyRequest{}, err
		}
		if err := readPlaintextApplyPart(part, &req, &seenTemplate); err != nil {
			_ = part.Close()
			return plaintextApplyRequest{}, err
		}
		_ = part.Close()
	}

	if !seenTemplate {
		return plaintextApplyRequest{}, plaintextApplyClientError{code: "missing_template", message: "A template text file is required"}
	}
	if req.values == nil {
		return plaintextApplyRequest{}, plaintextApplyClientError{code: "missing_values", message: "Translation values are required"}
	}

	return req, nil
}

func readPlaintextApplyPart(part *multipart.Part, req *plaintextApplyRequest, seenTemplate *bool) error {
	switch part.FormName() {
	case plaintextApplyTemplateFormName:
		if *seenTemplate {
			return plaintextApplyClientError{code: "invalid_multipart", message: "Only one template file is allowed"}
		}
		*seenTemplate = true
		data, err := io.ReadAll(io.LimitReader(part, maxPlaintextApplyTemplateBytes+1))
		if err != nil {
			return err
		}
		if len(data) == 0 {
			return plaintextApplyClientError{code: "missing_template", message: "A template text file is required"}
		}
		if len(data) > maxPlaintextApplyTemplateBytes {
			return errPlaintextApplyTooLarge
		}
		req.template = data
	case plaintextApplyValuesFormName:
		raw, err := io.ReadAll(io.LimitReader(part, maxPlaintextApplyValuesBytes+1))
		if err != nil {
			return err
		}
		if len(raw) == 0 {
			return plaintextApplyClientError{code: "missing_values", message: "Translation values are required"}
		}
		if len(raw) > maxPlaintextApplyValuesBytes {
			return plaintextApplyClientError{code: "values_too_large", message: "Translation values are too large"}
		}
		var values map[string]string
		if err := json.Unmarshal(raw, &values); err != nil {
			return plaintextApplyClientError{code: "invalid_values", message: "Translation values must be a JSON object"}
		}
		req.values = values
	default:
		// Ignore unknown fields for forward compatibility.
	}
	return nil
}

type plaintextApplyClientError struct {
	code    string
	message string
}

func (e plaintextApplyClientError) Error() string {
	return e.message
}

var errPlaintextApplyTooLarge = errors.New("plaintext apply request too large")

func writePlaintextApplyError(w http.ResponseWriter, r *http.Request, err error) {
	var client plaintextApplyClientError
	if errors.As(err, &client) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": client.code, "message": client.message})
		return
	}
	if errors.Is(err, errPlaintextApplyTooLarge) {
		writePayloadTooLarge(w, r)
		return
	}
	noteRequest(r, "code", "internal_error", "reason", err.Error())
	writeJSON(w, http.StatusInternalServerError, map[string]string{
		"error":   "plaintext_export_failed",
		"message": "Could not write translations into the text file.",
	})
}
