package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/gsc"
	"golang.org/x/oauth2"
)

const maxGscBodyBytes = 64 << 10

type gscService interface {
	ListSites(ctx context.Context, accessToken string) ([]gsc.Site, error)
	QuerySearchAnalytics(
		ctx context.Context,
		accessToken string,
		siteURL string,
		request gsc.SearchAnalyticsRequest,
	) ([]gsc.SearchAnalyticsRow, error)
	InspectURL(
		ctx context.Context,
		accessToken string,
		siteURL string,
		inspectionURL string,
		languageCode string,
	) (*gsc.URLInspectionResult, error)
}

type liveGscService struct{}

func newGscClient(accessToken string) (*gsc.Client, error) {
	return gsc.NewClient(gsc.Config{
		TokenSource: oauth2.StaticTokenSource(&oauth2.Token{AccessToken: accessToken}),
	})
}

func (liveGscService) ListSites(ctx context.Context, accessToken string) ([]gsc.Site, error) {
	client, err := newGscClient(accessToken)
	if err != nil {
		return nil, err
	}
	return client.ListSites(ctx)
}

func (liveGscService) QuerySearchAnalytics(
	ctx context.Context,
	accessToken string,
	siteURL string,
	request gsc.SearchAnalyticsRequest,
) ([]gsc.SearchAnalyticsRow, error) {
	client, err := newGscClient(accessToken)
	if err != nil {
		return nil, err
	}
	return client.QuerySearchAnalytics(ctx, siteURL, request)
}

func (liveGscService) InspectURL(
	ctx context.Context,
	accessToken string,
	siteURL string,
	inspectionURL string,
	languageCode string,
) (*gsc.URLInspectionResult, error) {
	client, err := newGscClient(accessToken)
	if err != nil {
		return nil, err
	}
	return client.InspectURL(ctx, siteURL, inspectionURL, languageCode)
}

type gscAccessTokenRequest struct {
	AccessToken string `json:"accessToken"`
}

type gscSitesResponse struct {
	Sites []gsc.Site `json:"sites"`
}

type gscPerformanceRequest struct {
	AccessToken string   `json:"accessToken"`
	SiteURL     string   `json:"siteUrl"`
	DateRange   string   `json:"dateRange"`
	StartDate   string   `json:"startDate"`
	EndDate     string   `json:"endDate"`
	Dimensions  []string `json:"dimensions"`
	Country     string   `json:"country"`
	RowLimit    int      `json:"rowLimit"`
	Type        string   `json:"type"`
	DataState   string   `json:"dataState"`
}

type gscPerformanceResponse struct {
	Rows      []gsc.SearchAnalyticsRow `json:"rows"`
	StartDate string                   `json:"startDate"`
	EndDate   string                   `json:"endDate"`
}

type gscInspectRequest struct {
	AccessToken   string `json:"accessToken"`
	SiteURL       string `json:"siteUrl"`
	InspectionURL string `json:"inspectionUrl"`
	LanguageCode  string `json:"languageCode"`
}

type gscInspectResponse struct {
	Inspection *gsc.URLInspectionResult `json:"inspection"`
}

func (h *handler) listGscSites(w http.ResponseWriter, r *http.Request) {
	var req gscAccessTokenRequest
	if !decodeGscBody(w, r, &req) {
		return
	}
	accessToken, ok := requireGscAccessToken(w, req.AccessToken)
	if !ok {
		return
	}

	sites, err := h.gsc.ListSites(r.Context(), accessToken)
	if err != nil {
		writeGscError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, gscSitesResponse{Sites: sites})
}

func (h *handler) queryGscPerformance(w http.ResponseWriter, r *http.Request) {
	var req gscPerformanceRequest
	if !decodeGscBody(w, r, &req) {
		return
	}
	accessToken, ok := requireGscAccessToken(w, req.AccessToken)
	if !ok {
		return
	}
	siteURL := strings.TrimSpace(req.SiteURL)
	if siteURL == "" {
		writeBadRequest(w, "siteUrl is required")
		return
	}

	filters := make([]gsc.DimensionFilter, 0, 1)
	if country := strings.TrimSpace(req.Country); country != "" {
		filters = append(filters, gsc.DimensionFilter{
			Dimension:  gsc.DimensionCountry,
			Operator:   gsc.FilterOperatorEquals,
			Expression: country,
		})
	}

	request := gsc.BuildSearchAnalyticsRequest(gsc.PerformanceInput{
		Dimensions: req.Dimensions,
		DateRange:  gsc.DateRange(strings.TrimSpace(req.DateRange)),
		StartDate:  strings.TrimSpace(req.StartDate),
		EndDate:    strings.TrimSpace(req.EndDate),
		Filters:    filters,
		RowLimit:   req.RowLimit,
		Type:       req.Type,
		DataState:  req.DataState,
	}, time.Now().UTC())

	rows, err := h.gsc.QuerySearchAnalytics(r.Context(), accessToken, siteURL, request)
	if err != nil {
		writeGscError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, gscPerformanceResponse{
		Rows:      rows,
		StartDate: request.StartDate,
		EndDate:   request.EndDate,
	})
}

func (h *handler) inspectGscURL(w http.ResponseWriter, r *http.Request) {
	var req gscInspectRequest
	if !decodeGscBody(w, r, &req) {
		return
	}
	accessToken, ok := requireGscAccessToken(w, req.AccessToken)
	if !ok {
		return
	}

	inspection, err := h.gsc.InspectURL(
		r.Context(),
		accessToken,
		req.SiteURL,
		req.InspectionURL,
		req.LanguageCode,
	)
	if err != nil {
		writeGscError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, gscInspectResponse{Inspection: inspection})
}

func decodeGscBody(w http.ResponseWriter, r *http.Request, dest any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxGscBodyBytes))
	if err := decoder.Decode(dest); err != nil {
		if isRequestBodyTooLarge(err) {
			writePayloadTooLarge(w)
			return false
		}
		writeBadRequest(w, "invalid JSON body")
		return false
	}
	return true
}

func requireGscAccessToken(w http.ResponseWriter, accessToken string) (string, bool) {
	trimmed := strings.TrimSpace(accessToken)
	if trimmed == "" {
		writeBadRequest(w, "accessToken is required")
		return "", false
	}
	return trimmed, true
}

func writeGscError(w http.ResponseWriter, err error) {
	status := http.StatusBadGateway
	code := "gsc_upstream_unavailable"
	message := "Search Console request failed"
	if typed, ok := gsc.AsError(err); ok {
		code = string(typed.Code)
		if typed.Message != "" {
			message = typed.Message
		}
		switch typed.Code {
		case gsc.ErrorCodeValidation:
			status = http.StatusBadRequest
		case gsc.ErrorCodeRateLimited:
			status = http.StatusTooManyRequests
		case gsc.ErrorCodeAuthFailed:
			status = http.StatusUnauthorized
		case gsc.ErrorCodeNotFound:
			status = http.StatusNotFound
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   code,
		"message": message,
	})
}
