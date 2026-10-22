package main

import (
	"math"
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseReportQueryDefaultsAndCoercion(t *testing.T) {
	query, ok := parseReportQuery(url.Values{})
	require.True(t, ok)
	require.Equal(t, reportQuery{interval: "week", view: "overview", format: "json", page: 1}, query)

	for raw, page := range map[string]int{" 5 ": 5, "1e2": 100, "0x10": 16, "5.0": 5, "10000": 10000} {
		query, ok := parseReportQuery(url.Values{"page": {raw}})
		require.True(t, ok, raw)
		require.Equal(t, page, query.page, raw)
	}

	query, ok = parseReportQuery(url.Values{"view": {"costs", "bogus"}, "projectId": {""}})
	require.True(t, ok, "first repeated value wins")
	require.Equal(t, "costs", query.view)
	require.Empty(t, query.projectID)
}

func TestParseReportQueryRejects(t *testing.T) {
	for _, values := range []url.Values{
		{"page": {""}},
		{"page": {"5.5"}},
		{"page": {"0"}},
		{"page": {"10001"}},
		{"page": {"abc"}},
		{"page": {"Infinity"}},
		{"from": {""}},
		{"from": {"2026-02-29"}},
		{"to": {"2026-1-01"}},
		{"from": {"2026-09-06"}, "to": {"2026-09-01"}},
		{"step": {""}},
		{"step": {"draft"}},
		{"interval": {"month"}},
		{"view": {""}},
		{"format": {"xlsx"}},
	} {
		_, ok := parseReportQuery(values)
		require.False(t, ok, values)
	}
	_, ok := parseReportQuery(url.Values{"from": {"2026-09-06"}})
	require.True(t, ok, "from alone is not compared with the default to")
}

func TestJSNumberString(t *testing.T) {
	for _, tc := range []struct {
		value float64
		want  string
	}{
		{0, "0"},
		{math.Copysign(0, -1), "0"},
		{1, "1"},
		{-5, "-5"},
		{1500, "1500"},
		{1.5, "1.5"},
		{-1.5, "-1.5"},
		{0.000001, "0.000001"},
		{1e-7, "1e-7"},
		{1.5e-7, "1.5e-7"},
		{123456789012345680000, "123456789012345680000"},
		{1e21, "1e+21"},
		{-1e21, "-1e+21"},
		{1.2345e21, "1.2345e+21"},
		{1 << 53, "9007199254740992"},
		{1<<53 + 2, "9007199254740994"},
		{5e-324, "5e-324"},
		{1.7976931348623157e308, "1.7976931348623157e+308"},
		{math.NaN(), "NaN"},
		{math.Inf(1), "Infinity"},
		{math.Inf(-1), "-Infinity"},
	} {
		require.Equal(t, tc.want, jsNumberString(tc.value), tc.want)
	}
}

func TestReportCSVCell(t *testing.T) {
	require.Equal(t, `"a,""b"""`, reportCSVCell(`a,"b"`))
	require.Equal(t, `"'=IMPORTXML(""url"")"`, reportCSVCell(`=IMPORTXML("url")`))
	for _, prefix := range []string{"=", "+", "@", "-", "\t", "\r"} {
		require.Equal(t, `"'`+prefix+`x"`, reportCSVCell(prefix+"x"))
	}
	require.Equal(t, `""`, reportCSVCell(""))
	require.Equal(t, `"a=b"`, reportCSVCell("a=b"))
}

func TestReportCSV(t *testing.T) {
	project, bucket, amount := "proj_1", "100", "1.50000000"
	rows := []reportRow{{
		Period: "2026-09-07", ProjectID: &project, Step: "translation", Bucket: &bucket, Kind: "completion",
		Words: 12, DurationMs: -5, AmountUSD: &amount, Count: 2,
	}}
	header := `"period","projectId","jobId","targetLocale","step","bucket","kind","words","minutes","durationMs","inputTokens","outputTokens","unavailable","count"`
	row := `"2026-09-07","proj_1","","","translation","100","completion","12","0","'-5","0","0","0","2"`

	require.Equal(t, header+"\r\n"+row, reportCSV(rows, false))
	require.Equal(t, header+`,"amountUsd"`+"\r\n"+row+`,"1.50000000"`, reportCSV(rows, true))
	require.Equal(t, header, reportCSV(nil, false))
	require.False(t, strings.HasSuffix(reportCSV(rows, true), "\n"))
}
