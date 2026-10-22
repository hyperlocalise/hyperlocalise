package main

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

var reportingRoutes = []struct{ method, path string }{
	{http.MethodGet, "/reports"},
	{http.MethodGet, "/reports/settings"},
	{http.MethodGet, "/reports/tasks/job_x"},
	{http.MethodPost, "/reports/rates"},
	{http.MethodPut, "/reports/budgets"},
	{http.MethodPut, "/reports/task-rates"},
	{http.MethodPost, "/reports/time-entries"},
	{http.MethodPatch, "/reports/time-entries/00000000-0000-0000-0000-000000000000"},
	{http.MethodDelete, "/reports/time-entries/00000000-0000-0000-0000-000000000000"},
	{http.MethodPost, "/reports/expenses"},
}

type erroringWorkspaceFlags struct{}

func (erroringWorkspaceFlags) Enabled(context.Context, string, string, string) (bool, error) {
	return false, errors.New("workos unavailable")
}

func TestReportingFeatureFlagFailsClosedOnEveryRoute(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	other := testenv.Seed(t, testenv.Options{Role: "admin"})
	for name, flags := range map[string]workspaceFlagChecker{
		"disabled": stubWorkspaceFlags{enabled: false},
		"errored":  erroringWorkspaceFlags{},
		"missing":  nil,
	} {
		h := workspaceHandler(scope, "admin", flags)
		for _, route := range reportingRoutes {
			rec := workspaceRequest(t, h, scope, route.method, scope.OrgPath(route.path), `{}`)
			require.Equal(t, http.StatusForbidden, rec.Code, name, route)
			require.JSONEq(t, `{"error":"feature_unavailable","message":"Reports is not enabled for this workspace"}`, rec.Body.String(), name, route)
		}
	}
	h := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: true})
	for _, route := range reportingRoutes {
		rec := workspaceRequest(t, h, scope, route.method, other.OrgPath(route.path), `{}`)
		require.Equal(t, http.StatusForbidden, rec.Code, route)
		require.Contains(t, rec.Body.String(), "organization_access_denied", route)
	}
}

func TestReportingCapabilityMatrix(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	scope.MustTeam(t, "default", "Default", "member")
	type outcome struct {
		status int
		code   string
	}
	allowed := func(code string) outcome { return outcome{http.StatusBadRequest, code} }
	costsForbidden := outcome{http.StatusForbidden, "report_costs_forbidden"}
	for _, role := range []string{"admin", "localization_manager", "developer", "reviewer", "translator", "member"} {
		billingWrite := role == "admin"
		billingRead := role == "admin" || role == "localization_manager"
		for _, tc := range []struct {
			method, path string
			want         outcome
		}{
			{http.MethodPost, "/reports/rates", map[bool]outcome{true: allowed("invalid_rate"), false: costsForbidden}[billingWrite]},
			{http.MethodPut, "/reports/budgets", map[bool]outcome{true: allowed("invalid_budget"), false: costsForbidden}[billingWrite]},
			{http.MethodPut, "/reports/task-rates", map[bool]outcome{true: allowed("invalid_task_rate"), false: costsForbidden}[billingWrite]},
			{http.MethodPost, "/reports/expenses", map[bool]outcome{true: allowed("invalid_expense"), false: costsForbidden}[billingWrite]},
			{http.MethodPost, "/reports/time-entries", map[bool]outcome{true: allowed("invalid_time_entry"), false: {http.StatusForbidden, "time_entry_forbidden"}}[role != "member"]},
			{http.MethodPatch, "/reports/time-entries/00000000-0000-0000-0000-000000000000", allowed("invalid_time_entry")},
			{http.MethodGet, "/reports?view=costs", map[bool]outcome{true: {http.StatusOK, ""}, false: costsForbidden}[billingRead]},
			{http.MethodGet, "/reports?view=bogus", allowed("invalid_report_query")},
		} {
			status, body := reportingSend(t, scope, role, tc.method, tc.path, `{}`)
			require.Equal(t, tc.want.status, status, role, tc.method, tc.path)
			if tc.want.code != "" {
				require.Equal(t, tc.want.code, body["error"], role, tc.method, tc.path)
			}
		}
		_, body := reportingSend(t, scope, role, http.MethodGet, "/reports/settings", "")
		settings := body["settings"].(map[string]any)
		require.Equal(t, billingRead, settings["financial"], role)
		require.Equal(t, billingWrite, settings["canManage"], role)
		_, body = reportingSend(t, scope, role, http.MethodGet, "/reports", "")
		require.Equal(t, billingRead, body["report"].(map[string]any)["financial"], role)
	}
}

func TestReportingTeamScopeHidesOtherTeams(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "translator"})
	theirs := scope.MustTeam(t, "theirs", "Theirs", "")
	hidden := mustReportingProject(t, scope, "rp_hidden", &theirs)
	jobID := mustReportingJob(t, scope, "job_hidden", &hidden)
	var entryID string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes)
        values ($1, $2, $3, $4, 'review', 'fr', now(), 10) returning id`,
		scope.OrganizationID, hidden, jobID, scope.UserID).Scan(&entryID))

	for _, tc := range []struct{ method, path, body, code string }{
		{http.MethodGet, "/reports/tasks/" + jobID, "", "job_not_found"},
		{http.MethodPost, "/reports/time-entries", `{"jobId":"` + jobID + `","step":"review","targetLocale":"fr","workDate":"2026-09-01","minutes":5}`, "job_not_found"},
		{http.MethodPatch, "/reports/time-entries/" + entryID, `{"minutes":5,"workDate":"2026-09-01"}`, "time_entry_not_found"},
		{http.MethodDelete, "/reports/time-entries/" + entryID, "", "time_entry_not_found"},
	} {
		status, body := reportingSend(t, scope, "translator", tc.method, tc.path, tc.body)
		require.Equal(t, http.StatusNotFound, status, tc.method, tc.path)
		require.Equal(t, tc.code, body["error"], tc.method, tc.path)
	}
	_, body := reportingSend(t, scope, "translator", http.MethodGet, "/reports?view=time", "")
	require.Empty(t, body["report"].(map[string]any)["rows"], "hidden projects stay out of the report")
	_, body = reportingSend(t, scope, "translator", http.MethodGet, "/reports/settings", "")
	require.Empty(t, body["settings"].(map[string]any)["projects"])
}

func TestReportingQueryPagingBoundariesAndGrouping(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	projectID := mustReportingProject(t, scope, "rp_paging", nil)
	jobA := mustReportingJob(t, scope, "job_a", &projectID)
	jobB := mustReportingJob(t, scope, "job_b", &projectID)
	ctx := t.Context()
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := scope.Pool.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}
	exec(`
        insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes)
        select $1, $2, $3, $4, 'translation', 'l' || i, '2026-08-10T00:00:00Z', 1 from generate_series(1, 201) i`,
		scope.OrganizationID, projectID, jobA, scope.UserID)
	page := func(n string) map[string]any {
		_, body := reportingSend(t, scope, "admin", http.MethodGet, "/reports?view=time&from=2026-08-10&to=2026-08-10&page="+n, "")
		return body["report"].(map[string]any)
	}
	first, second := page("1"), page("2")
	require.Len(t, first["rows"], reportPageSize)
	require.Equal(t, true, first["hasMore"])
	require.Len(t, second["rows"], 1)
	require.Equal(t, false, second["hasMore"])
	require.Equal(t, float64(2), second["page"])

	h := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: true})
	rec := workspaceRequest(t, h, scope, http.MethodGet, scope.OrgPath("/reports?view=time&from=2026-08-10&to=2026-08-10&format=csv&page=2"), "")
	require.Len(t, strings.Split(rec.Body.String(), "\r\n"), 202, "CSV exports every row regardless of page")

	for _, at := range []struct {
		workDate string
		minutes  int
	}{
		{"2026-08-31T23:59:59Z", 100}, {"2026-09-01T00:00:00Z", 1}, {"2026-09-03T23:59:59Z", 2}, {"2026-09-04T00:00:00Z", 1000},
	} {
		exec(`
            insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes)
            values ($1, $2, $3, $4, 'review', 'fr', $5::timestamptz, $6)`,
			scope.OrganizationID, projectID, jobB, scope.UserID, at.workDate, at.minutes)
	}
	exec(`
        insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes)
        values ($1, $2, $3, $4, 'review', 'fr', '2026-09-02T12:00:00Z', 4)`,
		scope.OrganizationID, projectID, jobA, scope.UserID)
	rows := func(query string) []map[string]any {
		_, body := reportingSend(t, scope, "admin", http.MethodGet, "/reports?step=review&from=2026-09-01&to=2026-09-03&"+query, "")
		var out []map[string]any
		for _, row := range body["report"].(map[string]any)["rows"].([]any) {
			out = append(out, row.(map[string]any))
		}
		return out
	}

	overview := rows("interval=week")
	require.Len(t, overview, 1, "the overview is not split by job")
	require.Nil(t, overview[0]["jobId"])
	require.Equal(t, "2026-08-31", overview[0]["period"], "weeks start on Monday in UTC")
	require.Equal(t, float64(7), overview[0]["minutes"], "only the first and last instants of the range are included")

	byJob := rows("interval=week&view=time")
	require.Len(t, byJob, 2)
	daily := rows("interval=day&view=time")
	periods := map[string]float64{}
	for _, row := range daily {
		periods[row["period"].(string)] += row["minutes"].(float64)
	}
	require.Equal(t, map[string]float64{"2026-09-01": 1, "2026-09-02": 4, "2026-09-03": 2}, periods)
	require.Equal(t, "2026-09-03", daily[0]["period"], "periods are ordered newest first")

	require.Len(t, rows("jobId="+jobB+"&view=time"), 1)
	require.Empty(t, rows("projectId=other"))
	require.Empty(t, rows("view=words"))
}

func TestReportingTargetLocaleKeepsUnlocalizedCosts(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	projectID := mustReportingProject(t, scope, "rp_locale", nil)
	_, err := scope.Pool.Exec(t.Context(), `
        insert into reporting_costs (organization_id, project_id, operation_key, kind, step, target_locale, amount_usd, basis)
        values ($1, $2, 'ai:locale', 'ai', 'translation', null, '1', 'reported'),
               ($1, $2, 'human:de', 'human', 'translation', 'de', '2', 'rate'),
               ($1, null, 'expense:org', 'expense', 'translation', null, '3', 'manual')`,
		scope.OrganizationID, projectID)
	require.NoError(t, err)
	_, body := reportingSend(t, scope, "admin", http.MethodGet, "/reports?view=costs&targetLocale=fr", "")
	kinds := map[string]any{}
	for _, raw := range body["report"].(map[string]any)["rows"].([]any) {
		row := raw.(map[string]any)
		kinds[row["kind"].(string)] = row["amountUsd"]
	}
	require.Equal(t, map[string]any{"ai": "1.00000000", "expense": "3.00000000"}, kinds,
		"null-locale costs stay, org-level costs show for financial readers, other locales drop")
}

func TestResolveReportingRatePrecedence(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	other := testenv.Seed(t, testenv.Options{Role: "admin"})
	ctx := t.Context()
	projectID := mustReportingProject(t, scope, "rp_resolve", nil)
	jobID := mustReportingJob(t, scope, "job_resolve", &projectID)
	rate := func(s *testenv.Scope, name, createdAt string) string {
		var id string
		require.NoError(t, s.Pool.QueryRow(ctx, `
            insert into reporting_rates (organization_id, name, source_locale, target_locale, step, basis, rate, created_at)
            values ($1, $2, 'en', 'fr', 'review', 'hour', '1', $3::timestamptz) returning id`,
			s.OrganizationID, name, createdAt).Scan(&id))
		return id
	}
	resolve := func() *reportingRate {
		got, err := resolveReportingRate(ctx, scope.Pool, scope.OrganizationID, projectID, jobID, "en", "fr", "review")
		require.NoError(t, err)
		return got
	}
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := scope.Pool.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}

	require.Nil(t, resolve(), "no budget means no rate")
	rate(scope, "Card", "2026-01-01T00:00:00Z")
	newest := rate(scope, "Card", "2026-02-01T00:00:00Z")
	exec(`insert into reporting_budgets (organization_id, project_id, budget, rate_card_name) values ($1, $2, '1', '')`, scope.OrganizationID, projectID)
	require.Nil(t, resolve(), "an empty rate card name means no rate")
	exec(`update reporting_budgets set rate_card_name='Card' where project_id=$1`, projectID)
	require.Equal(t, newest, resolve().ID, "the newest rate on the card wins")

	exec(`insert into reporting_task_rates (organization_id, job_id, step) values ($1, $2, 'review')`, scope.OrganizationID, jobID)
	require.Equal(t, newest, resolve().ID, "a task rate without rateId falls through to the card")
	pinned := rate(scope, "Pinned", "2025-01-01T00:00:00Z")
	exec(`update reporting_task_rates set rate_id=$1 where job_id=$2`, pinned, jobID)
	require.Equal(t, pinned, resolve().ID, "a task rate's rateId wins outright")
	foreign := rate(other, "Card", "2026-03-01T00:00:00Z")
	exec(`update reporting_task_rates set rate_id=$1 where job_id=$2`, foreign, jobID)
	require.Nil(t, resolve(), "a task rate pointing outside the org resolves to nothing, not the card")
}

func TestReportingBudgetSummaryEdges(t *testing.T) {
	scenario := func(t *testing.T, extra func(scope *testenv.Scope, projectID, jobID, wordRate string)) reportingBudgetSummary {
		t.Helper()
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		ctx := t.Context()
		exec := func(sql string, args ...any) {
			t.Helper()
			_, err := scope.Pool.Exec(ctx, sql, args...)
			require.NoError(t, err)
		}
		projectID := mustReportingProject(t, scope, "rp_edges", nil)
		jobID := mustReportingJob(t, scope, "job_edges", &projectID)
		failedJob := mustReportingJob(t, scope, "job_failed", &projectID)
		overriddenJob := mustReportingJob(t, scope, "job_override", &projectID)
		exec(`update jobs set status='failed' where id=$1`, failedJob)
		var wordRate, hourRate string
		require.NoError(t, scope.Pool.QueryRow(ctx, `
            insert into reporting_rates (organization_id, name, source_locale, target_locale, step, basis, rate, percentages)
            values ($1, 'Card', 'en', 'fr', 'translation', 'word', '1', '{"100": 0}') returning id`, scope.OrganizationID).Scan(&wordRate))
		require.NoError(t, scope.Pool.QueryRow(ctx, `
            insert into reporting_rates (organization_id, name, source_locale, target_locale, step, basis, rate)
            values ($1, 'Card', 'en', 'fr', 'review', 'hour', '60') returning id`, scope.OrganizationID).Scan(&hourRate))
		exec(`insert into reporting_budgets (organization_id, project_id, budget) values ($1, $2, '15')`, scope.OrganizationID, projectID)
		analysis := `
            insert into reporting_analyses (organization_id, project_id, job_id, step, segment_id, source_revision, source_locale, target_locale, words, billable, bucket, rate_id)
            values ($1, $2, $3, $4, $5, 'r1', 'en', 'fr', $6, true, $7, $8)`
		exec(analysis, scope.OrganizationID, projectID, jobID, "translation", "s1", 10, "100", wordRate)
		exec(analysis, scope.OrganizationID, projectID, jobID, "translation", "s2", 5, "new", wordRate)
		exec(analysis, scope.OrganizationID, projectID, jobID, "review", "s1", 100, "new", hourRate)
		exec(analysis, scope.OrganizationID, projectID, failedJob, "translation", "s1", 100, "new", wordRate)
		exec(analysis, scope.OrganizationID, projectID, overriddenJob, "translation", "s1", 100, "new", wordRate)
		exec(`insert into reporting_task_rates (organization_id, job_id, step, estimated_minutes) values ($1, $2, 'review', 30)`, scope.OrganizationID, jobID)
		exec(`insert into reporting_task_rates (organization_id, job_id, step, override_usd) values ($1, $2, 'translation', '7.5')`, scope.OrganizationID, overriddenJob)
		exec(`
            insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes)
            values ($1, $2, $3, $4, 'review', 'fr', now(), 45)`, scope.OrganizationID, projectID, jobID, scope.UserID)
		if extra != nil {
			extra(scope, projectID, jobID, wordRate)
		}
		summaries, err := budgetSummary(ctx, scope.Pool, scope.OrganizationID, []string{projectID})
		require.NoError(t, err)
		require.Len(t, summaries, 1)
		return summaries[0]
	}

	base := scenario(t, nil)
	require.Equal(t, "0.00000000", base.AccruedUSD)
	require.Equal(t, "12.50000000", base.OutstandingUSD)
	require.Equal(t, "12.50000000", base.ForecastUSD)
	require.Equal(t, "15.00000000", base.RemainingUSD)
	require.False(t, base.Incomplete)
	require.Equal(t, "none", base.SpendWarning)
	require.Equal(t, "approaching", base.ForecastWarning)

	for name, extra := range map[string]func(*testenv.Scope, string, string, string){
		"unknown word count": func(s *testenv.Scope, projectID, jobID, wordRate string) {
			_, err := s.Pool.Exec(t.Context(), `
                insert into reporting_analyses (organization_id, project_id, job_id, step, segment_id, source_revision, source_locale, target_locale, words, billable, bucket, rate_id)
                values ($1, $2, $3, 'translation', 's3', 'r1', 'en', 'fr', null, true, 'new', $4)`, s.OrganizationID, projectID, jobID, wordRate)
			require.NoError(t, err)
		},
		"unavailable bucket": func(s *testenv.Scope, projectID, jobID, wordRate string) {
			_, err := s.Pool.Exec(t.Context(), `
                insert into reporting_analyses (organization_id, project_id, job_id, step, segment_id, source_revision, source_locale, target_locale, words, billable, bucket, rate_id)
                values ($1, $2, $3, 'translation', 's3', 'r1', 'en', 'fr', 3, true, 'unavailable', $4)`, s.OrganizationID, projectID, jobID, wordRate)
			require.NoError(t, err)
		},
		"unrated work": func(s *testenv.Scope, projectID, jobID, _ string) {
			_, err := s.Pool.Exec(t.Context(), `
                insert into reporting_analyses (organization_id, project_id, job_id, step, segment_id, source_revision, source_locale, target_locale, words, billable, bucket)
                values ($1, $2, $3, 'translation', 's3', 'r1', 'en', 'fr', 3, true, 'new')`, s.OrganizationID, projectID, jobID)
			require.NoError(t, err)
		},
		"missing estimate": func(s *testenv.Scope, _, jobID, _ string) {
			_, err := s.Pool.Exec(t.Context(), `update reporting_task_rates set estimated_minutes=null where job_id=$1`, jobID)
			require.NoError(t, err)
		},
		"unpriced cost": func(s *testenv.Scope, projectID, _, _ string) {
			_, err := s.Pool.Exec(t.Context(), `
                insert into reporting_costs (organization_id, project_id, operation_key, kind, step, basis)
                values ($1, $2, 'manual:unpriced', 'human', 'translation', 'unpriced')`, s.OrganizationID, projectID)
			require.NoError(t, err)
		},
	} {
		t.Run(name, func(t *testing.T) {
			require.True(t, scenario(t, extra).Incomplete)
		})
	}
}
