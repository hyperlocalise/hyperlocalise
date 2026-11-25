package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRescoreQaQualityRecomputesFromRemainingFindings(t *testing.T) {
	stored := qaQuality{
		Model: "mqm", Version: 1, Threshold: 90,
		ByLocale: map[string]qaLocaleQuality{
			"de-DE": {WordCount: 20},
			"fr-FR": {WordCount: 20},
		},
		Penalties: map[string]string{"placeholder_mismatch": "critical"},
	}
	next := rescoreQaQuality(stored, []qaFindingTally{
		{CheckType: "glossary_violation", Severity: "warning", Locale: "de-DE", Count: 1},
		{CheckType: "placeholder_mismatch", Severity: "error", Locale: "fr-FR", Count: 1},
	}, map[string]string{"placeholder_mismatch": "minor"})

	require.Equal(t, qaLocaleQuality{Score: 95, Passed: true, WordCount: 20, PenaltyPoints: 1}, next.ByLocale["de-DE"])
	require.Equal(t, qaLocaleQuality{Score: 0, Passed: false, WordCount: 20, PenaltyPoints: 25, CriticalCount: 1}, next.ByLocale["fr-FR"])
	require.Equal(t, 35.0, next.Score)
	require.False(t, next.Passed)
	require.Equal(t, 40, next.WordCount)
	require.Equal(t, map[string]int{"terminology": 1, "design_and_markup": 25}, next.PenaltyByDimension)
	require.Equal(t, stored.Penalties, next.Penalties)
}

func TestRescoreQaQualityUsesCurrentPolicyForOlderScans(t *testing.T) {
	stored := qaQuality{Threshold: 95, ByLocale: map[string]qaLocaleQuality{"ja-JP": {WordCount: 3}}}
	next := rescoreQaQuality(stored, []qaFindingTally{
		{CheckType: "quality_estimate", Severity: "warning", Locale: "ja-JP", Count: 1},
	}, map[string]string{"quality_estimate": "major"})
	require.Equal(t, 5, next.PenaltyPoints)
	require.Equal(t, 0.0, next.Score)
	require.Equal(t, map[string]int{"accuracy": 5}, next.PenaltyByDimension)

	clean := rescoreQaQuality(stored, nil, nil)
	require.Equal(t, 100.0, clean.Score)
	require.True(t, clean.Passed)
}

func TestQaMqmScoreRoundsLikeTheWebApp(t *testing.T) {
	require.Equal(t, 66.67, qaMqmScore(1, 3))
	require.Equal(t, 97.5, qaMqmScore(5, 200))
	require.Equal(t, 0.0, qaMqmScore(50, 10))
	require.Equal(t, 100.0, qaMqmScore(0, 0))
	require.Equal(t, 0.0, qaMqmScore(1, 0))
}

func TestQaReportReviewRescoresTheRun(t *testing.T) {
	api, scope := qaReportTestAPI(t, "admin")
	ctx := t.Context()
	runID := mustQaRun(t, scope, scope.ProjectID, "succeeded", 1, 1, 0)
	_, err := scope.Pool.Exec(ctx, `update translation_qa_runs set summary = summary ||
        '{"quality":{"model":"mqm","version":1,"threshold":95,"score":75,"passed":false,"wordCount":20,"penaltyPoints":5,"criticalCount":0,"byLocale":{"de-DE":{"score":75,"passed":false,"wordCount":20,"penaltyPoints":5,"criticalCount":0}},"penaltyByDimension":{"accuracy":5},"penalties":{}}}'::jsonb
        where id=$1`, runID)
	require.NoError(t, err)
	findingID := mustQaFinding(t, scope, runID, scope.ProjectID, "rescore")

	readQuality := func() qaQuality {
		var raw []byte
		require.NoError(t, scope.Pool.QueryRow(ctx, `select summary->'quality' from translation_qa_runs where id=$1`, runID).Scan(&raw))
		var quality qaQuality
		require.NoError(t, json.Unmarshal(raw, &quality))
		return quality
	}

	rec := qaReportRequest(api, scope, http.MethodPost, scope.OrgPath("/qa-reports/findings/review"),
		`{"findingIds":["`+findingID+`"],"status":"ignored","reason":"Brand term"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	ignored := readQuality()
	require.Equal(t, 100.0, ignored.Score)
	require.True(t, ignored.Passed)
	require.Equal(t, 20, ignored.ByLocale["de-DE"].WordCount)

	rec = qaReportRequest(api, scope, http.MethodPost, scope.OrgPath("/qa-reports/findings/review"),
		`{"findingIds":["`+findingID+`"],"status":"open"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	reopened := readQuality()
	require.Equal(t, 75.0, reopened.Score)
	require.False(t, reopened.Passed)
}
