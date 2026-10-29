package main

import (
	"net/http"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func seedReportingActivity(t *testing.T) (*testenv.Scope, string) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	scope.MustTeam(t, "default", "Default", "member")
	return scope, scope.ProjectID
}

func noSources() map[string]any {
	return map[string]any{"memory": float64(0), "ai": float64(0), "person": float64(0), "import": float64(0), "unknown": float64(0)}
}

func TestReportingActivityAnswersInItsOwnEnvelope(t *testing.T) {
	scope, _ := seedReportingActivity(t)
	status, body := reportingSend(t, scope, "admin", http.MethodGet, "/reports/activity?from=2026-06-01&to=2026-06-07", "")
	require.Equal(t, http.StatusOK, status)
	activity := body["activity"].(map[string]any)
	require.Equal(t, map[string]any{
		"from": "2026-06-01", "to": "2026-06-07", "days": float64(7), "previousFrom": "2026-05-25",
		"previousTo": "2026-05-31", "interval": "day", "hasEarlierData": false,
	}, activity["period"])
	require.Equal(t, "words", activity["unit"])
	require.Equal(t, "translation", activity["step"])
	require.Equal(t, float64(0), activity["current"].(map[string]any)["arrived"])
	require.Equal(t, noSources(), activity["previous"].(map[string]any)["finishedBySource"])
	require.Len(t, activity["series"], 7)
	require.Equal(t, []any{}, activity["byLanguage"])
}

func TestReportingActivityIsForBillingRolesOnly(t *testing.T) {
	scope, _ := seedReportingActivity(t)
	for _, role := range []string{"developer", "reviewer", "translator", "member"} {
		status, body := reportingSend(t, scope, role, http.MethodGet, "/reports/activity", "")
		require.Equal(t, http.StatusForbidden, status, role)
		require.Equal(t, "report_costs_forbidden", body["error"], role)
		// The capability is checked before the query, as the web route does.
		status, _ = reportingSend(t, scope, role, http.MethodGet, "/reports/activity?unit=bogus", "")
		require.Equal(t, http.StatusForbidden, status, role)
	}
	status, _ := reportingSend(t, scope, "localization_manager", http.MethodGet, "/reports/activity", "")
	require.Equal(t, http.StatusOK, status)
}

func TestReportingActivityRejectsMalformedQueries(t *testing.T) {
	scope, _ := seedReportingActivity(t)
	for _, path := range []string{
		"/reports/activity?from=2026-06-10&to=2026-06-01",
		"/reports/activity?from=0000-01-01&to=0000-01-02",
		"/reports/activity?unit=pages",
		"/reports/activity?step=draft",
	} {
		status, body := reportingSend(t, scope, "admin", http.MethodGet, path, "")
		require.Equal(t, http.StatusBadRequest, status, path)
		require.Equal(t, "invalid_report_query", body["error"], path)
	}
}

func TestReportingActivityTotalsAPeriodAndTheOneBeforeItInOneRead(t *testing.T) {
	scope, _ := seedReportingActivity(t)
	mustReportingSummary(t, scope, []reportingSummaryRow{
		// This period: 100 words arrive in French, 60 of them finished; 30 reviewed. Of the 40
		// unfinished, 10 were in a task that was cancelled.
		{targetLocale: "fr-FR", day: "2026-06-10", sourceUnits: 100, arrived: 100, arrivedDone: 60, abandoned: 10, uncounted: 2},
		// 70 finished: 50 from the memory, 20 by a person who kept 15 as given.
		{targetLocale: "fr-FR", day: "2026-06-10", finished: 50, source: "memory"},
		{targetLocale: "fr-FR", day: "2026-06-10", finished: 20, finishedByPerson: 20, finishedUnchanged: 15, source: "person"},
		{targetLocale: "fr-FR", step: "review", day: "2026-06-11", arrived: 70, finished: 30},
		// The previous period, and a day outside both.
		{targetLocale: "fr-FR", day: "2026-06-03", sourceUnits: 40, arrived: 40, finished: 10, source: "unknown"},
		{targetLocale: "fr-FR", day: "2026-05-01", sourceUnits: 999, arrived: 999},
	})
	_, body := reportingSend(t, scope, "admin", http.MethodGet, "/reports/activity?from=2026-06-08&to=2026-06-14", "")
	activity := body["activity"].(map[string]any)
	require.Equal(t, map[string]any{
		"source": float64(100), "arrived": float64(100), "arrivedDone": float64(60), "abandoned": float64(10),
		"finished": float64(70), "reviewed": float64(30), "uncounted": float64(2),
		"finishedByPerson": float64(20), "finishedUnchanged": float64(15),
		"finishedBySource": map[string]any{"memory": float64(50), "ai": float64(0), "person": float64(20), "import": float64(0), "unknown": float64(0)},
	}, activity["current"])
	require.Equal(t, map[string]any{
		"source": float64(40), "arrived": float64(40), "arrivedDone": float64(0), "abandoned": float64(0),
		"finished": float64(10), "reviewed": float64(0), "uncounted": float64(0),
		"finishedByPerson": float64(0), "finishedUnchanged": float64(0),
		"finishedBySource": map[string]any{"memory": float64(0), "ai": float64(0), "person": float64(0), "import": float64(0), "unknown": float64(10)},
	}, activity["previous"])

	// What people finished and kept follows the chart's step; the strings unit reads other columns.
	_, body = reportingSend(t, scope, "admin", http.MethodGet, "/reports/activity?from=2026-06-08&to=2026-06-14&step=review&unit=strings", "")
	current := body["activity"].(map[string]any)["current"].(map[string]any)
	require.Equal(t, float64(0), current["finishedByPerson"])
	require.Equal(t, float64(1), current["source"])
	require.Equal(t, float64(2), current["finished"])

	// A project the viewer cannot open is never read, even when chosen.
	_, body = reportingSend(t, scope, "admin", http.MethodGet, "/reports/activity?from=2026-06-08&to=2026-06-14&projectId=project_other", "")
	require.Equal(t, float64(0), body["activity"].(map[string]any)["current"].(map[string]any)["arrived"])
}

func TestReportingActivityReadsALanguagesArrivalsAsItsSourceWordsUnderALanguageFilter(t *testing.T) {
	scope, _ := seedReportingActivity(t)
	// Six source words into two languages: source sits on the first language analysed only.
	mustReportingSummary(t, scope, []reportingSummaryRow{
		{targetLocale: "fr-FR", day: "2026-06-10", sourceUnits: 6, arrived: 6},
		{targetLocale: "de-DE", day: "2026-06-10", arrived: 6},
	})
	source := func(path string) float64 {
		_, body := reportingSend(t, scope, "admin", http.MethodGet, path, "")
		return body["activity"].(map[string]any)["current"].(map[string]any)["source"].(float64)
	}
	require.Equal(t, float64(6), source("/reports/activity?from=2026-06-08&to=2026-06-14"))
	require.Equal(t, float64(6), source("/reports/activity?from=2026-06-08&to=2026-06-14&targetLocale=de-DE"))
}

func TestReportingActivitySplitsFinishedWorkBySourceByDayAndByWeek(t *testing.T) {
	scope, _ := seedReportingActivity(t)
	mustReportingSummary(t, scope, []reportingSummaryRow{
		{targetLocale: "fr-FR", day: "2026-06-09", finished: 30, source: "ai"},
		{targetLocale: "fr-FR", day: "2026-06-09", finished: 20, finishedByPerson: 20, finishedUnchanged: 5, source: "person"},
		{targetLocale: "de-DE", day: "2026-06-09", finished: 10, source: "memory"},
		{targetLocale: "de-DE", day: "2026-06-13", finished: 5, finishedByPerson: 5, source: "person"},
		{targetLocale: "de-DE", step: "review", day: "2026-06-13", finished: 99},
	})
	_, body := reportingSend(t, scope, "admin", http.MethodGet, "/reports/activity?from=2026-06-08&to=2026-06-14", "")
	activity := body["activity"].(map[string]any)
	series := activity["series"].([]any)
	require.Len(t, series, 7)
	point := func(start string) map[string]any {
		for _, p := range series {
			if p.(map[string]any)["start"] == start {
				return p.(map[string]any)
			}
		}
		return nil
	}
	require.Equal(t, map[string]any{"start": "2026-06-09", "memory": float64(10), "ai": float64(30), "person": float64(20), "import": float64(0), "unknown": float64(0)}, point("2026-06-09"))
	require.Equal(t, map[string]any{"start": "2026-06-10", "memory": float64(0), "ai": float64(0), "person": float64(0), "import": float64(0), "unknown": float64(0)}, point("2026-06-10"))
	require.Equal(t, []any{
		map[string]any{"targetLocale": "fr-FR", "units": float64(50)},
		map[string]any{"targetLocale": "de-DE", "units": float64(15)},
	}, activity["byLanguage"])

	// Over 45 days the chart is weekly; weeks start on Monday, the first before the period.
	_, body = reportingSend(t, scope, "admin", http.MethodGet, "/reports/activity?from=2026-04-29&to=2026-06-14", "")
	weekly := body["activity"].(map[string]any)["series"].([]any)
	require.Equal(t, "2026-04-27", weekly[0].(map[string]any)["start"])
	require.Equal(t, map[string]any{"start": "2026-06-08", "memory": float64(10), "ai": float64(30), "person": float64(25), "import": float64(0), "unknown": float64(0)}, weekly[len(weekly)-1])
}

func TestReportingActivityDownloadsTheChartAsCSV(t *testing.T) {
	scope, _ := seedReportingActivity(t)
	mustReportingSummary(t, scope, []reportingSummaryRow{
		{targetLocale: "fr-FR", day: "2026-06-09", finished: 30, source: "ai"},
	})
	api := reportingTestAPI(scope, "admin", stubWorkspaceFlags{enabled: true})
	rec := reportingRequest(t, api, scope.WorkOSUserID, http.MethodGet, scope.OrgPath("/reports/activity?from=2026-06-08&to=2026-06-09&format=csv"), "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "text/csv; charset=utf-8", rec.Header().Get("Content-Type"))
	require.Equal(t, `attachment; filename="activity.csv"`, rec.Header().Get("Content-Disposition"))
	require.Equal(t, "\"start\",\"memory\",\"ai\",\"person\",\"import\",\"unknown\"\r\n"+
		"\"2026-06-08\",\"0\",\"0\",\"0\",\"0\",\"0\"\r\n"+
		"\"2026-06-09\",\"0\",\"30\",\"0\",\"0\",\"0\"", rec.Body.String())
}
