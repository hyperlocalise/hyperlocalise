package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func activityQueryFrom(t *testing.T, rawQuery string) (reportingActivityQuery, error) {
	t.Helper()
	return parseReportingActivityQuery(httptest.NewRequest(http.MethodGet, "/activity?"+rawQuery, nil))
}

func TestReportingActivityQueryDefaults(t *testing.T) {
	query, err := activityQueryFrom(t, "")
	require.NoError(t, err)
	require.Equal(t, reportingActivityQuery{unit: "words", step: "translation", format: "json"}, query)

	query, err = activityQueryFrom(t, "from=2026-06-01&to=2026-06-07&projectId=p1&jobId=j1&targetLocale=fr-FR&unit=strings&step=review&format=csv&extra=ignored")
	require.NoError(t, err)
	require.Equal(t, reportingActivityQuery{
		from: "2026-06-01", to: "2026-06-07", projectID: "p1", jobID: "j1", targetLocale: "fr-FR",
		unit: "strings", step: "review", format: "csv",
	}, query)
}

func TestReportingActivityQueryRefusesWhatTheWebSchemaRefuses(t *testing.T) {
	for _, rawQuery := range []string{
		"from=2026-06-10&to=2026-06-01",
		"from=0000-01-01&to=0000-01-02",
		"from=1999-12-31",
		"from=2026-6-1",
		"from=2026-02-30",
		"from=2026-06-01T00:00:00Z",
		"unit=bytes",
		"unit=",
		"step=edit",
		"format=xml",
		"projectId=",
		"targetLocale=f",
		"targetLocale=" + strings.Repeat("x", 36),
		"unit=words&unit=strings",
	} {
		_, err := activityQueryFrom(t, rawQuery)
		var failure *reportingError
		require.ErrorAs(t, err, &failure, rawQuery)
		require.Equal(t, 400, failure.status, rawQuery)
		require.Equal(t, "invalid_report_query", failure.code, rawQuery)
	}
}

func TestReportingQueryLengthsCountUTF16Units(t *testing.T) {
	// A single astral character is two units: enough for a two-character minimum.
	_, err := activityQueryFrom(t, "targetLocale=%F0%9F%98%80")
	require.NoError(t, err)
}
