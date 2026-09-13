package main

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/gsc"
	"github.com/stretchr/testify/require"
)

type fakeGsc struct {
	sites        []gsc.Site
	sitesErr     error
	rows         []gsc.SearchAnalyticsRow
	rowsErr      error
	inspection   *gsc.URLInspectionResult
	inspectErr   error
	lastSiteURL  string
	lastRequest  gsc.SearchAnalyticsRequest
	lastInspect  string
	lastLanguage string
}

func (f *fakeGsc) ListSites(_ context.Context, _ string) ([]gsc.Site, error) {
	return f.sites, f.sitesErr
}

func (f *fakeGsc) QuerySearchAnalytics(
	_ context.Context,
	_ string,
	siteURL string,
	request gsc.SearchAnalyticsRequest,
) ([]gsc.SearchAnalyticsRow, error) {
	f.lastSiteURL = siteURL
	f.lastRequest = request
	return f.rows, f.rowsErr
}

func (f *fakeGsc) InspectURL(
	_ context.Context,
	_ string,
	_ string,
	inspectionURL string,
	languageCode string,
) (*gsc.URLInspectionResult, error) {
	f.lastInspect = inspectionURL
	f.lastLanguage = languageCode
	return f.inspection, f.inspectErr
}

func TestListGscSitesRequiresAccessToken(t *testing.T) {
	h := newHandler()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/domains/gsc/sites", bytes.NewBufferString(`{}`))

	h.listGscSites(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "accessToken is required")
}

func TestListGscSitesReturnsProperties(t *testing.T) {
	service := &fakeGsc{
		sites: []gsc.Site{{
			SiteURL:         "sc-domain:hyperlocalise.com",
			PermissionLevel: "siteOwner",
		}},
	}
	h := newHandler()
	h.gsc = service
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/domains/gsc/sites", bytes.NewBufferString(`{
		"accessToken":"ya29.token"
	}`))

	h.listGscSites(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), "sc-domain:hyperlocalise.com")
}

func TestQueryGscPerformanceAppliesCountryFilter(t *testing.T) {
	service := &fakeGsc{
		rows: []gsc.SearchAnalyticsRow{{
			Keys:        []string{"traduction automatique"},
			Clicks:      42,
			Impressions: 900,
			CTR:         0.046,
			Position:    8.2,
		}},
	}
	h := newHandler()
	h.gsc = service
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/domains/gsc/performance", bytes.NewBufferString(`{
		"accessToken":"ya29.token",
		"siteUrl":"sc-domain:hyperlocalise.com",
		"dateRange":"last_28_days",
		"dimensions":["query"],
		"country":"fra"
	}`))

	h.queryGscPerformance(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "sc-domain:hyperlocalise.com", service.lastSiteURL)
	require.Equal(t, []string{gsc.DimensionQuery}, service.lastRequest.Dimensions)
	require.Len(t, service.lastRequest.DimensionFilterGroups, 1)
	require.Equal(t, gsc.DimensionCountry, service.lastRequest.DimensionFilterGroups[0].Filters[0].Dimension)
	require.Equal(t, "fra", service.lastRequest.DimensionFilterGroups[0].Filters[0].Expression)
	require.Contains(t, rec.Body.String(), "traduction automatique")
}

func TestInspectGscURLMapsAuthError(t *testing.T) {
	h := newHandler()
	h.gsc = &fakeGsc{
		inspectErr: &gsc.Error{
			Code:    gsc.ErrorCodeAuthFailed,
			Message: "Search Console denied access to this property.",
		},
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/domains/gsc/inspect", bytes.NewBufferString(`{
		"accessToken":"ya29.token",
		"siteUrl":"sc-domain:hyperlocalise.com",
		"inspectionUrl":"https://hyperlocalise.com/fr"
	}`))

	h.inspectGscURL(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)
	require.Contains(t, rec.Body.String(), "gsc_auth_failed")
}

func TestInspectGscURLReturnsResult(t *testing.T) {
	h := newHandler()
	h.gsc = &fakeGsc{
		inspection: &gsc.URLInspectionResult{
			IndexStatusResult: &gsc.IndexStatusResult{
				Verdict:       "PASS",
				CoverageState: "Submitted and indexed",
			},
		},
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/domains/gsc/inspect", bytes.NewBufferString(`{
		"accessToken":"ya29.token",
		"siteUrl":"sc-domain:hyperlocalise.com",
		"inspectionUrl":"https://hyperlocalise.com/fr",
		"languageCode":"fr-FR"
	}`))

	h.inspectGscURL(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), "Submitted and indexed")
}
