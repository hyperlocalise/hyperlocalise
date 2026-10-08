package main

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

const jobKindOptionsMessage = `Invalid option: expected one of "translation"|"research"|"review"|"proofread"|"sync"|"asset_management"`

func requireJobQueryIssues(t *testing.T, err error, expected []jobQueryIssue) {
	t.Helper()
	var failure *projectError
	require.True(t, errors.As(err, &failure), "expected projectError, got %v", err)
	require.Equal(t, http.StatusBadRequest, failure.status)
	require.Equal(t, "invalid_job_query", failure.code)
	require.Equal(t, "Invalid job query parameters", failure.message)
	require.Equal(t, map[string]any{"issues": expected}, failure.details)
}

func TestParseJobListQuery(t *testing.T) {
	t.Run("defaults", func(t *testing.T) {
		query, err := parseJobListQuery(url.Values{})
		require.NoError(t, err)
		require.Equal(t, jobListQuery{limit: 50}, query)
	})

	t.Run("accepts every filter", func(t *testing.T) {
		query, err := parseJobListQuery(url.Values{
			"kind": {"review"}, "type": {"file"}, "status": {"waiting_for_review"},
			"open": {"1"}, "triage": {"true"}, "relationship": {"assigned"}, "limit": {"100"},
			"unknown": {"ignored"},
		})
		require.NoError(t, err)
		require.Equal(t, jobListQuery{
			kind: "review", jobType: "file", status: "waiting_for_review",
			open: true, triage: true, relationship: "assigned", limit: 100,
		}, query)
	})

	t.Run("coerces booleans like JavaScript Boolean()", func(t *testing.T) {
		for _, tc := range []struct {
			raw  []string
			want bool
		}{
			{nil, false},
			{[]string{""}, false},
			{[]string{"false"}, true},
			{[]string{"0"}, true},
			{[]string{"", ""}, true},
		} {
			query, err := parseJobListQuery(url.Values{"open": tc.raw, "triage": tc.raw})
			require.NoError(t, err)
			require.Equal(t, tc.want, query.open, "%q", tc.raw)
			require.Equal(t, tc.want, query.triage, "%q", tc.raw)
		}
	})

	t.Run("coerces limit like JavaScript Number()", func(t *testing.T) {
		for raw, want := range map[string]int{
			"1": 1, "100": 100, " 5 ": 5, "\n7\t": 7, "\u00a05\ufeff": 5, "+5": 5, "5.": 5, "5.0": 5,
			".5e1": 5, "1e1": 10, "0x10": 16, "0X1f": 31, "0o7": 7, "0b11": 3,
		} {
			query, err := parseJobListQuery(url.Values{"limit": {raw}})
			require.NoError(t, err, "%q", raw)
			require.Equal(t, want, query.limit, "%q", raw)
		}
	})

	t.Run("reports zod limit issues", func(t *testing.T) {
		const (
			nan       = "Invalid input: expected number, received NaN"
			notInt    = "Invalid input: expected int, received number"
			tooSmall  = "Too small: expected number to be >=1"
			tooBig    = "Too big: expected number to be <=100"
			unsafeBig = "Too big: expected int to be <=9007199254740991"
			unsafeLow = "Too small: expected int to be >=-9007199254740991"
		)
		for _, tc := range []struct {
			raw      []string
			messages []string
		}{
			{[]string{""}, []string{tooSmall}},
			{[]string{"0"}, []string{tooSmall}},
			{[]string{"-0"}, []string{tooSmall}},
			{[]string{"-1"}, []string{tooSmall}},
			{[]string{"101"}, []string{tooBig}},
			{[]string{"1.5"}, []string{notInt}},
			{[]string{"100.5"}, []string{notInt}},
			{[]string{"1e-1"}, []string{notInt}},
			{[]string{"abc"}, []string{nan}},
			{[]string{"1_0"}, []string{nan}},
			{[]string{"0x"}, []string{nan}},
			{[]string{"-0x10"}, []string{nan}},
			{[]string{"e5"}, []string{nan}},
			{[]string{"."}, []string{nan}},
			{[]string{"5", "6"}, []string{nan}},
			{[]string{"Infinity"}, []string{"Invalid input: expected number, received Infinity"}},
			{[]string{"1e400"}, []string{"Invalid input: expected number, received Infinity"}},
			{[]string{"-Infinity"}, []string{"Invalid input: expected number, received -Infinity"}},
			{[]string{"9007199254740993"}, []string{unsafeBig, tooBig}},
			{[]string{"-1e20"}, []string{unsafeLow, tooSmall}},
		} {
			_, err := parseJobListQuery(url.Values{"limit": tc.raw})
			expected := make([]jobQueryIssue, len(tc.messages))
			for i, message := range tc.messages {
				expected[i] = jobQueryIssue{Path: []any{"limit"}, Message: message}
			}
			requireJobQueryIssues(t, err, expected)
		}
	})

	t.Run("rejects enum values that are invalid, empty, or repeated", func(t *testing.T) {
		for key, values := range map[string][]string{
			"kind":         {"x"},
			"type":         {"string", "file"},
			"status":       {"Queued"},
			"relationship": {""},
		} {
			_, err := parseJobListQuery(url.Values{key: values})
			var failure *projectError
			require.True(t, errors.As(err, &failure), key)
			issues := failure.details["issues"].([]jobQueryIssue)
			require.Len(t, issues, 1)
			require.Equal(t, []any{key}, issues[0].Path)
		}
		_, err := parseJobListQuery(url.Values{"relationship": {"mine"}})
		requireJobQueryIssues(t, err, []jobQueryIssue{{Path: []any{"relationship"}, Message: `Invalid option: expected one of "assigned"|"created"`}})
	})

	t.Run("orders issues by schema key", func(t *testing.T) {
		_, err := parseJobListQuery(url.Values{"limit": {"0"}, "kind": {"x"}})
		requireJobQueryIssues(t, err, []jobQueryIssue{
			{Path: []any{"kind"}, Message: jobKindOptionsMessage},
			{Path: []any{"limit"}, Message: "Too small: expected number to be >=1"},
		})
	})
}

func TestJSNumber(t *testing.T) {
	require.Equal(t, 0.0, jsNumber("   "))
	require.Equal(t, 255.0, jsNumber("0xff"))
	require.Equal(t, -2.5, jsNumber("-2.5"))
	require.True(t, math.IsNaN(jsNumber("0b2")))
	require.True(t, math.IsNaN(jsNumber("inf")))
	require.True(t, math.IsNaN(jsNumber("+0x1")))
}

func TestWriteProjectErrorDetails(t *testing.T) {
	rec := httptestRecorderForProjectError(t, projectFailureDetails(http.StatusBadRequest, "invalid_job_query", "Invalid job query parameters",
		map[string]any{"issues": []jobQueryIssue{{Path: []any{"limit"}, Message: "Too small: expected number to be >=1"}}}))
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.JSONEq(t, `{"error":"invalid_job_query","message":"Invalid job query parameters","details":{"issues":[{"path":["limit"],"message":"Too small: expected number to be >=1"}]}}`, rec.Body.String())

	rec = httptestRecorderForProjectError(t, projectNotFound())
	require.JSONEq(t, `{"error":"project_not_found","message":"Project not found"}`, rec.Body.String())
}

func httptestRecorderForProjectError(t *testing.T, err error) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	writeProjectError(rec, httptest.NewRequest(http.MethodGet, "/", nil), "test", err)
	return rec
}

type projectJobsFixture struct {
	api   *projectAPI
	scope *testenv.Scope
}

func newProjectJobsFixture(t *testing.T, role string) projectJobsFixture {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role, WithProject: true})
	return projectJobsFixture{api: &projectAPI{pool: scope.Pool, membership: scope.Membership(role)}, scope: scope}
}

func (f projectJobsFixture) get(t *testing.T, suffix string) *httptest.ResponseRecorder {
	t.Helper()
	return projectRequest(f.api, f.scope, f.scope.OrgPath(suffix))
}

func (f projectJobsFixture) projectPath(projectID, suffix string) string {
	return "/projects/" + url.PathEscape(projectID) + "/jobs" + suffix
}

type projectJobSeed struct {
	id, projectID, kind, status, inputPayload, jobType string
	ownerUserID, createdByUserID                       *string
	updatedAt                                          time.Time
}

func mustProjectJob(t *testing.T, scope *testenv.Scope, seed projectJobSeed) string {
	t.Helper()
	if seed.id == "" {
		seed.id = "job_" + uuid.NewString()
	}
	if seed.projectID == "" {
		seed.projectID = scope.ProjectID
	}
	if seed.kind == "" {
		seed.kind = "translation"
	}
	if seed.status == "" {
		seed.status = "queued"
	}
	if seed.inputPayload == "" {
		seed.inputPayload = `{}`
	}
	if seed.updatedAt.IsZero() {
		seed.updatedAt = time.Now()
	}
	_, err := scope.Pool.Exec(t.Context(), `
        insert into jobs (id, organization_id, project_id, kind, status, input_payload, owner_user_id, created_by_user_id, created_at, updated_at)
        values ($1, $2, $3, $4::job_kind, $5::job_status, $6::jsonb, $7, $8, $9, $9)`,
		seed.id, scope.OrganizationID, seed.projectID, seed.kind, seed.status, seed.inputPayload, seed.ownerUserID, seed.createdByUserID, seed.updatedAt)
	require.NoError(t, err)
	if seed.jobType != "" {
		_, err = scope.Pool.Exec(t.Context(), `insert into translation_job_details (job_id, type) values ($1, $2::translation_job_type)`, seed.id, seed.jobType)
		require.NoError(t, err)
	}
	return seed.id
}

func mustExternalJobDetails(t *testing.T, scope *testenv.Scope, jobID, syncState, assignedUsers string) {
	t.Helper()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into external_job_details (job_id, organization_id, provider_kind, external_job_id, external_status, sync_state, assigned_users)
        values ($1, $2, 'crowdin', $1, 'todo', $3, $4::jsonb)`,
		jobID, scope.OrganizationID, syncState, assignedUsers)
	require.NoError(t, err)
}

func decodeProjectJobIDs(t *testing.T, rec *httptest.ResponseRecorder) []string {
	t.Helper()
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Jobs []struct {
			ID string `json:"id"`
		} `json:"jobs"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	ids := make([]string, len(body.Jobs))
	for i, job := range body.Jobs {
		ids[i] = job.ID
	}
	return ids
}

func requireProjectJobsError(t *testing.T, rec *httptest.ResponseRecorder, status int, code, message string) {
	t.Helper()
	require.Equal(t, status, rec.Code, rec.Body.String())
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	require.JSONEq(t, `{"error":"`+code+`","message":"`+message+`"}`, rec.Body.String())
}

func TestProjectJobReadsShape(t *testing.T) {
	f := newProjectJobsFixture(t, "admin")
	created := time.Date(2026, 1, 2, 3, 4, 5, 123456000, time.UTC)
	jobID := "job_" + uuid.NewString()
	_, err := f.scope.Pool.Exec(t.Context(), `
        insert into jobs (id, organization_id, project_id, created_by_user_id, owner_user_id, assignee_type, kind, status,
            input_payload, outcome_payload, last_error, workflow_run_id, context_snapshot, created_at, updated_at, completed_at)
        values ($1, $2, $3, $4, $4, 'user', 'translation', 'failed', '{"sourceText": "Hi", "targetLocales": ["fr"]}',
            '{"error": "x"}', 'boom', 'wrun_1', '{"k": [1, 2]}', $5, $5, $5)`,
		jobID, f.scope.OrganizationID, f.scope.ProjectID, f.scope.UserID, created)
	require.NoError(t, err)
	for _, statement := range []string{
		`insert into translation_job_details (job_id, type, outcome_kind) values ($1, 'string', 'error')`,
		`insert into review_job_details (job_id, criteria, target_locale, config) values ($1, 'tone', 'fr', '{"strict": true}')`,
		`insert into sync_job_details (job_id, connector_kind, direction, external_identifiers) values ($1, 'github', 'pull', '{"repo": "r"}')`,
		`insert into asset_management_job_details (job_id, asset_type, operation, config) values ($1, 'image', 'resize', '{}')`,
	} {
		_, err = f.scope.Pool.Exec(t.Context(), statement, jobID)
		require.NoError(t, err)
	}
	record := `"id":"` + jobID + `","organizationId":"` + f.scope.OrganizationID + `","projectId":"` + f.scope.ProjectID + `",
        "createdByUserId":"` + f.scope.UserID + `","ownerUserId":"` + f.scope.UserID + `","assigneeType":"user",
        "kind":"translation","type":"string","status":"failed","inputPayload":{"sourceText":"Hi","targetLocales":["fr"]},
        "outcomeKind":"error","outcomePayload":{"error":"x"},"lastError":"boom","workflowRunId":"wrun_1","interactionId":null,
        "contextSnapshot":{"k":[1,2]},"reviewCriteria":"tone","reviewTargetLocale":"fr","reviewConfig":{"strict":true},
        "syncConnectorKind":"github","syncDirection":"pull","syncExternalIdentifiers":{"repo":"r"},
        "assetType":"image","assetOperation":"resize","assetConfig":{},
        "externalProviderKind":null,"externalJobId":null,"externalTaskId":null,"externalStatus":null,"externalTitle":null,
        "externalDueDate":null,"externalTargetLocales":null,"externalAssignedUsers":null,"externalUrl":null,
        "externalSyncState":null,"externalProviderPayload":null,"linkedJobId":null,
        "createdAt":"2026-01-02T03:04:05.123Z","updatedAt":"2026-01-02T03:04:05.123Z","completedAt":"2026-01-02T03:04:05.123Z",
        "sourceFilename":null,"sourcePath":null`

	rec := f.get(t, f.projectPath(f.scope.ProjectID, "/"+jobID))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	require.JSONEq(t, `{"job":{`+record+`}}`, rec.Body.String())

	rec = f.get(t, f.projectPath(f.scope.ProjectID, ""))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.JSONEq(t, `{"jobs":[{`+record+`,"projectName":"Project"}]}`, rec.Body.String())

	rec = f.get(t, f.projectPath(f.scope.ProjectID, "/"+jobID+"/status"))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.JSONEq(t, `{"job":{"id":"`+jobID+`","projectId":"`+f.scope.ProjectID+`","kind":"translation","type":"string",
        "status":"failed","createdAt":"2026-01-02T03:04:05.123Z","updatedAt":"2026-01-02T03:04:05.123Z",
        "completedAt":"2026-01-02T03:04:05.123Z","lastError":"boom"}}`, rec.Body.String())
}

func TestProjectJobReadsSourceFiles(t *testing.T) {
	f := newProjectJobsFixture(t, "admin")
	storedFileID := mustJobSourceStoredFile(t, f.scope, "pricing.json", `{}`)
	mustJobSourceVersion(t, f.scope, storedFileID, "marketing/pricing.json", time.Now())
	lookupID := mustProjectJob(t, f.scope, projectJobSeed{jobType: "file", inputPayload: `{"sourceFileId":"` + storedFileID + `"}`})
	metadataID := mustProjectJob(t, f.scope, projectJobSeed{jobType: "file", inputPayload: `{"sourceFileId":"` + storedFileID + `","metadata":{"sourceFilename":"home.json","sourcePath":"web/home.json"}}`})

	rec := f.get(t, f.projectPath(f.scope.ProjectID, ""))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Jobs []struct {
			ID             string  `json:"id"`
			SourceFilename *string `json:"sourceFilename"`
			SourcePath     *string `json:"sourcePath"`
		} `json:"jobs"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	displays := map[string][2]string{}
	for _, job := range body.Jobs {
		require.NotNil(t, job.SourceFilename)
		require.NotNil(t, job.SourcePath)
		displays[job.ID] = [2]string{*job.SourceFilename, *job.SourcePath}
	}
	require.Equal(t, map[string][2]string{
		lookupID:   {"pricing.json", "marketing/pricing.json"},
		metadataID: {"home.json", "web/home.json"},
	}, displays)

	rec = f.get(t, f.projectPath(f.scope.ProjectID, "/"+lookupID))
	require.Contains(t, rec.Body.String(), `"sourcePath":"marketing/pricing.json"`)
}

func TestProjectJobsListFiltersAndOrder(t *testing.T) {
	f := newProjectJobsFixture(t, "admin")
	now := time.Now().UTC().Truncate(time.Millisecond)
	tie := now.Add(-time.Hour)
	queued := mustProjectJob(t, f.scope, projectJobSeed{id: "job_a", status: "queued", jobType: "string", updatedAt: now})
	review := mustProjectJob(t, f.scope, projectJobSeed{id: "job_b", kind: "review", status: "waiting_for_review", updatedAt: tie})
	failed := mustProjectJob(t, f.scope, projectJobSeed{id: "job_c", status: "failed", jobType: "file", updatedAt: tie})
	succeeded := mustProjectJob(t, f.scope, projectJobSeed{id: "job_d", status: "succeeded", jobType: "file", updatedAt: now.Add(-2 * time.Hour)})
	staleRunning := mustProjectJob(t, f.scope, projectJobSeed{id: "job_e", status: "running", updatedAt: now.Add(-8 * 24 * time.Hour)})

	list := func(query string) []string {
		return decodeProjectJobIDs(t, f.get(t, f.projectPath(f.scope.ProjectID, query)))
	}
	require.Equal(t, []string{queued, failed, review, succeeded, staleRunning}, list(""))
	require.Equal(t, []string{queued, failed}, list("?limit=2"))
	require.Equal(t, []string{review}, list("?kind=review"))
	require.Equal(t, []string{failed, succeeded}, list("?type=file"))
	require.Equal(t, []string{succeeded}, list("?status=succeeded"))
	require.Equal(t, []string{queued, review, staleRunning}, list("?open=false&status=succeeded"))
	require.Equal(t, []string{review, failed, queued}, list("?triage=1&open=1&status=succeeded"))
	require.Equal(t, []string{review, failed}, list("?triage=1&limit=2"))
	require.Equal(t, []string{failed}, list("?triage=1&type=file"))
}

func TestProjectJobsListVisibilityAndRelationship(t *testing.T) {
	f := newProjectJobsFixture(t, "admin")
	otherUser := testenv.Seed(t, testenv.Options{Role: "admin"}).UserID
	mine := mustProjectJob(t, f.scope, projectJobSeed{ownerUserID: &f.scope.UserID, createdByUserID: &otherUser})
	created := mustProjectJob(t, f.scope, projectJobSeed{ownerUserID: &otherUser, createdByUserID: &f.scope.UserID})
	assigneeMatch := mustProjectJob(t, f.scope, projectJobSeed{})
	var email string
	require.NoError(t, f.scope.Pool.QueryRow(t.Context(), `select email from users where id=$1`, f.scope.UserID).Scan(&email))
	mustExternalJobDetails(t, f.scope, assigneeMatch, "synced", `["someone@else.test", "`+strings.ToUpper(email)+`"]`)
	removed := mustProjectJob(t, f.scope, projectJobSeed{ownerUserID: &f.scope.UserID})
	mustExternalJobDetails(t, f.scope, removed, "removed", `[]`)

	list := func(query string) []string {
		return decodeProjectJobIDs(t, f.get(t, f.projectPath(f.scope.ProjectID, query)))
	}
	require.ElementsMatch(t, []string{mine, created, assigneeMatch}, list(""))
	require.ElementsMatch(t, []string{mine, assigneeMatch}, list("?relationship=assigned"))
	require.ElementsMatch(t, []string{created}, list("?relationship=created"))

	rec := f.get(t, f.projectPath(f.scope.ProjectID, "/"+removed))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"externalSyncState":"removed"`)

	_, err := f.scope.Pool.Exec(t.Context(), `update projects set is_active=false where id=$1`, f.scope.ProjectID)
	require.NoError(t, err)
	require.Empty(t, list(""))
	require.Equal(t, http.StatusOK, f.get(t, f.projectPath(f.scope.ProjectID, "/"+mine)).Code)
	require.Equal(t, http.StatusOK, f.get(t, f.projectPath(f.scope.ProjectID, "/"+mine+"/status")).Code)
}

func TestProjectJobReadsTeamAccess(t *testing.T) {
	requireReadable := func(t *testing.T, f projectJobsFixture, projectID, jobID string, readable bool) {
		t.Helper()
		for _, suffix := range []string{"", "/" + jobID, "/" + jobID + "/status"} {
			rec := f.get(t, f.projectPath(projectID, suffix))
			if readable {
				require.Equal(t, http.StatusOK, rec.Code, "%s: %s", suffix, rec.Body.String())
			} else {
				requireProjectJobsError(t, rec, http.StatusNotFound, "project_not_found", "Project not found")
			}
		}
	}

	t.Run("team-scoped roles need team membership", func(t *testing.T) {
		f := newProjectJobsFixture(t, "translator")
		jobID := mustProjectJob(t, f.scope, projectJobSeed{})
		requireReadable(t, f, f.scope.ProjectID, jobID, false)
		f.scope.MustTeam(t, "default", "Default", "member")
		requireReadable(t, f, f.scope.ProjectID, jobID, true)

		theirs := f.scope.MustTeam(t, "theirs", "Theirs", "")
		projectID := f.scope.MustProject(t, uniqueProjectID("ptheirs"), "Theirs")
		_, err := f.scope.Pool.Exec(t.Context(), `update projects set team_id=$2 where id=$1`, projectID, theirs)
		require.NoError(t, err)
		requireReadable(t, f, projectID, mustProjectJob(t, f.scope, projectJobSeed{projectID: projectID}), false)
	})

	for _, role := range []string{"admin", "localization_manager"} {
		t.Run(role+" reads every team", func(t *testing.T) {
			f := newProjectJobsFixture(t, role)
			theirs := f.scope.MustTeam(t, "theirs", "Theirs", "")
			_, err := f.scope.Pool.Exec(t.Context(), `update projects set team_id=$2 where id=$1`, f.scope.ProjectID, theirs)
			require.NoError(t, err)
			requireReadable(t, f, f.scope.ProjectID, mustProjectJob(t, f.scope, projectJobSeed{}), true)
		})
	}

	t.Run("other organizations stay hidden", func(t *testing.T) {
		f := newProjectJobsFixture(t, "admin")
		other := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
		requireReadable(t, f, other.ProjectID, mustProjectJob(t, other, projectJobSeed{}), false)
	})
}

func TestProjectJobReadsErrors(t *testing.T) {
	f := newProjectJobsFixture(t, "admin")
	projectID := f.scope.ProjectID
	jobID := mustProjectJob(t, f.scope, projectJobSeed{projectID: projectID})
	longID := strings.Repeat("a", 129)

	t.Run("provider and non-native projects stay on Hono", func(t *testing.T) {
		externalID := f.scope.MustProject(t, uniqueProjectID("pexternal"), "External")
		_, err := f.scope.Pool.Exec(t.Context(), `update projects set source='external_tms' where id=$1`, externalID)
		require.NoError(t, err)
		externalJob := mustProjectJob(t, f.scope, projectJobSeed{projectID: externalID})
		for _, providerProjectID := range []string{"ext:crowdin:1", externalID} {
			for _, suffix := range []string{"", "/" + externalJob, "/" + externalJob + "/status"} {
				requireProjectJobsError(t, f.get(t, f.projectPath(providerProjectID, suffix)), http.StatusNotFound, "project_not_found", "Project not found")
			}
		}
	})

	t.Run("invalid params", func(t *testing.T) {
		requireProjectJobsError(t, f.get(t, f.projectPath(longID, "")), http.StatusNotFound, "project_not_found", "Project not found")
		requireProjectJobsError(t, f.get(t, f.projectPath(longID, "?limit=0")), http.StatusNotFound, "project_not_found", "Project not found")
		for _, suffix := range []string{"/" + jobID, "/" + jobID + "/status"} {
			requireProjectJobsError(t, f.get(t, f.projectPath(longID, suffix)), http.StatusNotFound, "job_not_found", "Job not found")
			requireProjectJobsError(t, f.get(t, f.projectPath("missing-project", suffix)), http.StatusNotFound, "project_not_found", "Project not found")
		}
		for _, suffix := range []string{"/" + longID, "/" + longID + "/status", "/%20", "/missing", "/missing/status"} {
			requireProjectJobsError(t, f.get(t, f.projectPath(projectID, suffix)), http.StatusNotFound, "job_not_found", "Job not found")
		}
	})

	t.Run("jobs in another project are not found", func(t *testing.T) {
		otherProject := f.scope.MustProject(t, uniqueProjectID("pother"), "Other")
		otherJob := mustProjectJob(t, f.scope, projectJobSeed{projectID: otherProject})
		rec := f.get(t, f.projectPath(otherProject, "/"+otherJob))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		requireProjectJobsError(t, f.get(t, f.projectPath(projectID, "/"+otherJob)), http.StatusNotFound, "job_not_found", "Job not found")
		requireProjectJobsError(t, f.get(t, f.projectPath(projectID, "/"+otherJob+"/status")), http.StatusNotFound, "job_not_found", "Job not found")
	})

	t.Run("invalid query", func(t *testing.T) {
		rec := f.get(t, f.projectPath(projectID, "?limit=101"))
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.JSONEq(t, `{"error":"invalid_job_query","message":"Invalid job query parameters","details":{"issues":[{"path":["limit"],"message":"Too big: expected number to be <=100"}]}}`, rec.Body.String())
	})

	t.Run("normalizes encoded and padded ids", func(t *testing.T) {
		encoded := url.PathEscape(url.PathEscape(" " + projectID))
		rec := projectRequest(f.api, f.scope, f.scope.OrgPath("/projects/"+encoded+"/jobs/"+url.PathEscape(" "+jobID+" ")))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"id":"`+jobID+`"`)
	})
}

func mustProviderMirrorJob(t *testing.T, scope *testenv.Scope, syncState, assignedUsers string, updatedAt time.Time) (projectID, jobID string) {
	t.Helper()
	externalProjectID := strings.ReplaceAll(uuid.NewString(), "-", "")
	projectID = "ext:crowdin:" + externalProjectID
	_, err := scope.Pool.Exec(t.Context(), `
        insert into projects (id, organization_id, name, identifier, source, external_provider_kind, external_project_id)
        values ($1, $2, 'Crowdin Project', $3, 'external_tms', 'crowdin', $4)`,
		projectID, scope.OrganizationID, "P"+strings.ToUpper(externalProjectID[:8]), externalProjectID)
	require.NoError(t, err)
	jobID = mustProjectJob(t, scope, projectJobSeed{id: projectID + ":42", projectID: projectID, inputPayload: `{"providerKind":"crowdin"}`, updatedAt: updatedAt})
	_, err = scope.Pool.Exec(t.Context(), `
        insert into external_job_details (job_id, organization_id, provider_kind, external_job_id, external_task_id, external_status,
            title, due_date, target_locales, assigned_users, external_url, sync_state, provider_payload)
        values ($1, $2, 'crowdin', $6, 't1', 'todo', 'Mirror', $3, '["fr", "de"]', $4::jsonb, 'https://crowdin.test/42', $5, '{"fileIds": [7]}')`,
		jobID, scope.OrganizationID, time.Date(2026, 3, 4, 5, 6, 7, 891000000, time.UTC), assignedUsers, syncState, "42-"+externalProjectID)
	require.NoError(t, err)
	return projectID, jobID
}

func mustProviderCredential(t *testing.T, scope *testenv.Scope, providerKind string) string {
	t.Helper()
	var credentialID string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        insert into organization_external_tms_provider_credentials (organization_id, provider_kind, display_name,
            encryption_algorithm, ciphertext, iv, auth_tag, masked_secret_suffix)
        values ($1, $2::external_tms_provider_kind, $2, 'test', 'c', 'i', 't', '1234')
        returning id`, scope.OrganizationID, providerKind).Scan(&credentialID))
	return credentialID
}

func mustCrowdinUserConnection(t *testing.T, scope *testenv.Scope, username string) {
	t.Helper()
	credentialID := mustProviderCredential(t, scope, "crowdin")
	_, err := scope.Pool.Exec(t.Context(), `
        insert into crowdin_user_connections (organization_id, user_id, provider_credential_id, crowdin_user_id, username,
            encryption_algorithm, ciphertext, iv, auth_tag)
        values ($1, $2, $3, 1, $4, 'test', 'c', 'i', 't')`,
		scope.OrganizationID, scope.UserID, credentialID, username)
	require.NoError(t, err)
}

func TestOrgJobReadsShape(t *testing.T) {
	f := newProjectJobsFixture(t, "admin")
	nativeProjectID := f.scope.ProjectID
	nativeID := mustProjectJob(t, f.scope, projectJobSeed{jobType: "string", updatedAt: time.Now().Add(-time.Hour)})
	mirrorProjectID, mirrorID := mustProviderMirrorJob(t, f.scope, "synced", `["a@b.test"]`, time.Now())

	rec := f.get(t, "/jobs")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Jobs []map[string]any `json:"jobs"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.Jobs, 2)
	mirror, native := body.Jobs[0], body.Jobs[1]
	require.Equal(t, mirrorID, mirror["id"])
	require.Equal(t, mirrorProjectID, mirror["projectId"])
	require.Equal(t, "Crowdin Project", mirror["projectName"])
	for key, want := range map[string]any{
		"externalProviderKind": "crowdin", "externalJobId": "42-" + strings.TrimPrefix(mirrorProjectID, "ext:crowdin:"), "externalTaskId": "t1", "externalStatus": "todo",
		"externalTitle": "Mirror", "externalDueDate": "2026-03-04T05:06:07.891Z", "externalTargetLocales": []any{"fr", "de"},
		"externalAssignedUsers": []any{"a@b.test"}, "externalUrl": "https://crowdin.test/42", "externalSyncState": "synced",
		"externalProviderPayload": map[string]any{"fileIds": []any{7.0}}, "linkedJobId": nil,
	} {
		require.Equal(t, want, mirror[key], key)
	}
	require.NotContains(t, mirror, "providerSourceFiles")
	require.NotContains(t, mirror, "providerActions")
	require.Equal(t, nativeID, native["id"])
	require.Equal(t, "Project", native["projectName"])
	require.Equal(t, nativeProjectID, native["projectId"])
	require.Equal(t, "string", native["type"])

	rec = f.get(t, "/jobs/"+nativeID)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var detail struct {
		Job map[string]any `json:"job"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &detail))
	require.Equal(t, nativeID, detail.Job["id"])
	require.Equal(t, "Project", detail.Job["projectName"])
	require.Contains(t, detail.Job, "sourceFilename")
	require.Len(t, detail.Job, 43)

	requireProjectJobsError(t, f.get(t, "/jobs/"+url.PathEscape(mirrorID)), http.StatusNotFound, "job_not_found", "Job not found")
}

func TestOrgJobReadsTeamAccess(t *testing.T) {
	type seeded struct{ mine, theirs, noProject, assignedTheirs, createdTheirs, createdMine string }
	seed := func(t *testing.T, f projectJobsFixture) seeded {
		t.Helper()
		mineTeam := f.scope.MustTeam(t, "mine", "Mine", "member")
		theirsTeam := f.scope.MustTeam(t, "theirs", "Theirs", "")
		mineProject := f.scope.MustProject(t, uniqueProjectID("pmine"), "Mine")
		theirsProject := f.scope.MustProject(t, uniqueProjectID("ptheirs"), "Theirs")
		_, err := f.scope.Pool.Exec(t.Context(), `update projects set team_id = case id when $1 then $2::uuid else $4::uuid end where id in ($1, $3)`,
			mineProject, mineTeam, theirsProject, theirsTeam)
		require.NoError(t, err)
		base := time.Now()
		var s seeded
		s.mine = mustProjectJob(t, f.scope, projectJobSeed{projectID: mineProject, updatedAt: base})
		s.theirs = mustProjectJob(t, f.scope, projectJobSeed{projectID: theirsProject, updatedAt: base.Add(-time.Minute)})
		s.assignedTheirs = mustProjectJob(t, f.scope, projectJobSeed{projectID: theirsProject, ownerUserID: &f.scope.UserID, updatedAt: base.Add(-2 * time.Minute)})
		s.createdTheirs = mustProjectJob(t, f.scope, projectJobSeed{projectID: theirsProject, createdByUserID: &f.scope.UserID, updatedAt: base.Add(-3 * time.Minute)})
		s.createdMine = mustProjectJob(t, f.scope, projectJobSeed{projectID: mineProject, createdByUserID: &f.scope.UserID, updatedAt: base.Add(-4 * time.Minute)})
		s.noProject = "job_" + uuid.NewString()
		_, err = f.scope.Pool.Exec(t.Context(), `
            insert into jobs (id, organization_id, kind, status, input_payload, updated_at)
            values ($1, $2, 'research', 'queued', '{}', $3)`, s.noProject, f.scope.OrganizationID, base.Add(-5*time.Minute))
		require.NoError(t, err)
		return s
	}
	list := func(t *testing.T, f projectJobsFixture, query string) []string {
		t.Helper()
		return decodeProjectJobIDs(t, f.get(t, "/jobs"+query))
	}
	detailCode := func(t *testing.T, f projectJobsFixture, jobID string) int {
		t.Helper()
		return f.get(t, "/jobs/"+jobID).Code
	}

	t.Run("team-scoped roles", func(t *testing.T) {
		f := newProjectJobsFixture(t, "translator")
		s := seed(t, f)
		require.Equal(t, []string{s.mine, s.createdMine}, list(t, f, ""))
		require.Equal(t, []string{s.assignedTheirs}, list(t, f, "?relationship=assigned"))
		require.Equal(t, []string{s.createdMine}, list(t, f, "?relationship=created"))
		require.Equal(t, http.StatusOK, detailCode(t, f, s.mine))
		for _, hidden := range []string{s.theirs, s.assignedTheirs, s.noProject} {
			requireProjectJobsError(t, f.get(t, "/jobs/"+hidden), http.StatusNotFound, "job_not_found", "Job not found")
		}
	})

	for _, role := range []string{"admin", "localization_manager"} {
		t.Run(role+" sees the whole organization", func(t *testing.T) {
			f := newProjectJobsFixture(t, role)
			s := seed(t, f)
			require.Equal(t, []string{s.mine, s.theirs, s.assignedTheirs, s.createdTheirs, s.createdMine, s.noProject}, list(t, f, ""))
			require.Equal(t, []string{s.createdTheirs, s.createdMine}, list(t, f, "?relationship=created"))
			require.Equal(t, http.StatusOK, detailCode(t, f, s.noProject))
			require.Equal(t, http.StatusOK, detailCode(t, f, s.theirs))
		})
	}

	t.Run("other organizations stay hidden", func(t *testing.T) {
		f := newProjectJobsFixture(t, "admin")
		other := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
		otherJob := mustProjectJob(t, other, projectJobSeed{ownerUserID: &f.scope.UserID})
		require.Empty(t, list(t, f, ""))
		require.Empty(t, list(t, f, "?relationship=assigned"))
		requireProjectJobsError(t, f.get(t, "/jobs/"+otherJob), http.StatusNotFound, "job_not_found", "Job not found")
	})
}

func TestOrgJobsListAssigneeCandidates(t *testing.T) {
	f := newProjectJobsFixture(t, "translator")
	_, viaCrowdin := mustProviderMirrorJob(t, f.scope, "synced", `["someone@else.test", "CrowdinUser"]`, time.Now())
	_, unmatched := mustProviderMirrorJob(t, f.scope, "synced", `["stranger"]`, time.Now().Add(-time.Minute))
	_, removed := mustProviderMirrorJob(t, f.scope, "removed", `["crowdinuser"]`, time.Now().Add(-2*time.Minute))
	require.NotEmpty(t, unmatched)
	require.NotEmpty(t, removed)

	require.Empty(t, decodeProjectJobIDs(t, f.get(t, "/jobs?relationship=assigned")))
	mustCrowdinUserConnection(t, f.scope, "  crowdinUSER ")
	require.Equal(t, []string{viaCrowdin}, decodeProjectJobIDs(t, f.get(t, "/jobs?relationship=assigned")))
}

func mustPhraseUserConnection(t *testing.T, scope *testenv.Scope, username, email, fullName string) {
	t.Helper()
	credentialID := mustProviderCredential(t, scope, "phrase")
	_, err := scope.Pool.Exec(t.Context(), `
        insert into phrase_user_connections (organization_id, user_id, provider_credential_id, phrase_user_uid, username,
            email, full_name, encryption_algorithm, ciphertext, iv, auth_tag)
        values ($1, $2, $3, 'phrase-uid', $4, $5, $6, 'test', 'c', 'i', 't')`,
		scope.OrganizationID, scope.UserID, credentialID, username, email, fullName)
	require.NoError(t, err)
}

func TestOrgJobsListPhraseAssigneeCandidates(t *testing.T) {
	f := newProjectJobsFixture(t, "translator")
	now := time.Now()
	_, viaUsername := mustProviderMirrorJob(t, f.scope, "synced", `["PHRASEUSER"]`, now)
	_, viaEmail := mustProviderMirrorJob(t, f.scope, "synced", `["other@x.test", "Translator@PHRASE.test"]`, now.Add(-time.Minute))
	_, viaFullName := mustProviderMirrorJob(t, f.scope, "synced", `["ana lopez"]`, now.Add(-2*time.Minute))
	_, unmatched := mustProviderMirrorJob(t, f.scope, "synced", `["phrase", "translator@phrase.test.evil"]`, now.Add(-3*time.Minute))
	_, removed := mustProviderMirrorJob(t, f.scope, "removed", `["phraseuser"]`, now.Add(-4*time.Minute))
	theirsTeam := f.scope.MustTeam(t, "theirs", "Theirs", "")
	theirsProject := f.scope.MustProject(t, uniqueProjectID("ptheirs"), "Theirs")
	_, err := f.scope.Pool.Exec(t.Context(), `update projects set team_id=$2 where id=$1`, theirsProject, theirsTeam)
	require.NoError(t, err)
	ownedOutsideTeams := mustProjectJob(t, f.scope, projectJobSeed{projectID: theirsProject, ownerUserID: &f.scope.UserID, updatedAt: now.Add(-5 * time.Minute)})
	other := testenv.Seed(t, testenv.Options{Role: "admin"})
	_, otherOrgMatch := mustProviderMirrorJob(t, other, "synced", `["phraseuser"]`, now)
	require.NotEmpty(t, unmatched)
	require.NotEmpty(t, removed)
	require.NotEmpty(t, otherOrgMatch)

	list := func(query string) []string { return decodeProjectJobIDs(t, f.get(t, "/jobs"+query)) }
	require.Equal(t, []string{ownedOutsideTeams}, list("?relationship=assigned"))

	mustPhraseUserConnection(t, f.scope, " PhraseUser ", " translator@phrase.TEST ", "Ana Lopez")
	require.Equal(t, []string{viaUsername, viaEmail, viaFullName, ownedOutsideTeams}, list("?relationship=assigned"))
	require.Equal(t, []string{viaUsername, viaEmail}, list("?relationship=assigned&limit=2"))

	require.Empty(t, list(""), "team gate still hides mirrors and other-team jobs without relationship=assigned")
	require.Empty(t, list("?relationship=created"))
	for _, jobID := range []string{viaUsername, ownedOutsideTeams} {
		requireProjectJobsError(t, f.get(t, "/jobs/"+url.PathEscape(jobID)), http.StatusNotFound, "job_not_found", "Job not found")
	}
	requireProjectJobsError(t, f.get(t, f.projectPath(theirsProject, "?relationship=assigned")), http.StatusNotFound, "project_not_found", "Project not found")

	mustCrowdinUserConnection(t, f.scope, "CrowdinUser")
	_, viaCrowdin := mustProviderMirrorJob(t, f.scope, "synced", `["crowdinuser"]`, now.Add(time.Minute))
	require.Equal(t, []string{viaCrowdin, viaUsername, viaEmail, viaFullName, ownedOutsideTeams}, list("?relationship=assigned"))
}

func TestOrgJobsListFiltersAndVisibility(t *testing.T) {
	f := newProjectJobsFixture(t, "admin")
	now := time.Now()
	review := mustProjectJob(t, f.scope, projectJobSeed{status: "waiting_for_review", updatedAt: now.Add(-time.Hour)})
	queued := mustProjectJob(t, f.scope, projectJobSeed{status: "queued", jobType: "file", updatedAt: now})
	_, removedMirror := mustProviderMirrorJob(t, f.scope, "removed", `[]`, now)
	inactiveProject := f.scope.MustProject(t, uniqueProjectID("pinactive"), "Inactive")
	inactive := mustProjectJob(t, f.scope, projectJobSeed{projectID: inactiveProject, updatedAt: now})
	_, err := f.scope.Pool.Exec(t.Context(), `update projects set is_active=false where id=$1`, inactiveProject)
	require.NoError(t, err)
	require.NotEmpty(t, removedMirror)

	list := func(query string) []string { return decodeProjectJobIDs(t, f.get(t, "/jobs"+query)) }
	require.Equal(t, []string{queued, review}, list(""))
	require.Equal(t, []string{review, queued}, list("?triage=yes"))
	require.Equal(t, []string{queued}, list("?type=file&limit=1"))
	require.Equal(t, []string{review}, list("?status=waiting_for_review"))
	require.Equal(t, http.StatusOK, f.get(t, "/jobs/"+inactive).Code)

	rec := f.get(t, "/jobs?status=done&limit=1.5")
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.JSONEq(t, `{"error":"invalid_job_query","message":"Invalid job query parameters","details":{"issues":[
        {"path":["status"],"message":"Invalid option: expected one of \"queued\"|\"running\"|\"succeeded\"|\"failed\"|\"waiting_for_review\"|\"cancelled\""},
        {"path":["limit"],"message":"Invalid input: expected int, received number"}]}}`, rec.Body.String())
}

func TestOrgJobDetailErrors(t *testing.T) {
	f := newProjectJobsFixture(t, "admin")
	jobID := mustProjectJob(t, f.scope, projectJobSeed{})
	for _, suffix := range []string{"/" + strings.Repeat("j", 129), "/%20", "/missing"} {
		requireProjectJobsError(t, f.get(t, "/jobs"+suffix), http.StatusNotFound, "job_not_found", "Job not found")
	}
	rec := f.get(t, "/jobs/"+url.PathEscape(" "+jobID+" "))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
}
