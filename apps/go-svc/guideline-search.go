package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	guidelinepg "github.com/hyperlocalise/hyperlocalise/internal/guidelines/postgres"
	guidelineindex "github.com/hyperlocalise/hyperlocalise/internal/guidelines/turbopuffer"
	"github.com/hyperlocalise/hyperlocalise/internal/rerank"
)

func (h *handler) requireGuidelines(w http.ResponseWriter, r *http.Request) bool {
	if h.guidelines == nil {
		noteRequest(r, "code", "guideline_search_not_configured")
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "guideline_search_not_configured"})
		return false
	}
	return true
}

func (h *handler) syncGuidelines(w http.ResponseWriter, r *http.Request) {
	if !h.requireGuidelines(w, r) {
		return
	}
	var scope guidelines.Scope
	if !decodeProviderRequest(w, r, &scope) {
		return
	}
	if err := h.guidelines.Sync(r.Context(), scope); err != nil {
		writeProviderError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *handler) searchGuidelines(w http.ResponseWriter, r *http.Request) {
	if !h.requireGuidelines(w, r) {
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
		writeProviderError(w, r, err)
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
	var opts []guidelines.Option
	if reranker := newGuidelineReranker(); reranker != nil {
		opts = append(opts, guidelines.WithReranker(reranker))
	}
	return guidelines.NewService(source, index, opts...), source.Close, nil
}

// newGuidelineReranker returns nil when AI Gateway is not configured.
func newGuidelineReranker() guidelines.Reranker {
	apiKey := strings.TrimSpace(os.Getenv("AI_GATEWAY_API_KEY"))
	if apiKey == "" {
		slog.Warn("guideline_rerank_disabled", "reason", "missing_ai_gateway_api_key")
		return nil
	}
	baseURL := strings.TrimSpace(os.Getenv("AI_GATEWAY_BASE_URL"))
	if baseURL == "" {
		baseURL = defaultAIGatewayBaseURL
	}
	client, err := rerank.New(rerank.Config{BaseURL: baseURL, APIKey: apiKey})
	if err != nil {
		slog.Warn("guideline_rerank_disabled", "reason", "invalid_configuration")
		return nil
	}
	return loggingReranker{client: client}
}

type loggingReranker struct {
	client *rerank.Client
}

func (r loggingReranker) Rerank(ctx context.Context, query string, passages []string, topN int) ([]int, error) {
	order, err := r.client.Rerank(ctx, query, passages, topN)
	if err != nil && ctx.Err() == nil {
		slog.Warn("guideline_rerank_failed", "model", rerank.Model, "passages", len(passages), "error", err)
	}
	return order, err
}
