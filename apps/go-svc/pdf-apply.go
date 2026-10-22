package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

const maxPDFApplyBytes = 32 << 20

func (h *handler) applyPDFTranslations(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxPDFApplyBytes); err != nil {
		writeBadRequest(w, r, "Could not read the upload.")
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		writeBadRequest(w, r, "Upload the source PDF as file.")
		return
	}
	defer func() { _ = file.Close() }()

	template, err := io.ReadAll(io.LimitReader(file, maxPDFApplyBytes+1))
	if err != nil {
		writeBadRequest(w, r, "Could not read the PDF.")
		return
	}
	if len(template) > maxPDFApplyBytes {
		writePayloadTooLarge(w, r)
		return
	}

	valuesRaw := strings.TrimSpace(r.FormValue("values"))
	if valuesRaw == "" {
		writeBadRequest(w, r, "Provide segment translations as JSON in values.")
		return
	}
	var values map[string]string
	if err := json.Unmarshal([]byte(valuesRaw), &values); err != nil {
		writeBadRequest(w, r, "values must be a JSON object.")
		return
	}

	targetLocale := strings.TrimSpace(r.FormValue("targetLocale"))
	content, overflow, err := translationfileparser.MarshalPDF(template, values, targetLocale)
	if err != nil {
		switch {
		case errors.Is(err, translationfileparser.ErrPDFEncrypted):
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
				"error":   "pdf_encrypted",
				"message": "Password-protected PDFs are not supported.",
			})
		case errors.Is(err, translationfileparser.ErrPDFNoTextLayer):
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
				"error":   "pdf_no_text_layer",
				"message": "No readable text was found in the PDF.",
			})
		case errors.Is(err, translationfileparser.ErrPDFScriptUnsupported):
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
				"error":   "pdf_script_unsupported",
				"message": "This PDF target language requires text shaping that is not supported yet.",
			})
		default:
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"error":   "pdf_apply_failed",
				"message": "Could not write translations into the PDF.",
			})
		}
		return
	}

	if len(overflow) > 0 {
		w.Header().Set("X-Hyperlocalise-Overflow-Keys", strings.Join(overflow, ","))
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(content)
}
