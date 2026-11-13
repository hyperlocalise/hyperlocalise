package main

import (
	"errors"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/gsc"
	"github.com/stretchr/testify/require"
)

func TestGscDateRangeAndCountry(t *testing.T) {
	require.True(t, isGscDateRange("last_7_days"))
	require.True(t, isGscDateRange(string(gsc.DateRangeLast12Months)))
	require.False(t, isGscDateRange("last_16_months"))
	require.False(t, isGscDateRange("custom"))

	require.Equal(t, "fra", gscCountryForMarket("france-fr"))
	require.Equal(t, "deu", gscCountryForMarket("germany-de"))
	require.Equal(t, "jpn", gscCountryForMarket("japan-ja"))
	require.Equal(t, "vnm", gscCountryForMarket("vietnam-vi"))
	require.Empty(t, gscCountryForMarket("united-states-en"))
}

func TestGscPerformanceRequestFor(t *testing.T) {
	request := gscPerformanceRequestFor("last_28_days", []string{gsc.DimensionQuery}, "fra", 25)
	require.Equal(t, []string{gsc.DimensionQuery}, request.Dimensions)
	require.NotEmpty(t, request.StartDate)
	require.NotEmpty(t, request.EndDate)
	require.Len(t, request.DimensionFilterGroups, 1)
	require.Equal(t, gsc.DimensionCountry, request.DimensionFilterGroups[0].Filters[0].Dimension)
	require.Equal(t, "fra", request.DimensionFilterGroups[0].Filters[0].Expression)

	unfiltered := gscPerformanceRequestFor("last_7_days", nil, "", 0)
	require.Empty(t, unfiltered.DimensionFilterGroups)
}

func TestSummarizeAndProjectGscRows(t *testing.T) {
	require.Equal(t, map[string]float64{"clicks": 0, "impressions": 0, "ctr": 0, "position": 0}, summarizeGscRows(nil))

	rows := []gsc.SearchAnalyticsRow{
		{Keys: []string{"seo"}, Clicks: 2, Impressions: 10, CTR: 0.2, Position: 4},
		{Keys: []string{""}, Clicks: 9, Impressions: 9, CTR: 1, Position: 1},
		{Clicks: 1, Impressions: 10, CTR: 0.1, Position: 8},
	}
	totals := summarizeGscRows(rows)
	require.InDelta(t, 12, totals["clicks"], 0.001)
	require.InDelta(t, 29, totals["impressions"], 0.001)
	require.InDelta(t, 12.0/29, totals["ctr"], 0.001)
	require.InDelta(t, (4*10+1*9+8*10)/29.0, totals["position"], 0.001)

	require.Equal(t, []map[string]any{gscMetric(rows[0], "date", "seo")}, seriesFromDateRows(rows))
	require.Equal(t, []map[string]any{gscMetric(rows[0], "query", "seo")}, queryRowsFromGsc(rows))
	require.Equal(t, []map[string]any{gscMetric(rows[0], "page", "seo")}, pageRowsFromGsc(rows))
	require.Empty(t, seriesFromDateRows(nil))
}

func TestGscProviderError(t *testing.T) {
	cases := []struct {
		code       gsc.ErrorCode
		message    string
		wantStatus int
		wantCode   string
	}{
		{gsc.ErrorCodeValidation, "bad range", 400, string(gsc.ErrorCodeValidation)},
		{gsc.ErrorCodeRateLimited, "slow down", 429, string(gsc.ErrorCodeRateLimited)},
		{gsc.ErrorCodeAuthFailed, "denied", 401, string(gsc.ErrorCodeAuthFailed)},
		{gsc.ErrorCodeNotFound, "missing", 404, string(gsc.ErrorCodeNotFound)},
		{gsc.ErrorCodeUpstreamUnavailable, "down", 503, string(gsc.ErrorCodeUpstreamUnavailable)},
		{gsc.ErrorCode("gsc_other"), "", 400, "gsc_other"},
	}
	for _, tc := range cases {
		err := gscProviderError(&gsc.Error{Code: tc.code, Message: tc.message})
		var failure *workspaceError
		require.ErrorAs(t, err, &failure)
		require.Equal(t, tc.wantStatus, failure.status)
		require.Equal(t, tc.wantCode, failure.code)
		if tc.message == "" {
			require.Equal(t, "Search Console request failed", failure.message)
		}
	}

	err := gscProviderError(errors.New("network"))
	var failure *workspaceError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, 503, failure.status)
	require.Equal(t, "gsc_upstream_unavailable", failure.code)
}

func TestNilIfEmpty(t *testing.T) {
	require.Nil(t, nilIfEmpty(""))
	require.Equal(t, "example.com", nilIfEmpty("example.com"))
}
