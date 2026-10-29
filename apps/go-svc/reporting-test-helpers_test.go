package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

// reportingTestToday is the fixed "today" the Reports tests read against.
var reportingTestToday = time.Date(2026, 6, 15, 12, 0, 0, 0, time.UTC)

func reportingTestAPI(scope *testenv.Scope, role string, flags workspaceFlagChecker) *reportingAPI {
	api := newReportingAPI()
	api.pool = scope.Pool
	api.membership = scope.Membership(role)
	api.flags = flags
	api.now = func() time.Time { return reportingTestToday }
	return api
}

func reportingActorFor(scope *testenv.Scope, role string) reportingActor {
	return reportingActor{userID: scope.UserID, organizationID: scope.OrganizationID, role: role}
}

func reportingRequest(t *testing.T, api *reportingAPI, workosUserID, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: workosUserID}})
	api.registerInternal(mux)
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://127.0.0.1")
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

// reportingSend asks a Reports route as the seeded user in a role, with the flag on.
func reportingSend(t *testing.T, scope *testenv.Scope, role, method, path, body string) (int, map[string]any) {
	t.Helper()
	api := reportingTestAPI(scope, role, stubWorkspaceFlags{enabled: true})
	rec := reportingRequest(t, api, scope.WorkOSUserID, method, scope.OrgPath(path), body)
	var decoded map[string]any
	if strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json") && rec.Body.Len() > 0 {
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &decoded), rec.Body.String())
	}
	return rec.Code, decoded
}

func mustReportingProject(t *testing.T, scope *testenv.Scope, id string, teamID *string) string {
	t.Helper()
	id = id + "_" + strings.ReplaceAll(scope.Slug, "-", "")
	scope.MustProject(t, id, id)
	_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$1 where id=$2`, teamID, id)
	require.NoError(t, err)
	return id
}

func mustReportingJob(t *testing.T, scope *testenv.Scope, id string, projectID *string) string {
	t.Helper()
	id = id + "_" + scope.Slug
	_, err := scope.Pool.Exec(t.Context(), `
        insert into jobs (id, organization_id, project_id, kind, status, input_payload)
        values ($1, $2, $3, 'translation', 'queued', '{}'::jsonb)`,
		id, scope.OrganizationID, projectID)
	require.NoError(t, err)
	return id
}

// reportingSummaryRow is one by-task summary row; counts given as words only put one string
// with them, as the web fixture does. mustReportingSummary rebuilds the by-project rows from
// the by-task rows afterwards.
type reportingSummaryRow struct {
	projectID, jobID, targetLocale, step, bucket, source, day string
	payable                                                   bool
	sourceUnits, arrived, arrivedDone, abandoned, finished    int
	finishedByPerson, finishedUnchanged, uncounted            int
	// Other units, when a test reads them: finished characters, and arrived strings and characters.
	characters, charactersWithSpaces                               int
	arrivedStrings, arrivedCharacters, arrivedCharactersWithSpaces int
}

// reportingReadJSON asks a Reports route as a role and decodes its JSON answer.
func reportingReadJSON(t *testing.T, scope *testenv.Scope, role, path string) map[string]any {
	t.Helper()
	status, body := reportingSend(t, scope, role, http.MethodGet, path, "")
	require.Equal(t, http.StatusOK, status, path, body)
	return body
}

// reportingReadCSV asks a Reports route for a download and returns its lines.
func reportingReadCSV(t *testing.T, scope *testenv.Scope, role, path string) []string {
	t.Helper()
	api := reportingTestAPI(scope, role, stubWorkspaceFlags{enabled: true})
	rec := reportingRequest(t, api, scope.WorkOSUserID, http.MethodGet, scope.OrgPath(path), "")
	require.Equal(t, http.StatusOK, rec.Code, path, rec.Body.String())
	require.Equal(t, "text/csv; charset=utf-8", rec.Header().Get("Content-Type"))
	return strings.Split(rec.Body.String(), "\r\n")
}

// mustReportingTask inserts a task of a kind with a title and, for a visual workflow's task for
// people, the step it is for.
func mustReportingTask(t *testing.T, scope *testenv.Scope, id, projectID, kind, status, title, taskStep string) string {
	t.Helper()
	id = id + "_" + scope.Slug
	metadata := map[string]string{}
	if title != "" {
		metadata["title"] = title
	}
	if taskStep != "" {
		metadata["workflowTaskStep"] = taskStep
	}
	payload, err := json.Marshal(map[string]any{"metadata": metadata})
	require.NoError(t, err)
	if len(metadata) == 0 {
		payload = []byte("{}")
	}
	_, err = scope.Pool.Exec(t.Context(), `
        insert into jobs (id, organization_id, project_id, kind, status, input_payload)
        values ($1, $2, $3, $4, $5, $6::jsonb)`, id, scope.OrganizationID, projectID, kind, status, string(payload))
	require.NoError(t, err)
	return id
}

// mustReportingNamedProject adds a project with a name, leaving the scope's own project as is.
func mustReportingNamedProject(t *testing.T, scope *testenv.Scope, id, name string) string {
	t.Helper()
	own := scope.ProjectID
	id = id + "_" + strings.ReplaceAll(scope.Slug, "-", "")
	scope.MustProject(t, id, name)
	scope.ProjectID = own
	return id
}

func mustReportingSummary(t *testing.T, scope *testenv.Scope, rows []reportingSummaryRow) {
	t.Helper()
	ctx := t.Context()
	strings := func(n int) int {
		if n > 0 {
			return 1
		}
		return 0
	}
	for _, r := range rows {
		step, bucket, source := r.step, r.bucket, r.source
		if step == "" {
			step = "translation"
		}
		if bucket == "" {
			bucket = "new"
		}
		var jobID *string
		if r.jobID != "" {
			jobID = &r.jobID
		}
		projectID := r.projectID
		if projectID == "" {
			projectID = scope.ProjectID
		}
		arrivedStrings := strings(r.arrived)
		if r.arrivedStrings > 0 {
			arrivedStrings = r.arrivedStrings
		}
		_, err := scope.Pool.Exec(ctx, `
            insert into reporting_daily_by_task (organization_id, project_id, job_id, source_locale, target_locale,
                step, bucket, source, payable, day,
                source_words, source_strings, arrived_words, arrived_strings, arrived_done_words, arrived_done_strings,
                abandoned_words, abandoned_strings, finished_words, finished_strings,
                finished_by_person_words, finished_by_person_strings, finished_unchanged_words, finished_unchanged_strings,
                arrived_uncounted, finished_characters, finished_characters_with_spaces,
                arrived_characters, arrived_characters_with_spaces)
            values ($1, $2, $3, 'en-US', $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
			scope.OrganizationID, projectID, jobID, r.targetLocale, step, bucket, source, r.payable, r.day,
			r.sourceUnits, strings(r.sourceUnits), r.arrived, arrivedStrings, r.arrivedDone, strings(r.arrivedDone),
			r.abandoned, strings(r.abandoned), r.finished, strings(r.finished),
			r.finishedByPerson, strings(r.finishedByPerson), r.finishedUnchanged, strings(r.finishedUnchanged),
			r.uncounted, r.characters, r.charactersWithSpaces, r.arrivedCharacters, r.arrivedCharactersWithSpaces)
		require.NoError(t, err)
	}
	_, err := scope.Pool.Exec(ctx, `delete from reporting_daily_by_project where organization_id = $1`, scope.OrganizationID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(ctx, `
        insert into reporting_daily_by_project (organization_id, project_id, target_locale, step, bucket, source, day,
            source_words, source_strings, arrived_words, arrived_strings, arrived_done_words, arrived_done_strings,
            abandoned_words, abandoned_strings, finished_words, finished_strings,
            finished_by_person_words, finished_by_person_strings, finished_unchanged_words, finished_unchanged_strings,
            arrived_uncounted, finished_characters, finished_characters_with_spaces,
            arrived_characters, arrived_characters_with_spaces)
        select organization_id, project_id, target_locale, step, bucket, source, day,
            sum(source_words), sum(source_strings), sum(arrived_words), sum(arrived_strings), sum(arrived_done_words), sum(arrived_done_strings),
            sum(abandoned_words), sum(abandoned_strings), sum(finished_words), sum(finished_strings),
            sum(finished_by_person_words), sum(finished_by_person_strings), sum(finished_unchanged_words), sum(finished_unchanged_strings),
            sum(arrived_uncounted), sum(finished_characters), sum(finished_characters_with_spaces),
            sum(arrived_characters), sum(arrived_characters_with_spaces)
        from reporting_daily_by_task where organization_id = $1
        group by organization_id, project_id, target_locale, step, bucket, source, day`, scope.OrganizationID)
	require.NoError(t, err)
}

func some[T any](v T) *T { return &v }

// reportingSendRaw sends a request to a mux with no session and no service token.
func reportingSendRaw(t *testing.T, mux *http.ServeMux, method, path, body string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return reportingDecode(t, rec.Code, rec.Body.Bytes(), rec.Header().Get("Content-Type"))
}

func reportingDecode(t *testing.T, status int, body []byte, contentType string) (int, map[string]any) {
	t.Helper()
	var decoded map[string]any
	if strings.HasPrefix(contentType, "application/json") && len(body) > 0 {
		require.NoError(t, json.Unmarshal(body, &decoded), string(body))
	}
	return status, decoded
}
