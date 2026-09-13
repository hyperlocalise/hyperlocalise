package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	guidelinepg "github.com/hyperlocalise/hyperlocalise/internal/guidelines/postgres"
	guidelineindex "github.com/hyperlocalise/hyperlocalise/internal/guidelines/turbopuffer"
)

func (h *handler) requireGuidelines(w http.ResponseWriter) bool {
	if h.guidelines == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "guideline_search_not_configured"})
		return false
	}
	return true
}

func (h *handler) syncGuidelines(w http.ResponseWriter, r *http.Request) {
	if !h.requireGuidelines(w) {
		return
	}
	var scope guidelines.Scope
	if !decodeProviderRequest(w, r, &scope) {
		return
	}
	if err := h.guidelines.Sync(r.Context(), scope); err != nil {
		writeProviderError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *handler) searchGuidelines(w http.ResponseWriter, r *http.Request) {
	if !h.requireGuidelines(w) {
		return
	}
	var req struct {
		Scope guidelines.Scope `json:"scope"`
		Query string           `json:"query"`
		Limit int              `json:"limit"`
	}
	if !decodeProviderRequest(w, r, &req) {
		return
	}
	result, err := h.guidelines.Retrieve(r.Context(), req.Scope, req.Query, req.Limit)
	if err != nil {
		writeProviderError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// configureGuidelineSearch connects the optional index to canonical guidelines.
func configureGuidelineSearch(ctx context.Context) (*guidelines.Service, func(), error) {
	indexKey := strings.TrimSpace(os.Getenv("TURBOPUFFER_API_KEY"))
	if indexKey == "" {
		return nil, func() {}, nil
	}
	if os.Getenv("DATABASE_URL") == "" {
		return nil, nil, errors.New("DATABASE_URL is required for guideline retrieval")
	}
	index, err := guidelineindex.New(indexKey, os.Getenv("TURBOPUFFER_REGION"), os.Getenv("TURBOPUFFER_GUIDELINES_PREFIX"))
	if err != nil {
		return nil, nil, errors.New("invalid turbopuffer configuration")
	}
	source, err := guidelinepg.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return nil, nil, errors.New("cannot connect guideline database")
	}
	return guidelines.NewService(source, index), source.Close, nil
}
