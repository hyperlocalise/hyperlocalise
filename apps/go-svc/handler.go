package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/spellcheck"
)

const maxValidateSegmentBodyBytes = 512 << 10 // 512 KiB

type validateSegmentRequest struct {
	SourceText string   `json:"sourceText"`
	TargetText string   `json:"targetText"`
	SourcePath string   `json:"sourcePath"`
	MaxLength  int      `json:"maxLength"`
	Modes      []string `json:"modes,omitempty"`
}

type validateSegmentResponse struct {
	Checks []segmentvalidate.Check `json:"checks"`
}

type handler struct {
	validate     func(segmentvalidate.Request) []segmentvalidate.Check
	spellChecker SpellChecker
}

func newHandler() *handler {
	return &handler{
		validate:     segmentvalidate.ValidateSegment,
		spellChecker: NoopSpellChecker{},
	}
}

func (h *handler) checkSpelling(ctx context.Context, locale, text string) ([]SpellingIssue, error) {
	return h.spellChecker.Check(ctx, locale, spellcheck.Tokenize(text))
}

func (h *handler) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

func (h *handler) validateSegment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req validateSegmentRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxValidateSegmentBodyBytes))
	if err := decoder.Decode(&req); err != nil {
		if isRequestBodyTooLarge(err) {
			writePayloadTooLarge(w)
			return
		}
		writeBadRequest(w, "invalid JSON body")
		return
	}

	_, _ = h.checkSpelling(r.Context(), "", req.TargetText)

	checks := h.validate(segmentvalidate.Request{
		SourceText: req.SourceText,
		TargetText: req.TargetText,
		SourcePath: req.SourcePath,
		MaxLength:  req.MaxLength,
		Modes:      req.Modes,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(validateSegmentResponse{Checks: checks})
}

func writeBadRequest(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   "bad_request",
		"message": message,
	})
}

func writePayloadTooLarge(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusRequestEntityTooLarge)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   "payload_too_large",
		"message": "request body exceeds maximum allowed size",
	})
}

func isRequestBodyTooLarge(err error) bool {
	var maxBytesErr *http.MaxBytesError
	return errors.As(err, &maxBytesErr)
}
