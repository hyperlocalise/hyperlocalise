package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	jobListDefaultLimit = 50
	jobListMinLimit     = 1
	jobListMaxLimit     = 100
	jsMaxSafeInteger    = 1<<53 - 1
)

var (
	jobKindValues         = []string{"translation", "research", "review", "proofread", "sync", "asset_management"}
	jobTypeValues         = []string{"string", "file"}
	jobStatusValues       = []string{"queued", "running", "succeeded", "failed", "waiting_for_review", "cancelled"}
	jobRelationshipValues = []string{"assigned", "created"}

	jsDecimalLiteralPattern = regexp.MustCompile(`^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$`)
)

type jobListQuery struct {
	kind, jobType, status, relationship string
	open, triage                        bool
	limit                               int
}

type jobQueryIssue struct {
	Path    []any  `json:"path"`
	Message string `json:"message"`
}

// parseJobListQuery preserves Hono's Zod boolean coercion for API parity:
// any non-empty string, including "false", evaluates to true.
func parseJobListQuery(values url.Values) (jobListQuery, error) {
	query := jobListQuery{limit: jobListDefaultLimit}
	var issues []jobQueryIssue
	parseEnum := func(key string, allowed []string, dest *string) {
		raw := values[key]
		if len(raw) == 0 {
			return
		}
		if len(raw) == 1 && slices.Contains(allowed, raw[0]) {
			*dest = raw[0]
			return
		}
		issues = append(issues, jobQueryIssue{Path: []any{key}, Message: "Invalid option: expected one of " + quotedJobQueryOptions(allowed)})
	}
	parseEnum("kind", jobKindValues, &query.kind)
	parseEnum("type", jobTypeValues, &query.jobType)
	parseEnum("status", jobStatusValues, &query.status)
	query.open = coerceJobQueryBool(values["open"])
	query.triage = coerceJobQueryBool(values["triage"])
	parseEnum("relationship", jobRelationshipValues, &query.relationship)
	if raw := values["limit"]; len(raw) > 0 {
		value := math.NaN()
		if len(raw) == 1 {
			value = jsNumber(raw[0])
		}
		limit, limitIssues := validateJobListLimit(value)
		query.limit = limit
		issues = append(issues, limitIssues...)
	}
	if len(issues) > 0 {
		return jobListQuery{}, projectFailureDetails(http.StatusBadRequest, "invalid_job_query", "Invalid job query parameters", map[string]any{"issues": issues})
	}
	return query, nil
}

func quotedJobQueryOptions(options []string) string {
	quoted := make([]string, len(options))
	for i, option := range options {
		quoted[i] = strconv.Quote(option)
	}
	return strings.Join(quoted, "|")
}

func coerceJobQueryBool(raw []string) bool {
	return len(raw) > 1 || (len(raw) == 1 && raw[0] != "")
}

func validateJobListLimit(value float64) (int, []jobQueryIssue) {
	issue := func(message string) jobQueryIssue {
		return jobQueryIssue{Path: []any{"limit"}, Message: message}
	}
	switch {
	case math.IsNaN(value):
		return 0, []jobQueryIssue{issue("Invalid input: expected number, received NaN")}
	case math.IsInf(value, 1):
		return 0, []jobQueryIssue{issue("Invalid input: expected number, received Infinity")}
	case math.IsInf(value, -1):
		return 0, []jobQueryIssue{issue("Invalid input: expected number, received -Infinity")}
	case value != math.Trunc(value):
		return 0, []jobQueryIssue{issue("Invalid input: expected int, received number")}
	}
	var issues []jobQueryIssue
	if value > jsMaxSafeInteger {
		issues = append(issues, issue("Too big: expected int to be <="+strconv.Itoa(jsMaxSafeInteger)))
	}
	if value < -jsMaxSafeInteger {
		issues = append(issues, issue("Too small: expected int to be >=-"+strconv.Itoa(jsMaxSafeInteger)))
	}
	if value < jobListMinLimit {
		issues = append(issues, issue("Too small: expected number to be >="+strconv.Itoa(jobListMinLimit)))
	}
	if value > jobListMaxLimit {
		issues = append(issues, issue("Too big: expected number to be <="+strconv.Itoa(jobListMaxLimit)))
	}
	if len(issues) > 0 {
		return 0, issues
	}
	return int(value), nil
}

func jsNumber(raw string) float64 {
	value := trimDictionaryInput(raw)
	switch value {
	case "":
		return 0
	case "Infinity", "+Infinity":
		return math.Inf(1)
	case "-Infinity":
		return math.Inf(-1)
	}
	if len(value) > 2 && value[0] == '0' {
		base := 0
		switch value[1] {
		case 'x', 'X':
			base = 16
		case 'o', 'O':
			base = 8
		case 'b', 'B':
			base = 2
		}
		if base != 0 {
			return jsRadixNumber(value[2:], base)
		}
	}
	if !jsDecimalLiteralPattern.MatchString(value) {
		return math.NaN()
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil && !errors.Is(err, strconv.ErrRange) {
		return math.NaN()
	}
	return parsed
}

func jsRadixNumber(digits string, base int) float64 {
	var result float64
	for _, r := range digits {
		digit, err := strconv.ParseUint(string(r), base, 8)
		if err != nil {
			return math.NaN()
		}
		result = result*float64(base) + float64(digit)
	}
	return result
}

const (
	jobParamMaxLength = 128
	jobTriageLookback = 7 * 24 * time.Hour
)

const jobRecordColumnsSQL = `j.id, j.organization_id::text, j.project_id, j.created_by_user_id::text, j.owner_user_id::text,
            j.assignee_type::text, j.kind::text, t.type::text, j.status::text, j.input_payload, t.outcome_kind::text,
            j.outcome_payload, j.last_error, j.workflow_run_id, j.interaction_id::text, j.context_snapshot,
            r.criteria, r.target_locale, r.config, s.connector_kind, s.direction, s.external_identifiers,
            a.asset_type, a.operation, a.config, e.provider_kind::text, e.external_job_id, e.external_task_id,
            e.external_status, e.title, e.due_date, e.target_locales, e.assigned_users, e.external_url,
            e.sync_state, e.provider_payload, e.linked_job_id, j.created_at, j.updated_at, j.completed_at, p.name`

const jobRecordFromSQL = `from jobs j
        left join translation_job_details t on t.job_id = j.id
        left join review_job_details r on r.job_id = j.id
        left join sync_job_details s on s.job_id = j.id
        left join asset_management_job_details a on a.job_id = j.id
        left join external_job_details e on e.job_id = j.id
        left join projects p on p.id = j.project_id and p.organization_id = j.organization_id`

type jobRecord struct {
	ID                      string          `json:"id"`
	OrganizationID          string          `json:"organizationId"`
	ProjectID               *string         `json:"projectId"`
	CreatedByUserID         *string         `json:"createdByUserId"`
	OwnerUserID             *string         `json:"ownerUserId"`
	AssigneeType            *string         `json:"assigneeType"`
	Kind                    string          `json:"kind"`
	Type                    *string         `json:"type"`
	Status                  string          `json:"status"`
	InputPayload            json.RawMessage `json:"inputPayload"`
	OutcomeKind             *string         `json:"outcomeKind"`
	OutcomePayload          json.RawMessage `json:"outcomePayload"`
	LastError               *string         `json:"lastError"`
	WorkflowRunID           *string         `json:"workflowRunId"`
	InteractionID           *string         `json:"interactionId"`
	ContextSnapshot         json.RawMessage `json:"contextSnapshot"`
	ReviewCriteria          *string         `json:"reviewCriteria"`
	ReviewTargetLocale      *string         `json:"reviewTargetLocale"`
	ReviewConfig            json.RawMessage `json:"reviewConfig"`
	SyncConnectorKind       *string         `json:"syncConnectorKind"`
	SyncDirection           *string         `json:"syncDirection"`
	SyncExternalIdentifiers json.RawMessage `json:"syncExternalIdentifiers"`
	AssetType               *string         `json:"assetType"`
	AssetOperation          *string         `json:"assetOperation"`
	AssetConfig             json.RawMessage `json:"assetConfig"`
	ExternalProviderKind    *string         `json:"externalProviderKind"`
	ExternalJobID           *string         `json:"externalJobId"`
	ExternalTaskID          *string         `json:"externalTaskId"`
	ExternalStatus          *string         `json:"externalStatus"`
	ExternalTitle           *string         `json:"externalTitle"`
	ExternalDueDate         *string         `json:"externalDueDate"`
	ExternalTargetLocales   json.RawMessage `json:"externalTargetLocales"`
	ExternalAssignedUsers   json.RawMessage `json:"externalAssignedUsers"`
	ExternalURL             *string         `json:"externalUrl"`
	ExternalSyncState       *string         `json:"externalSyncState"`
	ExternalProviderPayload json.RawMessage `json:"externalProviderPayload"`
	LinkedJobID             *string         `json:"linkedJobId"`
	CreatedAt               string          `json:"createdAt"`
	UpdatedAt               string          `json:"updatedAt"`
	CompletedAt             *string         `json:"completedAt"`
	jobSourceFileDisplay
}

type jobWithProjectRecord struct {
	jobRecord
	ProjectName *string `json:"projectName"`
}

func projectJobNotFound() error {
	return projectFailure(http.StatusNotFound, "job_not_found", "Job not found")
}

func jobProjectIDParam(raw string) (string, bool) {
	projectID := normalizeDictionaryProjectID(raw)
	return projectID, projectID != "" && utf16Length(projectID) <= jobParamMaxLength
}

func jobIDParam(raw string) (string, bool) {
	jobID := trimDictionaryInput(raw)
	return jobID, jobID != "" && utf16Length(jobID) <= jobParamMaxLength
}

// requireAccessibleNativeProject restricts access to native projects,
// excluding encoded provider IDs and external_tms provider projects.
func (api *projectAPI) requireAccessibleNativeProject(ctx context.Context, actor projectActor, projectID string) error {
	if strings.HasPrefix(projectID, "ext:") {
		return projectNotFound()
	}
	var exists bool
	if err := api.pool.QueryRow(ctx, `
        select exists(
            select 1 from projects p
            where p.id = $1 and p.organization_id = $2 and p.source = 'native'
                and `+formatQaProjectTeamAccessSQL(3, 4, 2)+`
        )`,
		projectID, actor.organizationID, actor.canReadAllTeams(), actor.userID,
	).Scan(&exists); err != nil {
		return fmt.Errorf("check native job project: %w", err)
	}
	if !exists {
		return projectNotFound()
	}
	return nil
}

func (api *projectAPI) projectJobParams(r *http.Request, actor projectActor) (projectID, jobID string, err error) {
	projectID, projectOK := jobProjectIDParam(r.PathValue("projectId"))
	jobID, jobOK := jobIDParam(r.PathValue("jobId"))
	if !projectOK || !jobOK {
		return "", "", projectJobNotFound()
	}
	if err := api.requireAccessibleNativeProject(r.Context(), actor, projectID); err != nil {
		return "", "", err
	}
	return projectID, jobID, nil
}

func jobListConditions(query jobListQuery, args []any, now time.Time) ([]string, []any) {
	var conditions []string
	add := func(format string, value any) {
		args = append(args, value)
		conditions = append(conditions, fmt.Sprintf(format, len(args)))
	}
	if query.kind != "" {
		add("j.kind = $%d::job_kind", query.kind)
	}
	if query.jobType != "" {
		add("t.type = $%d::translation_job_type", query.jobType)
	}
	switch {
	case query.triage:
		conditions = append(conditions, "j.status in ('waiting_for_review', 'failed', 'queued', 'running')")
		add("j.updated_at >= $%d", now.Add(-jobTriageLookback))
	case query.open:
		conditions = append(conditions, "j.status in ('queued', 'running', 'waiting_for_review')")
	case query.status != "":
		add("j.status = $%d::job_status", query.status)
	}
	return conditions, args
}

func jobListOrderSQL(triage bool) string {
	if triage {
		return "case j.status when 'waiting_for_review' then 0 when 'failed' then 1 else 2 end, j.updated_at desc, j.id desc"
	}
	return "j.updated_at desc, j.id desc"
}

func (api *projectAPI) jobAssignedCondition(ctx context.Context, actor projectActor, args []any) (string, []any, error) {
	candidates, err := api.providerAssigneeCandidates(ctx, actor)
	if err != nil {
		return "", nil, err
	}
	args = append(args, actor.userID)
	owner := fmt.Sprintf("j.owner_user_id = $%d", len(args))
	if len(candidates) == 0 {
		return "(" + owner + " or false)", args, nil
	}
	args = append(args, candidates)
	return fmt.Sprintf(`(%s or exists (
            select 1 from jsonb_array_elements_text(e.assigned_users) as assigned_user(value)
            where lower(assigned_user.value) = any($%d)
        ))`, owner, len(args)), args, nil
}

func (api *projectAPI) providerAssigneeCandidates(ctx context.Context, actor projectActor) ([]string, error) {
	values := make([]*string, 7)
	err := api.pool.QueryRow(ctx, `
        select u.email, c.username, c.email, c.full_name, ph.username, ph.email, ph.full_name
        from users u
        left join crowdin_user_connections c on c.organization_id = $1 and c.user_id = u.id
        left join phrase_user_connections ph on ph.organization_id = $1 and ph.user_id = u.id
        where u.id = $2`,
		actor.organizationID, actor.userID,
	).Scan(&values[0], &values[1], &values[2], &values[3], &values[4], &values[5], &values[6])
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load provider assignee candidates: %w", err)
	}
	candidates := make([]string, 0, len(values))
	for _, value := range values {
		if value == nil {
			continue
		}
		candidate := strings.ToLower(trimDictionaryInput(*value))
		if candidate != "" && !slices.Contains(candidates, candidate) {
			candidates = append(candidates, candidate)
		}
	}
	return candidates, nil
}

func scanJobRecord(row pgx.Row) (jobWithProjectRecord, error) {
	var job jobWithProjectRecord
	var dueDate, completedAt *time.Time
	var createdAt, updatedAt time.Time
	err := row.Scan(
		&job.ID, &job.OrganizationID, &job.ProjectID, &job.CreatedByUserID, &job.OwnerUserID,
		&job.AssigneeType, &job.Kind, &job.Type, &job.Status, &job.InputPayload, &job.OutcomeKind,
		&job.OutcomePayload, &job.LastError, &job.WorkflowRunID, &job.InteractionID, &job.ContextSnapshot,
		&job.ReviewCriteria, &job.ReviewTargetLocale, &job.ReviewConfig, &job.SyncConnectorKind, &job.SyncDirection, &job.SyncExternalIdentifiers,
		&job.AssetType, &job.AssetOperation, &job.AssetConfig, &job.ExternalProviderKind, &job.ExternalJobID, &job.ExternalTaskID,
		&job.ExternalStatus, &job.ExternalTitle, &dueDate, &job.ExternalTargetLocales, &job.ExternalAssignedUsers, &job.ExternalURL,
		&job.ExternalSyncState, &job.ExternalProviderPayload, &job.LinkedJobID, &createdAt, &updatedAt, &completedAt, &job.ProjectName,
	)
	if err != nil {
		return jobWithProjectRecord{}, err
	}
	job.ExternalDueDate = formatOptionalPublicJobTime(dueDate)
	job.CreatedAt = formatPublicJobTime(createdAt)
	job.UpdatedAt = formatPublicJobTime(updatedAt)
	job.CompletedAt = formatOptionalPublicJobTime(completedAt)
	return job, nil
}

func (api *projectAPI) attachJobSourceFiles(ctx context.Context, jobs []jobWithProjectRecord) error {
	inputs := make([]jobSourceFileInput, len(jobs))
	for i := range jobs {
		inputs[i] = jobSourceFileInput{organizationID: jobs[i].OrganizationID, inputPayload: jobs[i].InputPayload}
	}
	displays, err := resolveJobSourceFileDisplays(ctx, api.pool, inputs)
	if err != nil {
		return err
	}
	for i := range jobs {
		jobs[i].jobSourceFileDisplay = displays[i]
	}
	return nil
}

func (api *projectAPI) listJobRecords(ctx context.Context, conditions []string, orderBy string, args []any) ([]jobWithProjectRecord, error) {
	rows, err := api.pool.Query(ctx, "select "+jobRecordColumnsSQL+"\n        "+jobRecordFromSQL+
		"\n        where "+strings.Join(conditions, "\n            and ")+
		"\n        order by "+orderBy+
		"\n        limit $"+strconv.Itoa(len(args)), args...)
	if err != nil {
		return nil, fmt.Errorf("list jobs: %w", err)
	}
	defer rows.Close()
	jobs := make([]jobWithProjectRecord, 0)
	for rows.Next() {
		job, err := scanJobRecord(rows)
		if err != nil {
			return nil, fmt.Errorf("scan job: %w", err)
		}
		jobs = append(jobs, job)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate jobs: %w", err)
	}
	if err := api.attachJobSourceFiles(ctx, jobs); err != nil {
		return nil, err
	}
	return jobs, nil
}

func (api *projectAPI) projectJobsListHandler(r *http.Request, actor projectActor) (any, int, error) {
	projectID, ok := jobProjectIDParam(r.PathValue("projectId"))
	if !ok {
		return nil, 0, projectNotFound()
	}
	query, err := parseJobListQuery(r.URL.Query())
	if err != nil {
		return nil, 0, err
	}
	if err := api.requireAccessibleNativeProject(r.Context(), actor, projectID); err != nil {
		return nil, 0, err
	}
	args := []any{actor.organizationID, projectID}
	conditions := []string{"j.organization_id = $1", "j.project_id = $2", overviewSyncedJobVisibleSQL()}
	filters, args := jobListConditions(query, args, time.Now())
	conditions = append(conditions, filters...)
	switch query.relationship {
	case "assigned":
		var assigned string
		assigned, args, err = api.jobAssignedCondition(r.Context(), actor, args)
		if err != nil {
			return nil, 0, err
		}
		conditions = append(conditions, assigned)
	case "created":
		args = append(args, actor.userID)
		conditions = append(conditions, fmt.Sprintf("j.created_by_user_id = $%d", len(args)))
	}
	args = append(args, query.limit)
	jobs, err := api.listJobRecords(r.Context(), conditions, jobListOrderSQL(query.triage), args)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"jobs": jobs}, http.StatusOK, nil
}

func (api *projectAPI) projectJobDetailHandler(r *http.Request, actor projectActor) (any, int, error) {
	projectID, jobID, err := api.projectJobParams(r, actor)
	if err != nil {
		return nil, 0, err
	}
	job, err := scanJobRecord(api.pool.QueryRow(r.Context(), "select "+jobRecordColumnsSQL+"\n        "+jobRecordFromSQL+`
        where j.organization_id = $1 and j.project_id = $2 and j.id = $3
        limit 1`,
		actor.organizationID, projectID, jobID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, projectJobNotFound()
	}
	if err != nil {
		return nil, 0, fmt.Errorf("get project job: %w", err)
	}
	jobs := []jobWithProjectRecord{job}
	if err := api.attachJobSourceFiles(r.Context(), jobs); err != nil {
		return nil, 0, err
	}
	return map[string]jobRecord{"job": jobs[0].jobRecord}, http.StatusOK, nil
}

func (api *projectAPI) projectJobStatusHandler(r *http.Request, actor projectActor) (any, int, error) {
	projectID, jobID, err := api.projectJobParams(r, actor)
	if err != nil {
		return nil, 0, err
	}
	var job publicJobStatusEnvelope
	var createdAt, updatedAt time.Time
	var completedAt *time.Time
	err = api.pool.QueryRow(r.Context(), `
        select j.id, j.project_id, j.kind::text, t.type::text, j.status::text,
            j.created_at, j.updated_at, j.completed_at, j.last_error
        from jobs j
        left join translation_job_details t on t.job_id = j.id
        where j.organization_id = $1 and j.project_id = $2 and j.id = $3
        limit 1`,
		actor.organizationID, projectID, jobID,
	).Scan(&job.ID, &job.ProjectID, &job.Kind, &job.Type, &job.Status, &createdAt, &updatedAt, &completedAt, &job.LastError)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, projectJobNotFound()
	}
	if err != nil {
		return nil, 0, fmt.Errorf("get project job status: %w", err)
	}
	job.CreatedAt = formatPublicJobTime(createdAt)
	job.UpdatedAt = formatPublicJobTime(updatedAt)
	job.CompletedAt = formatOptionalPublicJobTime(completedAt)
	return map[string]publicJobStatusEnvelope{"job": job}, http.StatusOK, nil
}

func (api *projectAPI) orgJobsListHandler(r *http.Request, actor projectActor) (any, int, error) {
	query, err := parseJobListQuery(r.URL.Query())
	if err != nil {
		return nil, 0, err
	}
	var args []any
	var conditions []string
	switch query.relationship {
	case "assigned":
		args = []any{actor.organizationID}
		var assigned string
		assigned, args, err = api.jobAssignedCondition(r.Context(), actor, args)
		if err != nil {
			return nil, 0, err
		}
		conditions = []string{"j.organization_id = $1", assigned}
	case "created":
		args = []any{actor.organizationID, actor.canReadAllTeams(), actor.userID}
		conditions = []string{overviewJobsVisibleSQL(), "j.created_by_user_id = $3"}
	default:
		args = []any{actor.organizationID, actor.canReadAllTeams(), actor.userID}
		conditions = []string{overviewJobsVisibleSQL()}
	}
	conditions = append(conditions, overviewSyncedJobVisibleSQL())
	filters, args := jobListConditions(query, args, time.Now())
	conditions = append(conditions, filters...)
	args = append(args, query.limit)
	jobs, err := api.listJobRecords(r.Context(), conditions, jobListOrderSQL(query.triage), args)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"jobs": jobs}, http.StatusOK, nil
}

func (api *projectAPI) orgJobDetailHandler(r *http.Request, actor projectActor) (any, int, error) {
	jobID, ok := jobIDParam(r.PathValue("jobId"))
	if !ok {
		return nil, 0, projectJobNotFound()
	}
	job, err := scanJobRecord(api.pool.QueryRow(r.Context(), "select "+jobRecordColumnsSQL+"\n        "+jobRecordFromSQL+`
        where `+overviewJobsVisibleSQL()+`
            and j.id = $4
            and e.job_id is null
        limit 1`,
		actor.organizationID, actor.canReadAllTeams(), actor.userID, jobID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, projectJobNotFound()
	}
	if err != nil {
		return nil, 0, fmt.Errorf("get organization job: %w", err)
	}
	jobs := []jobWithProjectRecord{job}
	if err := api.attachJobSourceFiles(r.Context(), jobs); err != nil {
		return nil, 0, err
	}
	return map[string]jobWithProjectRecord{"job": jobs[0]}, http.StatusOK, nil
}
