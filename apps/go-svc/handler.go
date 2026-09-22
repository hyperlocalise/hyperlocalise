package main

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/experiment"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/spellcheck"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"golang.org/x/text/language"
)

const maxValidateSegmentBodyBytes = 512 << 10 // 512 KiB

const dependencyHealthTimeout = time.Second

type healthPinger interface {
	Ping(context.Context) error
}

type valkeyHealthClient interface {
	healthPinger
	Close()
}

type dependencyHealth struct {
	Status      string   `json:"status"`
	RoundtripMS *float64 `json:"roundtrip_ms,omitempty"`
}

type validateSegmentRequest struct {
	SourceText    string   `json:"sourceText"`
	TargetText    string   `json:"targetText"`
	SourcePath    string   `json:"sourcePath"`
	MaxLength     int      `json:"maxLength"`
	Modes         []string `json:"modes,omitempty"`
	TargetLocale  string   `json:"targetLocale,omitempty"`
	AcceptedWords []string `json:"acceptedWords,omitempty"`
}

type validateSegmentResponse struct {
	Checks       []segmentvalidate.Check `json:"checks"`
	SkippedModes []string                `json:"skippedModes,omitempty"`
}

type handler struct {
	validate      func(segmentvalidate.Request) []segmentvalidate.Check
	spellChecker  SpellChecker
	ofrep         *experiment.OFREPHandler
	research      researchService
	gsc           gscService
	objects       *objectstore.Registry
	guidelines    *guidelines.Service
	dictionaries  *dictionaryAPI
	glossaries    *glossaryAPI
	memories      *memoryAPI
	qaReports     *qaReportAPI
	teams         *teamAPI
	issueSheets   *issueSheetAPI
	activityLogs  *activityLogAPI
	contentEditor *editorCatAPI
	valkey        valkeyHealthClient
	postgres      healthPinger
}

func newHandler() *handler {
	return &handler{
		validate:     segmentvalidate.ValidateSegment,
		spellChecker: NoopSpellChecker{},
		gsc:          liveGscService{},
	}
}

const publicPathPrefix = "/api/go-svc"

func registerRoutes(mux *http.ServeMux, h *handler, verifier SessionVerifier) {
	if h.dictionaries != nil {
		h.dictionaries.register(mux, verifier)
	}
	if h.glossaries != nil {
		h.glossaries.register(mux, verifier)
	}
	if h.memories != nil {
		h.memories.register(mux, verifier)
	}
	if h.qaReports != nil {
		h.qaReports.register(mux, verifier)
	}
	if h.issueSheets != nil {
		h.issueSheets.register(mux, verifier)
	}
	if h.teams != nil {
		h.teams.register(mux, verifier)
	}
	if h.activityLogs != nil {
		h.activityLogs.register(mux, verifier)
	}
	if h.contentEditor != nil {
		h.contentEditor.register(mux, verifier)
	}
	validate := authMiddleware(verifier)(http.HandlerFunc(h.validateSegment))
	editorExport := authMiddleware(verifier)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		h.serializeEditorFilteredExport(w, r)
	}))
	mux.HandleFunc("GET /health", h.health)
	mux.Handle("POST /v1/validate/segment", validate)
	mux.Handle("POST /v1/editor-export/filtered/serialize", editorExport)
	research := serverCallAuthMiddleware(verifier)
	mux.Handle("POST /v1/domains/research/keywords", research(http.HandlerFunc(h.expandKeywords)))
	mux.Handle("POST /v1/domains/research/market-visibility", research(http.HandlerFunc(h.marketVisibility)))
	mux.Handle("POST /v1/domains/research/serp", research(http.HandlerFunc(h.liveSerp)))
	mux.Handle("POST /v1/domains/research/rank-check", research(http.HandlerFunc(h.rankCheck)))
	mux.Handle("POST /v1/domains/research/rank-check/batch", research(http.HandlerFunc(h.rankCheckBatch)))
	mux.Handle("POST /v1/domains/gsc/sites", research(http.HandlerFunc(h.listGscSites)))
	mux.Handle("POST /v1/domains/gsc/performance", research(http.HandlerFunc(h.queryGscPerformance)))
	mux.Handle("POST /v1/domains/gsc/inspect", research(http.HandlerFunc(h.inspectGscURL)))
	for pattern, route := range map[string]http.HandlerFunc{
		"PUT /v1/storage/object":         h.putObject,
		"POST /v1/storage/read":          h.getObject,
		"POST /v1/storage/stat":          h.statObject,
		"POST /v1/storage/delete":        h.deleteObject,
		"POST /v1/storage/sign-upload":   h.signUpload,
		"POST /v1/storage/sign-download": h.signDownload,
		"POST /v1/guidelines/sync":       h.syncGuidelines,
		"POST /v1/guidelines/search":     h.searchGuidelines,
	} {
		mux.Handle(pattern, serverCallAuthMiddleware(verifier)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			route.ServeHTTP(w, r)
		})))
	}
	if h.ofrep != nil {
		h.ofrep.Register(mux)
	}
}

// withOptionalPrefix serves next at both its native paths and under prefix.
// Vercel Services forwards the public path unchanged, so production calls
// arrive as /api/go-svc/v1/validate/segment while local and binding calls
// use /v1/validate/segment.
func withOptionalPrefix(prefix string, next http.Handler) http.Handler {
	stripped := http.StripPrefix(prefix, next)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == prefix || strings.HasPrefix(r.URL.Path, prefix+"/") {
			r = r.WithContext(withPublicPath(r.Context(), r.URL.Path))
			stripped.ServeHTTP(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (h *handler) checkSpelling(ctx context.Context, locale, text string, acceptedWords []string) ([]SpellingIssue, error) {
	accepted := spellcheck.NewAcceptedWords(acceptedWords)
	words := spellcheck.RejectedWords(uniqueWords(spellcheck.Tokenize(text)), accepted)
	if len(words) == 0 {
		return nil, nil
	}
	return h.spellChecker.Check(ctx, locale, words)
}

func (h *handler) health(w http.ResponseWriter, r *http.Request) {
	valkey := checkDependencyHealth(r.Context(), h.valkey)
	postgres := checkDependencyHealth(r.Context(), h.postgres)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":   "ok",
		"valkey":   valkey,
		"postgres": postgres,
	})
}

func checkDependencyHealth(parent context.Context, pinger healthPinger) dependencyHealth {
	if pinger == nil {
		return dependencyHealth{Status: "disabled"}
	}

	ctx, cancel := context.WithTimeout(parent, dependencyHealthTimeout)
	started := time.Now()
	err := pinger.Ping(ctx)
	roundtripMS := math.Round(float64(time.Since(started))/float64(time.Millisecond)*1000) / 1000
	cancel()

	status := "ok"
	if err != nil {
		status = "unavailable"
	}
	return dependencyHealth{Status: status, RoundtripMS: &roundtripMS}
}

func (h *handler) validateSegment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if denyBrowserMutation(r) {
		writeForbidden(w, "Cross-origin request denied")
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

func writeForbidden(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   "forbidden",
		"message": message,
	})
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
