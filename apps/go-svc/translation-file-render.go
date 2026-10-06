package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/srx"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

const maxTranslationFileRenderBodyBytes = 32 << 20 // 32 MiB

type translationFileRenderRequest struct {
	SourcePath   string `json:"sourcePath"`
	SourceLocale string `json:"sourceLocale"`
	TargetLocale string `json:"targetLocale"`
	// Source is the source file's bytes, which JSON carries as base64.
	Source []byte `json:"source"`
	// Values maps each translated key to its text. Untranslated keys are left out.
	Values map[string]string `json:"values"`
	// SourceSpans maps every SRX span key of the file to its source text.
	SourceSpans map[string]string `json:"sourceSpans"`
}

// renderTranslationFile writes translations into the caller's copy of a source file and
// returns the result in the source file's own format.
func (h *handler) renderTranslationFile(w http.ResponseWriter, r *http.Request) {
	var req translationFileRenderRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxTranslationFileRenderBodyBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		if isRequestBodyTooLarge(err) {
			writePayloadTooLarge(w, r)
			return
		}
		writeBadRequest(w, r, "invalid render request")
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		writeBadRequest(w, r, "expected one JSON object")
		return
	}
	if strings.TrimSpace(req.SourcePath) == "" {
		writeBadRequest(w, r, "source path required")
		return
	}
	if strings.TrimSpace(req.TargetLocale) == "" {
		writeBadRequest(w, r, "target locale required")
		return
	}

	values := srx.JoinSpanValues(req.Values, req.SourceSpans)
	content, err := translationfileparser.MarshalTargetFromSource(req.SourcePath, req.Source, values, req.SourceLocale, req.TargetLocale)
	if errors.Is(err, translationfileparser.ErrTargetFormatUnsupported) {
		writeBadRequest(w, r, "unsupported file type")
		return
	}
	if err != nil {
		// The parser's message can quote the file, so it stays out of the response and the log.
		noteRequest(r, "code", "render_failed")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":   "render_failed",
			"message": "the source file could not be written with these translations",
		})
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content)
}
