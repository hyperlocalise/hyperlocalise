package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	publicJobsRequestTimeout = 30 * time.Second
	publicJobIDMax           = 128
	publicJobProjectIDMax    = 128
	publicJobSourcePathMax   = 2048
	publicJobTimeLayout      = "2006-01-02T15:04:05.000Z"
)

const publicJobAccessSQL = `j.organization_id=$2 and ($3 or exists(select 1 from projects p
        join teams t on t.organization_id=p.organization_id and (t.id=p.team_id or (p.team_id is null and t.slug='default'))
        join team_memberships m on m.team_id=t.id and m.user_id=$4
        where p.id=j.project_id and p.organization_id=$2))`

type publicJobsAPI struct {
	auth *publicAPIAuth
}

type publicJobOutputFile struct {
	FileID   string `json:"fileId"`
	Locale   string `json:"locale"`
	Filename string `json:"filename"`
}

type publicJobEnvelope struct {
	ID          string                 `json:"id"`
	ProjectID   *string                `json:"projectId"`
	Type        *string                `json:"type"`
	Status      string                 `json:"status"`
	CreatedAt   string                 `json:"createdAt"`
	UpdatedAt   string                 `json:"updatedAt"`
	CompletedAt *string                `json:"completedAt"`
	LastError   *string                `json:"lastError"`
	OutputFiles *[]publicJobOutputFile `json:"outputFiles"`
}

type publicJobStatusEnvelope struct {
	ID          string  `json:"id"`
	ProjectID   *string `json:"projectId"`
	Kind        string  `json:"kind"`
	Type        *string `json:"type"`
	Status      string  `json:"status"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	CompletedAt *string `json:"completedAt"`
	LastError   *string `json:"lastError"`
}

type publicJobRow struct {
	id             string
	projectID      *string
	kind           string
	jobType        *string
	status         string
	outcomeKind    *string
	outcomePayload []byte
	lastError      *string
	createdAt      time.Time
	updatedAt      time.Time
	completedAt    *time.Time
}

func (api *publicJobsAPI) register(mux *http.ServeMux) {
	for pattern, handler := range map[string]http.HandlerFunc{
		"GET /v1/jobs/latest":         api.latest,
		"GET /v1/jobs/{jobId}":        api.get,
		"GET /v1/jobs/{jobId}/status": api.status,
	} {
		protected := api.auth.middleware(api.auth.requirePermission("jobs:read", handler))
		mux.Handle(pattern, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			ctx, cancel := context.WithTimeout(r.Context(), publicJobsRequestTimeout)
			defer cancel()
			protected.ServeHTTP(w, r.WithContext(ctx))
		}))
	}
}

func publicJobNotFound() error {
	return publicAPIFailure(http.StatusNotFound, "job_not_found", "Job not found")
}

func publicJobProjectNotFound() error {
	return publicAPIFailure(http.StatusNotFound, "project_not_found", "Project not found")
}

func publicJobInvalidPayload() error {
	return publicAPIFailure(http.StatusBadRequest, "invalid_job_payload", "Invalid job payload")
}

func publicJobsUnavailable() error {
	return publicAPIFailure(http.StatusServiceUnavailable, "public_api_unavailable", "Public API is unavailable")
}

func (api *publicJobsAPI) get(w http.ResponseWriter, r *http.Request) {
	job, ok := api.loadByPath(w, r)
	if !ok {
		return
	}
	writePublicJobJSON(w, r, map[string]publicJobEnvelope{"job": job.envelope()})
}

func (api *publicJobsAPI) status(w http.ResponseWriter, r *http.Request) {
	job, ok := api.loadByPath(w, r)
	if !ok {
		return
	}
	writePublicJobJSON(w, r, map[string]publicJobStatusEnvelope{"job": {
		ID:          job.id,
		ProjectID:   job.projectID,
		Kind:        job.kind,
		Type:        job.jobType,
		Status:      job.status,
		CreatedAt:   formatPublicJobTime(job.createdAt),
		UpdatedAt:   formatPublicJobTime(job.updatedAt),
		CompletedAt: formatOptionalPublicJobTime(job.completedAt),
		LastError:   job.lastError,
	}})
}

func (api *publicJobsAPI) latest(w http.ResponseWriter, r *http.Request) {
	principal, ok := publicAPIPrincipalFrom(r.Context())
	if !ok {
		api.auth.writeError(w, r, "auth", publicAPIFailure(http.StatusUnauthorized, "unauthorized", "Authentication required"))
		return
	}
	projectID, sourcePath, ok := parseLatestPublicJobQuery(r)
	if !ok {
		api.auth.writeError(w, r, "query", publicJobInvalidPayload())
		return
	}
	job, err := api.loadLatest(r.Context(), principal, projectID, normalizePublicJobSourcePath(sourcePath))
	if err != nil {
		api.auth.writeError(w, r, "load", err)
		return
	}
	writePublicJobJSON(w, r, map[string]publicJobEnvelope{"job": job.envelope()})
}

func (api *publicJobsAPI) loadByPath(w http.ResponseWriter, r *http.Request) (publicJobRow, bool) {
	principal, ok := publicAPIPrincipalFrom(r.Context())
	if !ok {
		api.auth.writeError(w, r, "auth", publicAPIFailure(http.StatusUnauthorized, "unauthorized", "Authentication required"))
		return publicJobRow{}, false
	}
	jobID := trimDictionaryInput(r.PathValue("jobId"))
	if jobID == "" || utf16Length(jobID) > publicJobIDMax {
		api.auth.writeError(w, r, "params", publicJobNotFound())
		return publicJobRow{}, false
	}
	job, err := api.loadJob(r.Context(), principal, jobID)
	if err != nil {
		api.auth.writeError(w, r, "load", err)
		return publicJobRow{}, false
	}
	return job, true
}

func parseLatestPublicJobQuery(r *http.Request) (projectID, sourcePath string, ok bool) {
	values := r.URL.Query()
	single := func(name string) (string, bool) {
		raw := values[name]
		if len(raw) != 1 {
			return "", false
		}
		return raw[0], true
	}
	rawProjectID, projectOK := single("projectId")
	rawSourcePath, sourceOK := single("sourcePath")
	if !projectOK || !sourceOK {
		return "", "", false
	}
	projectID = normalizeDictionaryProjectID(rawProjectID)
	sourcePath = trimDictionaryInput(rawSourcePath)
	projectLength, sourceLength := utf16Length(projectID), utf16Length(sourcePath)
	ok = projectLength >= 1 && projectLength <= publicJobProjectIDMax &&
		sourceLength >= 1 && sourceLength <= publicJobSourcePathMax
	return projectID, sourcePath, ok
}

func normalizePublicJobSourcePath(sourcePath string) string {
	sourcePath = strings.ReplaceAll(sourcePath, `\`, "/")
	for strings.HasPrefix(sourcePath, "./") {
		sourcePath = sourcePath[2:]
	}
	for strings.Contains(sourcePath, "//") {
		sourcePath = strings.ReplaceAll(sourcePath, "//", "/")
	}
	return sourcePath
}

func (api *publicJobsAPI) loadJob(ctx context.Context, principal publicAPIPrincipal, jobID string) (publicJobRow, error) {
	pool := api.auth.pool
	if pool == nil {
		return publicJobRow{}, publicJobsUnavailable()
	}
	row := pool.QueryRow(ctx, `select j.id, j.project_id, j.kind::text, d.type::text, j.status::text, d.outcome_kind::text,
            j.outcome_payload, j.last_error, j.created_at, j.updated_at, j.completed_at
        from jobs j
        left join translation_job_details d on d.job_id=j.id
        where j.id=$1 and `+publicJobAccessSQL+`
        limit 1`,
		jobID, principal.organizationID, hasOrganizationCapability(principal.role, "teams:write"), principal.userID)
	job, err := scanPublicJob(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return publicJobRow{}, publicJobNotFound()
	}
	if err != nil {
		return publicJobRow{}, publicAPIInternalFailure(fmt.Errorf("find job: %w", err))
	}
	return job, nil
}

func (api *publicJobsAPI) loadLatest(ctx context.Context, principal publicAPIPrincipal, projectID, sourcePath string) (publicJobRow, error) {
	pool := api.auth.pool
	if pool == nil {
		return publicJobRow{}, publicJobsUnavailable()
	}
	orgWide := hasOrganizationCapability(principal.role, "teams:write")

	var found string
	err := pool.QueryRow(ctx, `select p.id from projects p
        where p.id=$1 and p.organization_id=$2
        and ($3 or exists(select 1 from team_memberships m join teams t on t.id=m.team_id
            where m.user_id=$4 and t.organization_id=$2 and (t.id=p.team_id or (p.team_id is null and t.slug='default'))))`,
		projectID, principal.organizationID, orgWide, principal.userID).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return publicJobRow{}, publicJobProjectNotFound()
	}
	if err != nil {
		return publicJobRow{}, publicAPIInternalFailure(fmt.Errorf("find project: %w", err))
	}

	row := pool.QueryRow(ctx, `select j.id, j.project_id, j.kind::text, d.type::text, j.status::text, d.outcome_kind::text,
            j.outcome_payload, j.last_error, j.created_at, j.updated_at, j.completed_at
        from repository_source_file_versions v
        join translation_job_details d on d.source_file_version_id=v.id
        join jobs j on j.id=d.job_id
        where v.organization_id=$2 and v.project_id=$1 and v.source_path=$5
            and `+publicJobAccessSQL+`
            and j.kind='translation' and j.status='succeeded'
            and d.type='file' and d.outcome_kind='file_result'
        order by v.created_at desc, j.created_at desc
        limit 1`,
		found, principal.organizationID, orgWide, principal.userID, sourcePath)
	job, err := scanPublicJob(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return publicJobRow{}, publicJobNotFound()
	}
	if err != nil {
		return publicJobRow{}, publicAPIInternalFailure(fmt.Errorf("find latest job: %w", err))
	}
	return job, nil
}

func scanPublicJob(row pgx.Row) (publicJobRow, error) {
	var job publicJobRow
	err := row.Scan(&job.id, &job.projectID, &job.kind, &job.jobType, &job.status, &job.outcomeKind,
		&job.outcomePayload, &job.lastError, &job.createdAt, &job.updatedAt, &job.completedAt)
	return job, err
}

func (job publicJobRow) envelope() publicJobEnvelope {
	return publicJobEnvelope{
		ID:          job.id,
		ProjectID:   job.projectID,
		Type:        job.jobType,
		Status:      job.status,
		CreatedAt:   formatPublicJobTime(job.createdAt),
		UpdatedAt:   formatPublicJobTime(job.updatedAt),
		CompletedAt: formatOptionalPublicJobTime(job.completedAt),
		LastError:   job.lastError,
		OutputFiles: publicJobOutputFiles(job.jobType, job.outcomeKind, job.outcomePayload),
	}
}

func publicJobOutputFiles(jobType, outcomeKind *string, payload []byte) *[]publicJobOutputFile {
	if jobType == nil || *jobType != "file" || outcomeKind == nil || *outcomeKind != "file_result" {
		return nil
	}
	var outcome map[string]json.RawMessage
	if err := json.Unmarshal(payload, &outcome); err != nil || outcome == nil {
		return nil
	}
	var entries []json.RawMessage
	if err := json.Unmarshal(outcome["outputFiles"], &entries); err != nil || entries == nil {
		return nil
	}
	files := make([]publicJobOutputFile, 0, len(entries))
	for _, entry := range entries {
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(entry, &fields); err != nil {
			return nil
		}
		var file publicJobOutputFile
		for name, dest := range map[string]*string{"fileId": &file.FileID, "locale": &file.Locale, "filename": &file.Filename} {
			raw, present := fields[name]
			if !present || json.Unmarshal(raw, dest) != nil || trimDictionaryInput(*dest) == "" {
				return nil
			}
		}
		files = append(files, file)
	}
	return &files
}

func formatPublicJobTime(t time.Time) string {
	return t.UTC().Format(publicJobTimeLayout)
}

func formatOptionalPublicJobTime(t *time.Time) *string {
	if t == nil {
		return nil
	}
	formatted := formatPublicJobTime(*t)
	return &formatted
}

func writePublicJobJSON(w http.ResponseWriter, r *http.Request, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.WarnContext(r.Context(), "public_api_response_write_failed")
	}
}
