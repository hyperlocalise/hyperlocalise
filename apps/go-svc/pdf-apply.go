package main

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

const (
	maxPdfApplyBodyBytes     = 25 << 20 // 25 MiB
	pdfOverflowKeysHeader    = "X-Hyperlocalise-Overflow-Keys"
	pdfApplyTemplateFormName = "template"
	pdfApplyValuesFormName   = "values"
	pdfApplyLocaleFormName   = "targetLocale"
)

type pdfApplyRequest struct {
	template     []byte
	values       map[string]string
	targetLocale string
}

func (h *handler) applyPdf(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodPost {
		writeBadRequest(w, r, "method not allowed")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxPdfApplyBodyBytes)
	req, err := readPdfApplyRequest(r)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writePayloadTooLarge(w, r)
			return
		}
		writePdfApplyError(w, r, err)
		return
	}

	content, overflow, err := translationfileparser.MarshalPDF(req.template, req.values, req.targetLocale)
	if err != nil {
		writePdfApplyError(w, r, err)
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if len(overflow) > 0 {
		w.Header().Set(pdfOverflowKeysHeader, strings.Join(overflow, ","))
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content)
}

func readPdfApplyRequest(r *http.Request) (pdfApplyRequest, error) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "multipart/form-data" {
		return pdfApplyRequest{}, pdfApplyClientError{code: "invalid_multipart", message: "Expected multipart form data"}
	}

	reader, err := r.MultipartReader()
	if err != nil {
		return pdfApplyRequest{}, pdfApplyClientError{code: "invalid_multipart", message: "Expected multipart form data"}
	}

	var req pdfApplyRequest
	seenTemplate := false
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return pdfApplyRequest{}, err
		}
		if err := readPdfApplyPart(part, &req, &seenTemplate); err != nil {
			_ = part.Close()
			return pdfApplyRequest{}, err
		}
		_ = part.Close()
	}

	if !seenTemplate {
		return pdfApplyRequest{}, pdfApplyClientError{code: "missing_template", message: "A template PDF file is required"}
	}
	if req.values == nil {
		return pdfApplyRequest{}, pdfApplyClientError{code: "missing_values", message: "Translation values are required"}
	}

	return req, nil
}

func readPdfApplyPart(part *multipart.Part, req *pdfApplyRequest, seenTemplate *bool) error {
	switch part.FormName() {
	case pdfApplyTemplateFormName:
		if *seenTemplate {
			return pdfApplyClientError{code: "invalid_multipart", message: "Only one template file is allowed"}
		}
		*seenTemplate = true
		data, err := io.ReadAll(io.LimitReader(part, maxPdfApplyBodyBytes+1))
		if err != nil {
			return err
		}
		if len(data) == 0 {
			return pdfApplyClientError{code: "missing_template", message: "A template PDF file is required"}
		}
		if len(data) > maxPdfApplyBodyBytes {
			return errPdfApplyTooLarge
		}
		req.template = data
	case pdfApplyValuesFormName:
		raw, err := io.ReadAll(io.LimitReader(part, 4<<20+1))
		if err != nil {
			return err
		}
		if len(raw) == 0 {
			return pdfApplyClientError{code: "missing_values", message: "Translation values are required"}
		}
		if len(raw) > 4<<20 {
			return pdfApplyClientError{code: "values_too_large", message: "Translation values are too large"}
		}
		var values map[string]string
		if err := json.Unmarshal(raw, &values); err != nil {
			return pdfApplyClientError{code: "invalid_values", message: "Translation values must be a JSON object"}
		}
		req.values = values
	case pdfApplyLocaleFormName:
		raw, err := io.ReadAll(io.LimitReader(part, 128))
		if err != nil {
			return err
		}
		req.targetLocale = strings.TrimSpace(string(raw))
	default:
		// Ignore unknown fields for forward compatibility.
	}
	return nil
}

type pdfApplyClientError struct {
	code    string
	message string
}

func (e pdfApplyClientError) Error() string {
	return e.message
}

var errPdfApplyTooLarge = errors.New("pdf apply request too large")

func writePdfApplyError(w http.ResponseWriter, r *http.Request, err error) {
	var client pdfApplyClientError
	if errors.As(err, &client) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": client.code, "message": client.message})
		return
	}
	if errors.Is(err, errPdfApplyTooLarge) {
		writePayloadTooLarge(w, r)
		return
	}
	switch {
	case errors.Is(err, translationfileparser.ErrPDFMalformed),
		errors.Is(err, translationfileparser.ErrPDFEncrypted),
		errors.Is(err, translationfileparser.ErrPDFNoTextLayer):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{
			"error":   "pdf_invalid",
			"message": "The PDF could not be read as a translation template.",
		})
	case errors.Is(err, translationfileparser.ErrPDFScriptUnsupported):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{
			"error":   "pdf_script_unsupported",
			"message": "The target text uses a script this PDF export does not support.",
		})
	default:
		noteRequest(r, "code", "internal_error", "reason", err.Error())
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error":   "pdf_export_failed",
			"message": "Could not write translations into the PDF.",
		})
	}
}
