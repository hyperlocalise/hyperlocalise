package main

import (
	"errors"
	"io"
	"net/http"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

func (h *handler) extractPDFEntries(w http.ResponseWriter, r *http.Request) {
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

	content, err := io.ReadAll(io.LimitReader(file, maxPDFApplyBytes+1))
	if err != nil {
		writeBadRequest(w, r, "Could not read the PDF.")
		return
	}
	if len(content) > maxPDFApplyBytes {
		writePayloadTooLarge(w, r)
		return
	}

	strategy := translationfileparser.NewDefaultStrategy()
	entries, err := strategy.ParseIngestEntries("source.pdf", content, "")
	if err != nil {
		writePDFParserError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, translationfileparser.EncodeEntriesCommandOutput(entries))
}

func writePDFParserError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, translationfileparser.ErrPDFEncrypted):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error":   "pdf_encrypted",
			"message": "Password-protected PDFs are not supported.",
		})
	case errors.Is(err, translationfileparser.ErrPDFNoTextLayer):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error":   "pdf_no_text_layer",
			"message": "pdf has no readable text layer",
		})
	default:
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error":   "pdf_parse_failed",
			"message": "Could not read text from the PDF.",
		})
	}
}
