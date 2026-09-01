package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/spellcheck"
	"golang.org/x/text/language"
)

const maxValidateSegmentBodyBytes = 512 << 10 // 512 KiB

type validateSegmentRequest struct {
	SourceText   string   `json:"sourceText"`
	TargetText   string   `json:"targetText"`
	SourcePath   string   `json:"sourcePath"`
	MaxLength    int      `json:"maxLength"`
	Modes        []string `json:"modes,omitempty"`
	TargetLocale string   `json:"targetLocale,omitempty"`
}

type validateSegmentResponse struct {
	Checks       []segmentvalidate.Check `json:"checks"`
	SkippedModes []string                `json:"skippedModes,omitempty"`
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

const publicPathPrefix = "/api/go-svc"

func registerRoutes(mux *http.ServeMux, h *handler, verifier SessionVerifier) {
	validate := authMiddleware(verifier)(http.HandlerFunc(h.validateSegment))
	mux.HandleFunc("GET /health", h.health)
	mux.Handle("POST /v1/validate/segment", validate)
}

// withOptionalPrefix serves next at both its native paths and under prefix.
// Vercel Services forwards the public path unchanged, so production calls
// arrive as /api/go-svc/v1/validate/segment while local and binding calls
// use /v1/validate/segment.
func withOptionalPrefix(prefix string, next http.Handler) http.Handler {
	stripped := http.StripPrefix(prefix, next)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == prefix || strings.HasPrefix(r.URL.Path, prefix+"/") {
			stripped.ServeHTTP(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (h *handler) checkSpelling(ctx context.Context, locale, text string) ([]SpellingIssue, error) {
	return h.spellChecker.Check(ctx, locale, uniqueWords(spellcheck.Tokenize(text)))
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

	spellingRequested := requestsSpelling(req.Modes)

	var targetLocale string
	if spellingRequested {
		var err error
		targetLocale, err = validateTargetLocale(req.TargetLocale)
		if err != nil {
			writeBadRequest(w, err.Error())
			return
		}
	}

	checks, skippedModes, err := h.composeSegmentValidation(r.Context(), req, targetLocale, spellingRequested)
	if err != nil {
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(validateSegmentResponse{Checks: checks, SkippedModes: skippedModes})
}

func requestsSpelling(modes []string) bool {
	for _, mode := range modes {
		if strings.TrimSpace(mode) == QA_MODE_SPELLING {
			return true
		}
	}
	return false
}

func validateTargetLocale(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", errors.New("targetLocale is required when requesting spelling checks")
	}
	if _, err := language.Parse(trimmed); err != nil {
		return "", errors.New("targetLocale must be a valid BCP 47 language tag")
	}
	return trimmed, nil
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
