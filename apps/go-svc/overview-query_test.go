package main

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestFillOverviewDailySeries(t *testing.T) {
	now := time.Date(2026, 9, 4, 18, 30, 0, 0, time.UTC)
	series := fillOverviewDailySeries([]overviewDayCount{
		{Day: "2026-09-04", Count: 2},
		{Day: "2026-09-02", Count: 1},
	}, now)
	require.Equal(t, []int{0, 0, 0, 0, 1, 0, 2}, series)
	require.Equal(t, 3, sumOverviewSeries(series))
}

func TestResolveOverviewJobTitle(t *testing.T) {
	tests := []struct {
		name string
		job  overviewJobTitleInput
		want overviewResolvedTitle
	}{
		{
			name: "external title",
			job:  overviewJobTitleInput{ID: "job_1", Kind: "translation", ExternalTitle: strPtr(" Crowdin job ")},
			want: overviewResolvedTitle{Kind: "text", Text: "Crowdin job"},
		},
		{
			name: "metadata title",
			job: overviewJobTitleInput{
				ID:           "job_1",
				Kind:         "translation",
				InputPayload: []byte(`{"metadata":{"title":"Home page"}}`),
			},
			want: overviewResolvedTitle{Kind: "text", Text: "Home page"},
		},
		{
			name: "review criteria",
			job: overviewJobTitleInput{
				ID:             "job_1",
				Kind:           "review",
				ReviewCriteria: strPtr("terminology"),
			},
			want: overviewResolvedTitle{Kind: "review", Criteria: "terminology"},
		},
		{
			name: "sync job",
			job: overviewJobTitleInput{
				ID:                "job_1",
				Kind:              "sync",
				SyncConnectorKind: strPtr("github"),
				SyncDirection:     strPtr("push"),
			},
			want: overviewResolvedTitle{Kind: "sync", Direction: strPtr("push"), ConnectorKind: "github"},
		},
		{
			name: "source text",
			job: overviewJobTitleInput{
				ID:           "job_1",
				Kind:         "translation",
				InputPayload: []byte(`{"sourceText":"Hello world"}`),
			},
			want: overviewResolvedTitle{Kind: "text", Text: "Hello world"},
		},
		{
			name: "falls back to id",
			job:  overviewJobTitleInput{ID: "job_1", Kind: "translation", InputPayload: []byte(`{}`)},
			want: overviewResolvedTitle{Kind: "id", ID: "job_1"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, resolveOverviewJobTitle(tc.job))
		})
	}
}

func TestRankOverviewActivityPrefersFailedThenRecent(t *testing.T) {
	ranked := rankOverviewActivity([]overviewActivityItem{
		{ID: "ok-new", Status: "succeeded", UpdatedAt: "2026-09-04T12:00:00Z"},
		{ID: "failed-old", Status: "failed", UpdatedAt: "2026-09-01T12:00:00Z"},
		{ID: "failed-new", Status: "failed", UpdatedAt: "2026-09-03T12:00:00Z"},
		{ID: "ok-old", Status: "running", UpdatedAt: "2026-09-02T12:00:00Z"},
		{ID: "extra", Status: "queued", UpdatedAt: "2026-08-01T12:00:00Z"},
	})
	require.Equal(t, []string{"failed-new", "failed-old", "ok-new", "ok-old"}, activityIDs(ranked))
}

func TestFormatOverviewLocaleRoute(t *testing.T) {
	require.Equal(t, "en → fr-FR, de-DE +1", formatOverviewLocaleRoute(strPtr("en"), []string{"fr-FR", "de-DE", "ja-JP"}))
	require.Equal(t, "—", formatOverviewLocaleRoute(nil, nil))
}

func TestOverviewJobHrefFromEncodedJobID(t *testing.T) {
	href := overviewJobHref("acme", nil, "ext:crowdin:proj:job")
	require.NotNil(t, href)
	require.Equal(t, "/org/acme/projects/ext%3Acrowdin%3Aproj/jobs/ext%3Acrowdin%3Aproj%3Ajob", *href)
}

func TestRequestLogPathOverview(t *testing.T) {
	require.Equal(t, "/v1/orgs/{organizationSlug}/overview/{resource}", requestLogPath("/v1/orgs/acme/overview/metrics"))
}

func activityIDs(items []overviewActivityItem) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID)
	}
	return ids
}
