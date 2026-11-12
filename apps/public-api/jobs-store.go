package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var (
	errJobNotFound         = fmt.Errorf("%w: job", errResourceNotFound)
	errJobNotUpdatable     = errors.New("provider jobs are updated in the provider")
	errJobProjectRequired  = errors.New("job has no project")
	errJobOwnerNotFound    = errors.New("job owner is not a workspace member")
	errJobOwnerUnassigable = errors.New("job owner cannot access the project")
)

var (
	jobStatuses = []string{"queued", "running", "succeeded", "failed", "waiting_for_review", "cancelled"}
	jobKinds    = []string{"translation", "research", "review", "proofread", "sync", "asset_management"}
)

// jobOutputFile is one translated file of a finished file job.
type jobOutputFile struct {
	FileID   string `json:"fileId"`
	Locale   string `json:"locale"`
	Filename string `json:"filename"`
}

// jobSourceFile is the stored file a job translates; Path is nil when the file is not tracked at a
// path in the project.
type jobSourceFile struct {
	FileID string  `json:"fileId"`
	Path   *string `json:"path"`
}

// job matches go-svc's public job envelope, plus kind.
type job struct {
	ID            string           `json:"id"`
	ProjectID     *string          `json:"projectId"`
	Kind          string           `json:"kind"`
	Type          *string          `json:"type"`
	Status        string           `json:"status"`
	CreatedAt     time.Time        `json:"createdAt"`
	UpdatedAt     time.Time        `json:"updatedAt"`
	CompletedAt   *time.Time       `json:"completedAt"`
	LastError     *string          `json:"lastError"`
	Title         *string          `json:"title"`
	Description   *string          `json:"description"`
	DueAt         *time.Time       `json:"dueAt"`
	OwnerEmail    *string          `json:"ownerEmail"`
	OutputFiles   *[]jobOutputFile `json:"outputFiles"`
	SourceFile    *jobSourceFile   `json:"sourceFile"`
	SourceLocale  *string          `json:"sourceLocale"`
	TargetLocales *[]string        `json:"targetLocales"`
}

type jobFilters struct {
	ProjectID string
	Status    string
	Kind      string
	Limit     int
	Offset    int
}

type jobPatch struct {
	Title       *string
	Description optionalString
	DueAt       optionalTime
	OwnerEmail  optionalString
}

// jobAccessPredicate expects a `j` jobs alias. Operators see every workspace job; others see
// jobs of projects their teams can access, as go-svc's public job reads do.
const jobAccessPredicate = `j.organization_id = $1 AND (
	` + workspaceOperatorPredicate + `
	OR EXISTS (
		SELECT 1 FROM projects p
		WHERE p.id = j.project_id AND p.organization_id = $1 AND ` + projectTeamMemberPredicate + `
	)
)`

const jobColumns = `
	j.id, j.project_id, j.kind::text, d.type::text, j.status::text, d.outcome_kind::text,
	j.outcome_payload, j.last_error, j.created_at, j.updated_at, j.completed_at,
	j.input_payload->'metadata'->>'title', j.input_payload->'metadata'->>'description',
	j.due_at, ou.email,
	j.input_payload->>'sourceFileId', sf.source_path,
	j.input_payload->>'sourceLocale', j.input_payload->'targetLocales'`

const jobFrom = `
	FROM jobs j
	LEFT JOIN translation_job_details d ON d.job_id = j.id
	LEFT JOIN repository_source_file_versions v ON v.id = d.source_file_version_id
	LEFT JOIN repository_source_files sf ON sf.id = v.repository_source_file_id
	LEFT JOIN users ou ON ou.id = j.owner_user_id`

func scanJob(row rowScanner) (job, error) {
	var item job
	var outcomeKind *string
	var outcomePayload, targetLocales []byte
	var sourceFileID, sourcePath *string
	err := row.Scan(&item.ID, &item.ProjectID, &item.Kind, &item.Type, &item.Status, &outcomeKind,
		&outcomePayload, &item.LastError, &item.CreatedAt, &item.UpdatedAt, &item.CompletedAt,
		&item.Title, &item.Description, &item.DueAt, &item.OwnerEmail,
		&sourceFileID, &sourcePath, &item.SourceLocale, &targetLocales)
	if err == nil {
		item.OutputFiles = jobOutputFiles(item.Type, outcomeKind, outcomePayload)
		item.SourceFile = jobSourceFileOf(sourceFileID, sourcePath)
		item.TargetLocales = jobTargetLocales(targetLocales)
	}
	return item, err
}

// jobSourceFileOf mirrors go-svc's publicJobSourceFileOf: a job without a saved source file id,
// such as a key job, has no source file.
func jobSourceFileOf(fileID, path *string) *jobSourceFile {
	if fileID == nil || strings.TrimSpace(*fileID) == "" {
		return nil
	}
	return &jobSourceFile{FileID: *fileID, Path: path}
}

// jobTargetLocales mirrors go-svc's publicJobTargetLocales: nil unless the saved value is a list
// of strings.
func jobTargetLocales(raw []byte) *[]string {
	var locales []string
	if err := json.Unmarshal(raw, &locales); err != nil || locales == nil {
		return nil
	}
	return &locales
}

// jobOutputFiles mirrors go-svc's publicJobOutputFiles: a finished file job lists its output
// files, and any malformed entry hides the list.
func jobOutputFiles(jobType, outcomeKind *string, payload []byte) *[]jobOutputFile {
	if jobType == nil || *jobType != "file" || outcomeKind == nil || *outcomeKind != "file_result" {
		return nil
	}
	var outcome struct {
		OutputFiles []map[string]json.RawMessage `json:"outputFiles"`
	}
	if err := json.Unmarshal(payload, &outcome); err != nil || outcome.OutputFiles == nil {
		return nil
	}
	files := make([]jobOutputFile, 0, len(outcome.OutputFiles))
	for _, fields := range outcome.OutputFiles {
		var file jobOutputFile
		for name, dest := range map[string]*string{"fileId": &file.FileID, "locale": &file.Locale, "filename": &file.Filename} {
			raw, present := fields[name]
			if !present || json.Unmarshal(raw, dest) != nil || strings.TrimSpace(*dest) == "" {
				return nil
			}
		}
		files = append(files, file)
	}
	return &files
}

func (s *postgresStore) listJobs(ctx context.Context, actor principal, filters jobFilters) ([]job, int, error) {
	where := newSQLFilter(jobAccessPredicate, actor.OrganizationID, actor.UserID)
	if filters.ProjectID != "" {
		where.add("j.project_id = ?", filters.ProjectID)
	}
	if filters.Status != "" {
		where.add("j.status::text = ?", filters.Status)
	}
	if filters.Kind != "" {
		where.add("j.kind::text = ?", filters.Kind)
	}
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM jobs j WHERE `+where.sql(), where.args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count jobs: %w", err)
	}
	pageSQL := where.page(filters.Limit, filters.Offset)
	rows, err := s.pool.Query(ctx, `SELECT `+jobColumns+jobFrom+` WHERE `+where.sql()+`
		ORDER BY j.created_at DESC, j.id DESC`+pageSQL, where.args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list jobs: %w", err)
	}
	items, err := collectRows(rows, scanJob)
	return items, total, err
}

func (s *postgresStore) getJob(ctx context.Context, actor principal, jobID string) (job, error) {
	return loadJob(ctx, s.pool, actor, jobID)
}

func loadJob(ctx context.Context, db queryRower, actor principal, jobID string) (job, error) {
	item, err := scanJob(db.QueryRow(ctx, `SELECT `+jobColumns+jobFrom+`
		WHERE `+jobAccessPredicate+` AND j.id = $3`, actor.OrganizationID, actor.UserID, jobID))
	if errors.Is(err, pgx.ErrNoRows) {
		return job{}, errJobNotFound
	}
	if err != nil {
		return job{}, fmt.Errorf("load job: %w", err)
	}
	return item, nil
}

// updateJob ports the web app's updateNativeJob: title and description live in the job's input
// metadata, an owner must be an active member who can access the project, and provider-backed
// jobs are rejected.
func (s *postgresStore) updateJob(ctx context.Context, actor principal, jobID string, patch jobPatch) (job, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return job{}, fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var projectID *string
	var kind string
	var external bool
	var before jobAssignment
	var beforeDetails jobDetails
	err = tx.QueryRow(ctx, `SELECT j.project_id, j.kind::text, x.job_id IS NOT NULL,
			j.owner_user_id::text, j.assignee_type::text,
			j.due_at, j.input_payload->'metadata'->>'title', j.input_payload->'metadata'->>'description'
		FROM jobs j
		LEFT JOIN external_job_details x ON x.job_id = j.id
		WHERE `+jobAccessPredicate+` AND j.id = $3
		FOR UPDATE OF j`, actor.OrganizationID, actor.UserID, jobID).Scan(&projectID, &kind, &external, &before.OwnerUserID, &before.AssigneeType,
		&beforeDetails.DueAt, &beforeDetails.Title, &beforeDetails.Description)
	if errors.Is(err, pgx.ErrNoRows) {
		return job{}, errJobNotFound
	}
	if err != nil {
		return job{}, fmt.Errorf("lock job: %w", err)
	}
	if external {
		return job{}, errJobNotUpdatable
	}
	if projectID == nil {
		return job{}, errJobProjectRequired
	}

	set := newSQLFilter("updated_at = now()")
	if patch.DueAt.Set {
		set.add("due_at = ?", patch.DueAt.Value)
	}
	if patch.OwnerEmail.Set {
		if patch.OwnerEmail.Value == nil {
			set.conditions = append(set.conditions, "owner_user_id = NULL", "assignee_type = NULL")
		} else {
			ownerID, err := assignableJobOwner(ctx, tx, actor, *projectID, *patch.OwnerEmail.Value)
			if err != nil {
				return job{}, err
			}
			set.add("owner_user_id = ?::uuid", ownerID)
			set.conditions = append(set.conditions, "assignee_type = 'user'")
		}
	}
	if patch.Title != nil || patch.Description.Set {
		// Non-string metadata values are dropped, as readMetadata in the web app does.
		metadata := `COALESCE((SELECT jsonb_object_agg(m.key, m.value) FROM jsonb_each(
			CASE WHEN jsonb_typeof(input_payload->'metadata') = 'object' THEN input_payload->'metadata' ELSE '{}'::jsonb END
		) m WHERE jsonb_typeof(m.value) = 'string'), '{}'::jsonb)`
		if patch.Title != nil {
			set.args = append(set.args, *patch.Title)
			metadata = fmt.Sprintf("(%s || jsonb_build_object('title', $%d::text))", metadata, len(set.args))
		}
		if patch.Description.Set {
			if patch.Description.Value == nil {
				metadata = fmt.Sprintf("(%s - 'description')", metadata)
			} else {
				set.args = append(set.args, *patch.Description.Value)
				metadata = fmt.Sprintf("(%s || jsonb_build_object('description', $%d::text))", metadata, len(set.args))
			}
		}
		payload := `CASE WHEN jsonb_typeof(input_payload) = 'object' THEN input_payload ELSE '{}'::jsonb END`
		set.conditions = append(set.conditions, fmt.Sprintf("input_payload = jsonb_set(%s, '{metadata}', %s)", payload, metadata))
	}
	args := append(set.args, actor.OrganizationID, jobID)
	n := len(set.args)
	var after jobAssignment
	var afterDetails jobDetails
	var status string
	if err := tx.QueryRow(ctx, fmt.Sprintf(`UPDATE jobs SET %s WHERE organization_id = $%d AND id = $%d
		RETURNING owner_user_id::text, assignee_type::text, status::text,
			due_at, input_payload->'metadata'->>'title', input_payload->'metadata'->>'description'`,
		strings.Join(set.conditions, ", "), n+1, n+2), args...).Scan(&after.OwnerUserID, &after.AssigneeType, &status,
		&afterDetails.DueAt, &afterDetails.Title, &afterDetails.Description); err != nil {
		return job{}, fmt.Errorf("update job: %w", err)
	}
	var changes []string
	if before.key() != after.key() {
		changes = append(changes, "job.assignee_changed")
	}
	if !sameTime(beforeDetails.DueAt, afterDetails.DueAt) {
		changes = append(changes, "job.due_date_changed")
	}
	if !sameString(beforeDetails.Title, afterDetails.Title) || !sameString(beforeDetails.Description, afterDetails.Description) {
		changes = append(changes, "job.details_changed")
	}
	for _, changeType := range changes {
		if err := insertJobChangeEvent(ctx, tx, changeType, actor.OrganizationID, jobID, *projectID, kind, status, after.AssigneeType); err != nil {
			return job{}, err
		}
	}
	updated, err := loadJob(ctx, tx, actor, jobID)
	if err != nil {
		return job{}, err
	}
	if err := insertActivity(ctx, tx, actor, activityEvent{
		EventType:  "job_updated",
		TargetID:   jobID,
		TargetKind: "job",
		Payload:    map[string]any{"jobId": jobID, "kind": kind, "projectId": *projectID, "changedFields": patch.changedFields()},
	}); err != nil {
		return job{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return job{}, fmt.Errorf("commit job update: %w", err)
	}
	return updated, nil
}

// jobAssignment is who a job is assigned to, compared before and after an update.
type jobAssignment struct {
	OwnerUserID  *string
	AssigneeType *string
}

func (a jobAssignment) key() [2]string {
	value := func(s *string) string {
		if s == nil {
			return ""
		}
		return *s
	}
	return [2]string{value(a.OwnerUserID), value(a.AssigneeType)}
}

// jobDetails is a job's due date, title and description, compared before and after an update.
type jobDetails struct {
	DueAt       *time.Time
	Title       *string
	Description *string
}

func sameTime(a, b *time.Time) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.Equal(*b)
}

func sameString(a, b *string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// insertJobChangeEvent records the change in the job change outbox in the update's transaction,
// as the web app's updateJobs does, so outbound webhooks and Job changed workflows hear about it.
func insertJobChangeEvent(ctx context.Context, tx pgx.Tx, changeType, organizationID, jobID, projectID, kind, status string, assigneeType *string) error {
	if _, err := tx.Exec(ctx, `INSERT INTO job_change_events
			(organization_id, job_id, project_id, kind, type, from_status, to_status, assignee_type)
		VALUES ($1, $2, $3, $4::job_kind, $7, $5::job_status, $5::job_status, $6::job_assignee_type)`,
		organizationID, jobID, projectID, kind, status, assigneeType, changeType); err != nil {
		return fmt.Errorf("record job change event: %w", err)
	}
	return nil
}

// assignableJobOwner follows findPublicJobOwner and assertAssignableIssueAssignee in the web
// app: the owner is a workspace member by email whose membership is active and who is an
// operator or on the project's team.
func assignableJobOwner(ctx context.Context, tx pgx.Tx, actor principal, projectID, email string) (string, error) {
	var ownerID, role string
	var membershipID *string
	err := tx.QueryRow(ctx, `SELECT u.id, om.role, om.workos_membership_id
		FROM users u
		JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = $1
		WHERE lower(u.email) = lower($2)
		LIMIT 1`, actor.OrganizationID, email).Scan(&ownerID, &role, &membershipID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errJobOwnerNotFound
	}
	if err != nil {
		return "", fmt.Errorf("find job owner: %w", err)
	}
	active := membershipID != nil && *membershipID != "" && *membershipID != "replacing" && !strings.HasPrefix(*membershipID, "replacing:")
	if !active {
		return "", errJobOwnerUnassigable
	}
	if role == "admin" || role == "localization_manager" {
		return ownerID, nil
	}
	var onTeam bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (
			SELECT 1 FROM projects p
			JOIN teams t ON t.organization_id = p.organization_id AND (t.id = p.team_id OR (p.team_id IS NULL AND t.slug = 'default'))
			JOIN team_memberships tm ON tm.team_id = t.id AND tm.user_id = $3
			WHERE p.id = $2 AND p.organization_id = $1
		)`, actor.OrganizationID, projectID, ownerID).Scan(&onTeam); err != nil {
		return "", fmt.Errorf("check job owner team: %w", err)
	}
	if !onTeam {
		return "", errJobOwnerUnassigable
	}
	return ownerID, nil
}

// changedFields names the fields a job update set. The owner is reported as "owner", so the
// event carries no email address.
func (patch jobPatch) changedFields() []string {
	fields := []string{}
	if patch.Title != nil {
		fields = append(fields, "title")
	}
	if patch.Description.Set {
		fields = append(fields, "description")
	}
	if patch.DueAt.Set {
		fields = append(fields, "dueAt")
	}
	if patch.OwnerEmail.Set {
		fields = append(fields, "owner")
	}
	return fields
}
