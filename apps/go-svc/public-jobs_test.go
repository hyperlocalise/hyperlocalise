package main

import (
	"encoding/json"
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

type publicJobsFixture struct {
	scope   *testenv.Scope
	key     string
	handler http.Handler
}

func newPublicJobsFixture(t *testing.T, role string, permissions []string) publicJobsFixture {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role, WithProject: true})
	key, _ := mustPublicAPIKey(t, scope, publicAPIKeyOptions{permissions: permissions})
	api := &publicJobsAPI{auth: publicAPIIntegrationAuth(scope, scope.Membership(role))}
	mux := http.NewServeMux()
	api.register(mux)
	return publicJobsFixture{scope: scope, key: key, handler: mux}
}

func (f publicJobsFixture) get(t *testing.T, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("X-API-Key", f.key)
	rec := httptest.NewRecorder()
	f.handler.ServeHTTP(rec, req)
	return rec
}

func (f publicJobsFixture) latest(t *testing.T, projectID, sourcePath string) *httptest.ResponseRecorder {
	t.Helper()
	query := url.Values{}
	query.Set("projectId", projectID)
	query.Set("sourcePath", sourcePath)
	return f.get(t, "/v1/jobs/latest?"+query.Encode())
}

type publicJobSeed struct {
	projectID       string
	noProject       bool
	kind            string
	status          string
	jobType         string
	outcomeKind     string
	outcomePayload  string
	lastError       *string
	createdAt       time.Time
	updatedAt       time.Time
	completedAt     *time.Time
	sourceVersionID string
}

func mustPublicJob(t *testing.T, scope *testenv.Scope, seed publicJobSeed) string {
	t.Helper()
	id := "job_" + uuid.NewString()
	var projectID any = seed.projectID
	if seed.noProject {
		projectID = nil
	} else if seed.projectID == "" {
		projectID = scope.ProjectID
	}
	if seed.kind == "" {
		seed.kind = "translation"
	}
	if seed.status == "" {
		seed.status = "succeeded"
	}
	if seed.createdAt.IsZero() {
		seed.createdAt = time.Now()
	}
	if seed.updatedAt.IsZero() {
		seed.updatedAt = seed.createdAt
	}
	var payload any
	if seed.outcomePayload != "" {
		payload = seed.outcomePayload
	}
	_, err := scope.Pool.Exec(t.Context(), `
        insert into jobs (id, organization_id, project_id, kind, status, input_payload, outcome_payload, last_error, created_at, updated_at, completed_at)
        values ($1, $2, $3, $4::job_kind, $5::job_status, '{}'::jsonb, $6::jsonb, $7, $8, $9, $10)`,
		id, scope.OrganizationID, projectID, seed.kind, seed.status, payload, seed.lastError, seed.createdAt, seed.updatedAt, seed.completedAt)
	require.NoError(t, err)
	if seed.jobType != "" {
		var outcomeKind, versionID any
		if seed.outcomeKind != "" {
			outcomeKind = seed.outcomeKind
		}
		if seed.sourceVersionID != "" {
			versionID = seed.sourceVersionID
		}
		_, err = scope.Pool.Exec(t.Context(), `
            insert into translation_job_details (job_id, type, outcome_kind, source_file_version_id)
            values ($1, $2::translation_job_type, $3::translation_job_outcome_kind, $4)`,
			id, seed.jobType, outcomeKind, versionID)
		require.NoError(t, err)
	}
	return id
}

func mustPublicJobSourceVersion(t *testing.T, scope *testenv.Scope, projectID, sourcePath string, createdAt time.Time) string {
	t.Helper()
	storedFileID := "file_" + uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into stored_files (
            id, organization_id, project_id, role, source_kind,
            storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256
        ) values ($1, $2, $3, 'source', 'repository_file', 'test', $1, $1, 'source.xliff', 'application/xliff+xml', 2, 'deadbeef')`,
		storedFileID, scope.OrganizationID, projectID)
	require.NoError(t, err)
	var sourceFileID string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        insert into repository_source_files (organization_id, project_id, source_path)
        values ($1, $2, $3)
        on conflict (project_id, source_path) do update set updated_at=now()
        returning id`, scope.OrganizationID, projectID, sourcePath).Scan(&sourceFileID))
	var versionID string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        insert into repository_source_file_versions (repository_source_file_id, organization_id, project_id, source_path, stored_file_id, created_at)
        values ($1, $2, $3, $4, $5, $6) returning id`,
		sourceFileID, scope.OrganizationID, projectID, sourcePath, storedFileID, createdAt).Scan(&versionID))
	return versionID
}

func mustLatestFileJob(t *testing.T, scope *testenv.Scope, projectID, sourcePath string, versionCreatedAt time.Time, seed publicJobSeed) string {
	t.Helper()
	seed.projectID = projectID
	seed.sourceVersionID = mustPublicJobSourceVersion(t, scope, projectID, sourcePath, versionCreatedAt)
	if seed.jobType == "" {
		seed.jobType = "file"
	}
	if seed.outcomeKind == "" && (seed.status == "" || seed.status == "succeeded") {
		seed.outcomeKind = "file_result"
	}
	if seed.createdAt.IsZero() {
		seed.createdAt = versionCreatedAt.Add(time.Minute)
	}
	return mustPublicJob(t, scope, seed)
}

func publicJobOutputPayload(fileID string) string {
	return `{"outputFiles":[{"fileId":"` + fileID + `","locale":"fr-FR","filename":"source.fr-FR.xliff"}]}`
}

func decodePublicJob(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Job map[string]any `json:"job"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	return body.Job
}

func TestNormalizePublicJobSourcePath(t *testing.T) {
	for input, want := range map[string]string{
		"locales/en.json":   "locales/en.json",
		`locales\en\a.json`: "locales/en/a.json",
		"././a.json":        "a.json",
		".//a.json":         "/a.json",
		"a///b//c":          "a/b/c",
		`.\a.json`:          "a.json",
		"./":                "",
		"../a.json":         "../a.json",
		"a/./b":             "a/./b",
	} {
		require.Equal(t, want, normalizePublicJobSourcePath(input), input)
	}
}

func TestPublicJobOutputFiles(t *testing.T) {
	file, result := "file", "file_result"
	str, stringResult := "string", "string_result"
	encode := func(files *[]publicJobOutputFile) string {
		out, err := json.Marshal(files)
		require.NoError(t, err)
		return string(out)
	}

	require.Equal(t, `[{"fileId":" f ","locale":"fr","filename":"a.xliff"}]`,
		encode(publicJobOutputFiles(&file, &result, []byte(`{"outputFiles":[{"fileId":" f ","locale":"fr","filename":"a.xliff","url":"x"}]}`))))
	require.Equal(t, `[]`, encode(publicJobOutputFiles(&file, &result, []byte(`{"outputFiles":[]}`))))

	for name, payload := range map[string]string{
		"blank field":      `{"outputFiles":[{"fileId":" \t","locale":"fr","filename":"a"}]}`,
		"non-string field": `{"outputFiles":[{"fileId":1,"locale":"fr","filename":"a"}]}`,
		"null field":       `{"outputFiles":[{"fileId":null,"locale":"fr","filename":"a"}]}`,
		"missing field":    `{"outputFiles":[{"locale":"fr","filename":"a"}]}`,
		"one bad entry":    `{"outputFiles":[{"fileId":"f","locale":"fr","filename":"a"},{"fileId":""}]}`,
		"array entry":      `{"outputFiles":[["f"]]}`,
		"null entry":       `{"outputFiles":[null]}`,
		"not an array":     `{"outputFiles":{"fileId":"f"}}`,
		"null list":        `{"outputFiles":null}`,
		"missing list":     `{}`,
		"array payload":    `[]`,
		"null payload":     `null`,
	} {
		require.Nil(t, publicJobOutputFiles(&file, &result, []byte(payload)), name)
	}
	valid := []byte(publicJobOutputPayload("f"))
	require.Nil(t, publicJobOutputFiles(&file, &result, nil))
	require.Nil(t, publicJobOutputFiles(&str, &result, valid))
	require.Nil(t, publicJobOutputFiles(&file, &stringResult, valid))
	require.Nil(t, publicJobOutputFiles(nil, nil, valid))
}

func TestFormatPublicJobTime(t *testing.T) {
	sydney := time.FixedZone("AEST", 10*60*60)
	require.Equal(t, "2026-01-02T03:04:05.678Z", formatPublicJobTime(time.Date(2026, 1, 2, 13, 4, 5, 678999000, sydney)))
	require.Nil(t, formatOptionalPublicJobTime(nil))
}

func TestPublicJobsRead(t *testing.T) {
	createdAt := time.Date(2026, 1, 2, 3, 4, 5, 678901000, time.UTC)
	updatedAt := createdAt.Add(time.Hour)
	completedAt := createdAt.Add(2 * time.Hour)
	longError := strings.Repeat("x", 800)

	t.Run("returns the stored job envelope", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		id := mustPublicJob(t, f.scope, publicJobSeed{
			jobType: "file", outcomeKind: "file_result", outcomePayload: publicJobOutputPayload("file_output_fr"),
			lastError: &longError, createdAt: createdAt, updatedAt: updatedAt, completedAt: &completedAt,
		})
		rec := f.get(t, "/v1/jobs/"+id)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		require.Equal(t, "application/json", rec.Header().Get("Content-Type"))
		require.JSONEq(t, `{"job":{
            "id":"`+id+`","projectId":"`+f.scope.ProjectID+`","type":"file","status":"succeeded",
            "createdAt":"2026-01-02T03:04:05.678Z","updatedAt":"2026-01-02T04:04:05.678Z","completedAt":"2026-01-02T05:04:05.678Z",
            "lastError":"`+longError+`",
            "outputFiles":[{"fileId":"file_output_fr","locale":"fr-FR","filename":"source.fr-FR.xliff"}]}}`, rec.Body.String())
	})

	t.Run("returns null metadata for unfinished and string jobs", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		id := mustPublicJob(t, f.scope, publicJobSeed{status: "queued", jobType: "string"})
		job := decodePublicJob(t, f.get(t, "/v1/jobs/"+id))
		require.Equal(t, "string", job["type"])
		require.Nil(t, job["completedAt"])
		require.Nil(t, job["lastError"])
		require.Nil(t, job["outputFiles"])
		require.Contains(t, job, "outputFiles")
	})

	t.Run("returns malformed output metadata as null", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		id := mustPublicJob(t, f.scope, publicJobSeed{
			jobType: "file", outcomeKind: "file_result", outcomePayload: `{"outputFiles":[{"fileId":"","locale":"fr-FR","filename":"a"}]}`,
		})
		job := decodePublicJob(t, f.get(t, "/v1/jobs/"+id))
		require.Nil(t, job["outputFiles"])
	})

	t.Run("status includes kind and omits output files", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		id := mustPublicJob(t, f.scope, publicJobSeed{
			status: "failed", jobType: "file", outcomeKind: "error", lastError: &longError,
			createdAt: createdAt, updatedAt: updatedAt, completedAt: &completedAt,
		})
		rec := f.get(t, "/v1/jobs/"+id+"/status")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		require.JSONEq(t, `{"job":{
            "id":"`+id+`","projectId":"`+f.scope.ProjectID+`","kind":"translation","type":"file","status":"failed",
            "createdAt":"2026-01-02T03:04:05.678Z","updatedAt":"2026-01-02T04:04:05.678Z","completedAt":"2026-01-02T05:04:05.678Z",
            "lastError":"`+longError+`"}}`, rec.Body.String())
	})

	t.Run("reads non-translation jobs without details", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		id := mustPublicJob(t, f.scope, publicJobSeed{kind: "review", status: "running"})
		status := decodePublicJob(t, f.get(t, "/v1/jobs/"+id+"/status"))
		require.Equal(t, "review", status["kind"])
		require.Nil(t, status["type"])
		job := decodePublicJob(t, f.get(t, "/v1/jobs/"+id))
		require.NotContains(t, job, "kind")
		require.Nil(t, job["type"])
	})

	t.Run("trims the job id", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		id := mustPublicJob(t, f.scope, publicJobSeed{})
		require.Equal(t, id, decodePublicJob(t, f.get(t, "/v1/jobs/%20"+id+"%20"))["id"])
	})

	t.Run("not found", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		other := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
		foreign := mustPublicJob(t, other, publicJobSeed{})
		for name, path := range map[string]string{
			"unknown id":      "/v1/jobs/job_missing",
			"other workspace": "/v1/jobs/" + foreign,
			"other status":    "/v1/jobs/" + foreign + "/status",
			"blank id":        "/v1/jobs/%20",
			"id too long":     "/v1/jobs/" + strings.Repeat("j", 129),
			"status too long": "/v1/jobs/" + strings.Repeat("j", 129) + "/status",
		} {
			t.Run(name, func(t *testing.T) {
				requirePublicAPIError(t, f.get(t, path), http.StatusNotFound, "job_not_found", "Job not found")
			})
		}
	})
}

func TestPublicJobsReadAuth(t *testing.T) {
	t.Run("requires authentication", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		for _, path := range []string{"/v1/jobs/job_1", "/v1/jobs/job_1/status", "/v1/jobs/latest?projectId=p&sourcePath=a"} {
			rec := httptest.NewRecorder()
			f.handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
			requirePublicAPIError(t, rec, http.StatusUnauthorized, "unauthorized", "Authentication required")
			require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		}
	})

	t.Run("requires jobs:read before validation", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", []string{"jobs:write", "files:read"})
		for _, path := range []string{"/v1/jobs/" + strings.Repeat("j", 129), "/v1/jobs/job_1/status", "/v1/jobs/latest"} {
			requirePublicAPIError(t, f.get(t, path), http.StatusForbidden, "forbidden", "Missing required permission: jobs:read")
		}
	})

	t.Run("accepts agent tokens", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "developer", WithProject: true})
		_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$2 where id=$1`, scope.ProjectID, scope.MustTeam(t, "mine", "Mine", "member"))
		require.NoError(t, err)
		versionAt := time.Now().Add(-time.Hour)
		id := mustLatestFileJob(t, scope, scope.ProjectID, "locales/en.xliff", versionAt, publicJobSeed{outcomePayload: publicJobOutputPayload("f")})

		fixture := newAccessTokenFixture(t)
		auth := publicAPIIntegrationAuth(scope, scope.Membership("developer"))
		auth.agent = testAgentVerifier(t, fixture)
		mux := http.NewServeMux()
		(&publicJobsAPI{auth: auth}).register(mux)
		token := fixture.sign(t, agentClaims(map[string]any{
			"org_id": scope.WorkOSOrganizationID,
			"act":    map[string]any{"sub": scope.WorkOSUserID},
		}))

		for _, path := range []string{
			"/v1/jobs/" + id,
			"/v1/jobs/" + id + "/status",
			"/v1/jobs/latest?projectId=" + scope.ProjectID + "&sourcePath=locales%2Fen.xliff",
		} {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			req.Header.Set("Authorization", "Bearer "+token)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)
			require.Equal(t, id, decodePublicJob(t, rec)["id"], path)
		}
	})

	t.Run("without a database", func(t *testing.T) {
		mux := http.NewServeMux()
		(&publicJobsAPI{auth: &publicAPIAuth{}}).register(mux)
		req := httptest.NewRequest(http.MethodGet, "/v1/jobs/job_1", nil)
		req.Header.Set("X-API-Key", "hl_secret")
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		requirePublicAPIError(t, rec, http.StatusServiceUnavailable, "public_api_unavailable", "Public API is unavailable")
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	})
}

func TestPublicJobsReadTeamIsolation(t *testing.T) {
	seedProject := func(t *testing.T, f publicJobsFixture, projectID string, teamID *string) string {
		t.Helper()
		f.scope.MustProject(t, projectID, projectID)
		_, err := f.scope.Pool.Exec(t.Context(), `update projects set team_id=$2 where id=$1`, projectID, teamID)
		require.NoError(t, err)
		return mustLatestFileJob(t, f.scope, projectID, "locales/en.xliff", time.Now().Add(-time.Hour), publicJobSeed{})
	}
	requireVisible := func(t *testing.T, f publicJobsFixture, projectID, jobID string) {
		t.Helper()
		require.Equal(t, jobID, decodePublicJob(t, f.get(t, "/v1/jobs/"+jobID))["id"])
		require.Equal(t, jobID, decodePublicJob(t, f.get(t, "/v1/jobs/"+jobID+"/status"))["id"])
		require.Equal(t, jobID, decodePublicJob(t, f.latest(t, projectID, "locales/en.xliff"))["id"])
	}
	requireHidden := func(t *testing.T, f publicJobsFixture, projectID, jobID string) {
		t.Helper()
		requirePublicAPIError(t, f.get(t, "/v1/jobs/"+jobID), http.StatusNotFound, "job_not_found", "Job not found")
		requirePublicAPIError(t, f.get(t, "/v1/jobs/"+jobID+"/status"), http.StatusNotFound, "job_not_found", "Job not found")
		requirePublicAPIError(t, f.latest(t, projectID, "locales/en.xliff"), http.StatusNotFound, "project_not_found", "Project not found")
	}

	t.Run("team-scoped roles see only their teams", func(t *testing.T) {
		f := newPublicJobsFixture(t, "translator", nil)
		mine := f.scope.MustTeam(t, "mine", "Mine", "member")
		theirs := f.scope.MustTeam(t, "theirs", "Theirs", "")
		minePID, theirsPID := uniqueProjectID("pmine"), uniqueProjectID("ptheirs")
		requireVisible(t, f, minePID, seedProject(t, f, minePID, &mine))
		requireHidden(t, f, theirsPID, seedProject(t, f, theirsPID, &theirs))
	})

	t.Run("projects without a team belong to the default team", func(t *testing.T) {
		f := newPublicJobsFixture(t, "member", nil)
		projectID := uniqueProjectID("punassigned")
		jobID := seedProject(t, f, projectID, nil)
		requireHidden(t, f, projectID, jobID)
		f.scope.MustTeam(t, "default", "Default", "member")
		requireVisible(t, f, projectID, jobID)
	})

	t.Run("jobs without a project are org-wide only", func(t *testing.T) {
		f := newPublicJobsFixture(t, "translator", nil)
		f.scope.MustTeam(t, "default", "Default", "member")
		id := mustPublicJob(t, f.scope, publicJobSeed{noProject: true})
		requirePublicAPIError(t, f.get(t, "/v1/jobs/"+id), http.StatusNotFound, "job_not_found", "Job not found")
	})

	for _, role := range []string{"admin", "localization_manager"} {
		t.Run(role+" sees every team", func(t *testing.T) {
			f := newPublicJobsFixture(t, role, nil)
			theirs := f.scope.MustTeam(t, "theirs", "Theirs", "")
			projectID := uniqueProjectID("ptheirs")
			requireVisible(t, f, projectID, seedProject(t, f, projectID, &theirs))
			id := mustPublicJob(t, f.scope, publicJobSeed{noProject: true})
			job := decodePublicJob(t, f.get(t, "/v1/jobs/"+id))
			require.Nil(t, job["projectId"])
		})
	}
}

func TestPublicJobsLatest(t *testing.T) {
	const sourcePath = "locales/en/source.xliff"
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	t.Run("returns the newest succeeded job by source upload order", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		p := f.scope.ProjectID
		olderCompleted := base.Add(72 * time.Hour)
		mustLatestFileJob(t, f.scope, p, sourcePath, base, publicJobSeed{completedAt: &olderCompleted, outcomePayload: publicJobOutputPayload("older")})
		newerCompleted := base.Add(48 * time.Hour)
		newer := mustLatestFileJob(t, f.scope, p, sourcePath, base.Add(24*time.Hour), publicJobSeed{
			completedAt: &newerCompleted, outcomePayload: publicJobOutputPayload("newer"),
		})

		rec := f.latest(t, p, sourcePath)
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		job := decodePublicJob(t, rec)
		require.Equal(t, newer, job["id"])
		require.Equal(t, "2026-01-03T00:00:00.000Z", job["completedAt"])
		require.Equal(t, []any{map[string]any{"fileId": "newer", "locale": "fr-FR", "filename": "source.fr-FR.xliff"}}, job["outputFiles"])
		require.NotContains(t, job, "kind")
	})

	t.Run("falls back past newer unsuccessful pushes", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		p := f.scope.ProjectID
		previous := mustLatestFileJob(t, f.scope, p, sourcePath, base, publicJobSeed{outcomePayload: publicJobOutputPayload("previous")})
		mustLatestFileJob(t, f.scope, p, sourcePath, base.Add(time.Hour), publicJobSeed{status: "queued"})
		mustLatestFileJob(t, f.scope, p, sourcePath, base.Add(2*time.Hour), publicJobSeed{status: "failed", outcomeKind: "error"})
		mustLatestFileJob(t, f.scope, p, sourcePath, base.Add(3*time.Hour), publicJobSeed{jobType: "string", outcomeKind: "string_result"})
		mustLatestFileJob(t, f.scope, p, sourcePath, base.Add(4*time.Hour), publicJobSeed{outcomeKind: "error"})
		mustLatestFileJob(t, f.scope, p, sourcePath, base.Add(5*time.Hour), publicJobSeed{kind: "review"})

		require.Equal(t, previous, decodePublicJob(t, f.latest(t, p, sourcePath))["id"])
	})

	t.Run("orders jobs on the same version by creation", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		p := f.scope.ProjectID
		versionID := mustPublicJobSourceVersion(t, f.scope, p, sourcePath, base)
		seed := func(createdAt time.Time) string {
			return mustPublicJob(t, f.scope, publicJobSeed{jobType: "file", outcomeKind: "file_result", sourceVersionID: versionID, createdAt: createdAt})
		}
		newer := seed(base.Add(2 * time.Hour))
		seed(base.Add(time.Hour))
		require.Equal(t, newer, decodePublicJob(t, f.latest(t, p, sourcePath))["id"])
	})

	t.Run("scopes to the requested project and path", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		p := f.scope.ProjectID
		otherProject := f.scope.MustProject(t, uniqueProjectID("pother"), "Other")
		mustLatestFileJob(t, f.scope, otherProject, sourcePath, base, publicJobSeed{})
		mustLatestFileJob(t, f.scope, p, "locales/en/other.xliff", base, publicJobSeed{})
		requirePublicAPIError(t, f.latest(t, p, sourcePath), http.StatusNotFound, "job_not_found", "Job not found")
	})

	t.Run("normalizes the source path", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		id := mustLatestFileJob(t, f.scope, f.scope.ProjectID, sourcePath, base, publicJobSeed{})
		for _, path := range []string{`.\locales\en\source.xliff`, "././locales//en/source.xliff", "  locales/en/source.xliff  "} {
			require.Equal(t, id, decodePublicJob(t, f.latest(t, f.scope.ProjectID, path))["id"], path)
		}
		requirePublicAPIError(t, f.latest(t, f.scope.ProjectID, "./"), http.StatusNotFound, "job_not_found", "Job not found")
		requirePublicAPIError(t, f.latest(t, f.scope.ProjectID, "Locales/en/source.xliff"), http.StatusNotFound, "job_not_found", "Job not found")
	})

	t.Run("decodes the project id", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		id := mustLatestFileJob(t, f.scope, f.scope.ProjectID, sourcePath, base, publicJobSeed{})
		doubleEncoded := url.QueryEscape(url.PathEscape(" " + f.scope.ProjectID))
		rec := f.get(t, "/v1/jobs/latest?projectId="+doubleEncoded+"&sourcePath="+url.QueryEscape(sourcePath))
		require.Equal(t, id, decodePublicJob(t, rec)["id"])
	})

	t.Run("rejects inaccessible projects", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		other := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
		mustLatestFileJob(t, other, other.ProjectID, sourcePath, base, publicJobSeed{})
		requirePublicAPIError(t, f.latest(t, other.ProjectID, sourcePath), http.StatusNotFound, "project_not_found", "Project not found")
		requirePublicAPIError(t, f.latest(t, "project_missing", sourcePath), http.StatusNotFound, "project_not_found", "Project not found")
	})

	t.Run("validates the query", func(t *testing.T) {
		f := newPublicJobsFixture(t, "admin", nil)
		p := f.scope.ProjectID
		for name, query := range map[string]string{
			"missing project":      "sourcePath=a.xliff",
			"missing source path":  "projectId=" + p,
			"blank project":        "projectId=%20&sourcePath=a.xliff",
			"blank source path":    "projectId=" + p + "&sourcePath=%C2%A0",
			"project too long":     "projectId=" + strings.Repeat("p", 129) + "&sourcePath=a.xliff",
			"source path too long": "projectId=" + p + "&sourcePath=" + strings.Repeat("a", 2049),
			"repeated project":     "projectId=" + p + "&projectId=" + p + "&sourcePath=a.xliff",
			"repeated source path": "projectId=" + p + "&sourcePath=a.xliff&sourcePath=b.xliff",
		} {
			t.Run(name, func(t *testing.T) {
				requirePublicAPIError(t, f.get(t, "/v1/jobs/latest?"+query), http.StatusBadRequest, "invalid_job_payload", "Invalid job payload")
			})
		}
	})
}
