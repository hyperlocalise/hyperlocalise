package main

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

type timeEntryFixture struct {
	scope     *testenv.Scope
	projectID string
	jobID     string
}

func seedTimeEntryFixture(t *testing.T) timeEntryFixture {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	scope.MustTeam(t, "default", "Default", "member")
	projectID := mustReportingProject(t, scope, "rp_time", nil)
	jobID := mustReportingJob(t, scope, "job_time", &projectID)
	ctx := t.Context()
	_, err := scope.Pool.Exec(ctx, `update jobs set input_payload='{"sourceLocale":"en"}' where id=$1`, jobID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(ctx, `
        insert into reporting_rates (organization_id, name, source_locale, target_locale, step, basis, rate)
        values ($1, 'Card', 'en', 'fr', 'review', 'hour', '60'), ($1, 'Card', 'en', 'fr', 'translation', 'word', '0.10')`,
		scope.OrganizationID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(ctx, `insert into reporting_budgets (organization_id, project_id, budget, rate_card_name) values ($1, $2, '100', 'Card')`,
		scope.OrganizationID, projectID)
	require.NoError(t, err)
	return timeEntryFixture{scope: scope, projectID: projectID, jobID: jobID}
}

func (f timeEntryFixture) post(t *testing.T, role, body string) (int, map[string]any) {
	t.Helper()
	return reportingSend(t, f.scope, role, http.MethodPost, "/reports/time-entries", body)
}

func (f timeEntryFixture) entryBody(step, locale string, minutes string) string {
	return `{"jobId":"` + f.jobID + `","step":"` + step + `","targetLocale":"` + locale + `","workDate":"2026-09-01","minutes":` + minutes + `}`
}

func (f timeEntryFixture) cost(t *testing.T, entryID string) (amount, basis *string, createdAt string, voided bool, found bool) {
	t.Helper()
	err := f.scope.Pool.QueryRow(t.Context(), `
        select amount_usd::text, basis, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI'), voided
        from reporting_costs where operation_key=$1`, "time:"+entryID).Scan(&amount, &basis, &createdAt, &voided)
	if isNoRows(err) {
		return nil, nil, "", false, false
	}
	require.NoError(t, err)
	return amount, basis, createdAt, voided, true
}

func (f timeEntryFixture) audits(t *testing.T, entryID, action string) int {
	t.Helper()
	var n int
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `select count(*) from reporting_audit where resource_id=$1 and action=$2`,
		entryID, action).Scan(&n))
	return n
}

func TestReportingTimeEntryCreateAgainstPostgres(t *testing.T) {
	f := seedTimeEntryFixture(t)

	status, body := f.post(t, "member", f.entryBody("review", "fr", "45"))
	require.Equal(t, http.StatusForbidden, status)
	require.Equal(t, "time_entry_forbidden", body["error"])

	for _, invalid := range []string{"{", f.entryBody("review", "fr", "0"), f.entryBody("review", "fr", `"45"`)} {
		status, body = f.post(t, "translator", invalid)
		require.Equal(t, http.StatusBadRequest, status, invalid)
		require.Equal(t, "invalid_time_entry", body["error"])
	}

	status, body = f.post(t, "translator", f.entryBody("review", "fr", "45"))
	require.Equal(t, http.StatusCreated, status)
	hourly := body["timeEntry"].(map[string]any)["id"].(string)
	amount, basis, createdAt, _, found := f.cost(t, hourly)
	require.True(t, found)
	require.Equal(t, "45.00000000", *amount)
	require.Equal(t, "rate", *basis)
	require.Equal(t, "2026-09-01T00:00", createdAt, "the cost is dated on the work date")
	require.Equal(t, 1, f.audits(t, hourly, "time_created"))
	var rollouts int
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `select count(*) from reporting_rollout where id=1`).Scan(&rollouts))
	require.Equal(t, 1, rollouts)

	_, body = f.post(t, "translator", f.entryBody("translation", "fr", "30"))
	_, _, _, _, found = f.cost(t, body["timeEntry"].(map[string]any)["id"].(string))
	require.False(t, found, "word-rate work has no time cost")

	_, body = f.post(t, "translator", f.entryBody("review", "de", "30"))
	amount, basis, _, _, found = f.cost(t, body["timeEntry"].(map[string]any)["id"].(string))
	require.True(t, found)
	require.Nil(t, amount)
	require.Equal(t, "unpriced", *basis)

	_, err := f.scope.Pool.Exec(t.Context(), `insert into reporting_task_rates (organization_id, job_id, step, override_usd) values ($1, $2, 'review', '10')`,
		f.scope.OrganizationID, f.jobID)
	require.NoError(t, err)
	_, body = f.post(t, "translator", f.entryBody("review", "fr", "30"))
	_, _, _, _, found = f.cost(t, body["timeEntry"].(map[string]any)["id"].(string))
	require.False(t, found, "a task override replaces time costs")

	unscoped := mustReportingJob(t, f.scope, "job_unscoped", nil)
	status, body = f.post(t, "admin", strings.Replace(f.entryBody("review", "fr", "5"), f.jobID, unscoped, 1))
	require.Equal(t, http.StatusNotFound, status)
	require.Equal(t, "job_not_found", body["error"])

	_, err = f.scope.Pool.Exec(t.Context(), `
        insert into external_job_details (job_id, organization_id, provider_kind, external_job_id, external_status)
        values ($1, $2, 'crowdin', 'ext-1', 'open')`, f.jobID, f.scope.OrganizationID)
	require.NoError(t, err)
	status, body = f.post(t, "translator", f.entryBody("review", "fr", "5"))
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "native_job_required", body["error"])
}

type failingRolloutPool struct{ dictionaryPool }

func (p failingRolloutPool) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if strings.Contains(sql, "reporting_rollout") {
		return pgconn.CommandTag{}, context.DeadlineExceeded
	}
	return p.dictionaryPool.Exec(ctx, sql, args...)
}

func TestReportingTimeEntryRolloutFailureKeepsEntry(t *testing.T) {
	f := seedTimeEntryFixture(t)
	h := workspaceHandler(f.scope, "translator", stubWorkspaceFlags{enabled: true})
	h.workspace.pool = failingRolloutPool{h.workspace.pool}
	rec := workspaceRequest(t, h, f.scope, http.MethodPost, f.scope.OrgPath("/reports/time-entries"), f.entryBody("review", "fr", "45"))
	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.Contains(t, rec.Body.String(), "internal_error")

	var entryID string
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `select id from reporting_time_entries where job_id=$1`, f.jobID).Scan(&entryID))
	_, _, _, _, found := f.cost(t, entryID)
	require.True(t, found, "the transaction committed before the rollout failed")
	require.Equal(t, 1, f.audits(t, entryID, "time_created"))
}

func TestReportingTimeEntryEditAndVoidAgainstPostgres(t *testing.T) {
	f := seedTimeEntryFixture(t)
	other := testenv.Seed(t, testenv.Options{Role: "admin"})
	_, body := f.post(t, "translator", strings.Replace(f.entryBody("review", "fr", "45"), `"minutes"`, `"note":"keep me","minutes"`, 1))
	own := body["timeEntry"].(map[string]any)["id"].(string)
	var theirs string
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `
        insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes)
        values ($1, $2, $3, $4, 'review', 'fr', now(), 10) returning id`,
		f.scope.OrganizationID, f.projectID, f.jobID, other.UserID).Scan(&theirs))
	patch := func(role, id, body string) (int, map[string]any) {
		return reportingSend(t, f.scope, role, http.MethodPatch, "/reports/time-entries/"+id, body)
	}
	del := func(role, id string) (int, map[string]any) {
		return reportingSend(t, f.scope, role, http.MethodDelete, "/reports/time-entries/"+id, "")
	}

	status, body := patch("translator", own, `{"minutes":90,"workDate":"2026-09-03"}`)
	require.Equal(t, http.StatusOK, status)
	require.Equal(t, own, body["timeEntry"].(map[string]any)["id"])
	amount, _, createdAt, _, _ := f.cost(t, own)
	require.Equal(t, "90.00000000", *amount)
	require.Equal(t, "2026-09-03T00:00", createdAt)
	var note *string
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `select note from reporting_time_entries where id=$1`, own).Scan(&note))
	require.Equal(t, "keep me", *note, "an omitted note is kept")
	require.Equal(t, 1, f.audits(t, own, "time_updated"))

	status, body = patch("member", own, `{"minutes":5,"workDate":"2026-09-03"}`)
	require.Equal(t, http.StatusForbidden, status, "PATCH requires jobs:write even for the owner")
	require.Equal(t, "time_entry_forbidden", body["error"])
	status, _ = patch("localization_manager", theirs, `{"minutes":5,"workDate":"2026-09-03"}`)
	require.Equal(t, http.StatusForbidden, status)
	status, _ = patch("admin", theirs, `{"minutes":5,"workDate":"2026-09-03"}`)
	require.Equal(t, http.StatusOK, status)
	status, body = patch("admin", own, `{"minutes":5}`)
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "invalid_time_entry", body["error"])

	status, body = patch("admin", "not-a-uuid", `{"minutes":5}`)
	require.Equal(t, http.StatusBadRequest, status, "the body is validated before the id")
	require.Equal(t, "invalid_time_entry", body["error"])
	status, body = patch("admin", "not-a-uuid", `{"minutes":5,"workDate":"2026-09-03"}`)
	require.Equal(t, http.StatusInternalServerError, status, "a non-UUID id fails the query, as in Hono")
	require.Equal(t, "internal_error", body["error"])
	status, _ = del("admin", "not-a-uuid")
	require.Equal(t, http.StatusInternalServerError, status)

	status, _ = del("localization_manager", theirs)
	require.Equal(t, http.StatusForbidden, status)
	status, body = del("member", own)
	require.Equal(t, http.StatusNoContent, status, "DELETE has no jobs:write check")
	require.Nil(t, body)
	_, _, _, voided, _ := f.cost(t, own)
	require.True(t, voided)
	status, _ = patch("translator", own, `{"minutes":5,"workDate":"2026-09-03"}`)
	require.Equal(t, http.StatusNotFound, status, "PATCH ignores voided entries")
	status, _ = del("translator", own)
	require.Equal(t, http.StatusNoContent, status, "DELETE does not filter voided entries")
	require.Equal(t, 2, f.audits(t, own, "time_voided"))
}
