package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/publicauth"
	"github.com/jackc/pgx/v5"
)

const (
	maxOpenJobsPerOrganization = 50
	maxJobsCreatedPerHour      = 120
)

// openingJobStatuses is the web app's OPENING_JOB_STATUSES: the statuses of an earlier job that
// let a task that comes after it start.
var openingJobStatuses = []string{"succeeded", "cancelled"}

// createJob ports the platform's POST /api/v1/jobs. It records the job, its details, a key job's
// strings, the job change event, and the activity event, in one transaction. It does not start
// string or file jobs, reserve their usage, or start a task's Reports analysis. A file job with a
// step is a task for a person, as a key job is; one that comes after an unfinished job waits as
// queued, by the web app's rules in waiting-task.ts.
func (s *postgresStore) createJob(ctx context.Context, actor principal, input jobCreate, idempotency *jobIdempotency) (createdJobResult, bool, error) {
	scope, err := loadProjectScope(ctx, s.pool, actor, input.ProjectID)
	if err != nil {
		return createdJobResult{}, false, err
	}
	if input.Type == "keys" && scope.Source != "native" {
		return createdJobResult{}, false, errProjectNotNative
	}
	// A matching body names the same project, so the access check above covers a replay too.
	if idempotency != nil {
		if earlier, found, err := findIdempotentJob(ctx, s.pool, actor.OrganizationID, *idempotency); err != nil || found {
			return earlier, found, err
		}
	}

	payload, sourceLocale, targetLocales := jobInputPayload(input, scope)
	if err := validateJobLocales(scope, sourceLocale, targetLocales); err != nil {
		return createdJobResult{}, false, err
	}
	var ownerID *string
	if input.OwnerEmail != "" {
		var id string
		var vendor bool
		err := s.pool.QueryRow(ctx, `SELECT u.id, `+publicauth.VendorTeamMemberSQLFor("u.id", "om.organization_id")+` FROM users u
			JOIN organization_memberships om ON om.user_id = u.id
			WHERE lower(u.email) = lower($2) AND om.organization_id = $1
			LIMIT 1`, actor.OrganizationID, input.OwnerEmail).Scan(&id, &vendor)
		if errors.Is(err, pgx.ErrNoRows) {
			return createdJobResult{}, false, errJobOwnerNotFound
		}
		if err != nil {
			return createdJobResult{}, false, fmt.Errorf("find job owner: %w", err)
		}
		// Only a post-edit or proofread task on a file can be given to a vendor (jobs-store.go).
		if vendor && (input.File == nil || input.File.Step == nil) {
			return createdJobResult{}, false, errJobOwnerVendor
		}
		ownerID = &id
	}
	var sourceFile *jobSourceStoredFile
	if input.File != nil {
		file, err := loadJobSourceFile(ctx, s.pool, actor, scope.ID, input.File.SourceFileID)
		if err != nil {
			return createdJobResult{}, false, err
		}
		format, ok := fileJobFormatOf(file.Filename)
		if !ok {
			return createdJobResult{}, false, errJobSourceFileUnsupported
		}
		if format != input.File.FileFormat {
			return createdJobResult{}, false, jobFormatMismatchError{Expected: format}
		}
		sourceFile = &file
		if input.File.Step != nil && input.Title == "" {
			// As an Assign task step names its tasks, so two steps on one file can be told apart.
			payload["metadata"].(map[string]string)["title"] = taskStepStored[*input.File.Step].TitlePrefix + ": " + file.Filename
		}
	}
	encodedPayload, err := json.Marshal(payload)
	if err != nil {
		return createdJobResult{}, false, fmt.Errorf("encode job input: %w", err)
	}

	isKeyJob := input.Type == "keys"
	result := createdJobResult{ID: "job_" + uuid.NewString(), Type: input.Type, Status: "queued"}
	kind := "translation"
	if isKeyJob || (input.File != nil && input.File.Step != nil) {
		result.Status, kind = "waiting_for_review", "proofread"
	}
	var afterJobID *string
	if input.File != nil {
		afterJobID = input.File.After
	}
	errIdempotencyTaken := errors.New("idempotency key taken")
	err = s.inTx(ctx, func(tx pgx.Tx) error {
		if err := checkJobBudget(ctx, tx, actor.OrganizationID, isKeyJob); err != nil {
			return err
		}
		var versionID *string
		if sourceFile != nil {
			if versionID, err = ensureSourceFileVersion(ctx, tx, actor.OrganizationID, scope.ID, *sourceFile, input.File.Branch); err != nil {
				return err
			}
		}
		if afterJobID != nil {
			// If the earlier job finishes just after this read, the task starts waiting and the web
			// app's next openWaitingTasks run opens it.
			var afterStatus string
			err := tx.QueryRow(ctx, `SELECT status::text FROM jobs
				WHERE id = $1 AND organization_id = $2 AND project_id = $3`,
				*afterJobID, actor.OrganizationID, scope.ID).Scan(&afterStatus)
			if errors.Is(err, pgx.ErrNoRows) {
				return errAfterJobNotFound
			}
			if err != nil {
				return fmt.Errorf("read job to come after: %w", err)
			}
			if !member(afterStatus, openingJobStatuses...) {
				result.Status = "queued"
			}
		}
		var assigneeType *string
		if ownerID != nil {
			user := "user"
			assigneeType = &user
		}
		if _, err := tx.Exec(ctx, `INSERT INTO jobs
				(id, organization_id, project_id, kind, status, input_payload, api_key_id, owner_user_id, assignee_type, due_at, after_job_id)
			VALUES ($1, $2, $3, $4::job_kind, $5::job_status, $6::jsonb,
				(SELECT k.id FROM organization_api_keys k WHERE k.id::text = $7 AND k.organization_id = $2),
				$8, $9::job_assignee_type, $10, $11)`,
			result.ID, actor.OrganizationID, scope.ID, kind, result.Status, string(encodedPayload),
			actor.TokenID, ownerID, assigneeType, input.DueAt, afterJobID); err != nil {
			return fmt.Errorf("insert job: %w", err)
		}
		// The job change outbox, as the web app's insertJobs records it.
		if _, err := tx.Exec(ctx, `INSERT INTO job_change_events
				(organization_id, job_id, project_id, kind, type, from_status, to_status, assignee_type)
			VALUES ($1, $2, $3, $4::job_kind, 'job.created', NULL, $5::job_status, $6::job_assignee_type)`,
			actor.OrganizationID, result.ID, scope.ID, kind, result.Status, assigneeType); err != nil {
			return fmt.Errorf("record job change event: %w", err)
		}
		if idempotency != nil {
			// A concurrent request with the same key waits here until the first commits, then
			// finds the key taken and rolls back its own job.
			tag, err := tx.Exec(ctx, `INSERT INTO public_job_idempotency_keys (organization_id, key, request_hash, job_id)
				VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
				actor.OrganizationID, idempotency.Key, idempotency.RequestHash, result.ID)
			if err != nil {
				return fmt.Errorf("claim idempotency key: %w", err)
			}
			if tag.RowsAffected() == 0 {
				return errIdempotencyTaken
			}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO translation_job_details (job_id, type, source_file_version_id)
			VALUES ($1, $2, $3)`, result.ID, input.Type, versionID); err != nil {
			return fmt.Errorf("insert job details: %w", err)
		}
		if isKeyJob {
			if err := insertKeyJobStrings(ctx, tx, actor.OrganizationID, scope.ID, result.ID, *input.Keys); err != nil {
				return err
			}
		}
		return insertActivity(ctx, tx, actor, activityEvent{
			EventType:  "job_created",
			TargetID:   result.ID,
			TargetKind: "job",
			Payload:    map[string]any{"jobId": result.ID, "kind": kind, "projectId": scope.ID, "status": result.Status},
		})
	})
	if errors.Is(err, errIdempotencyTaken) {
		earlier, found, lookupErr := findIdempotentJob(ctx, s.pool, actor.OrganizationID, *idempotency)
		if lookupErr != nil {
			return createdJobResult{}, false, lookupErr
		}
		if found {
			return earlier, true, nil
		}
		return createdJobResult{}, false, errIdempotencyKeyReused
	}
	if err != nil {
		return createdJobResult{}, false, err
	}
	return result, false, nil
}

// findIdempotentJob returns the job an earlier request with this key created. A key that came
// with a different body is errIdempotencyKeyReused.
func findIdempotentJob(ctx context.Context, db queryRower, organizationID string, idempotency jobIdempotency) (createdJobResult, bool, error) {
	var hash string
	var job createdJobResult
	err := db.QueryRow(ctx, `SELECT k.request_hash, j.id, d.type, j.status::text
		FROM public_job_idempotency_keys k
		JOIN jobs j ON j.id = k.job_id
		JOIN translation_job_details d ON d.job_id = j.id
		WHERE k.organization_id = $1 AND k.key = $2`, organizationID, idempotency.Key).Scan(&hash, &job.ID, &job.Type, &job.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return createdJobResult{}, false, nil
	}
	if err != nil {
		return createdJobResult{}, false, fmt.Errorf("find idempotent job: %w", err)
	}
	if hash != idempotency.RequestHash {
		return createdJobResult{}, false, errIdempotencyKeyReused
	}
	return job, true, nil
}

// projectLocaleSpelling is the project's own spelling of a locale it accepts without regard to
// case, so a key job's languages match its translations exactly.
func projectLocaleSpelling(projectLocales []string, locale string) string {
	canonical := hashedLocale(locale)
	for _, entry := range projectLocales {
		if strings.EqualFold(entry, canonical) {
			return entry
		}
	}
	return canonical
}

// jobInputPayload builds the stored input as the platform does, with title and description in
// metadata where the app's job editor keeps them, and returns its languages.
func jobInputPayload(input jobCreate, scope projectScope) (map[string]any, string, []string) {
	payload := map[string]any{}
	var metadata map[string]string
	var sourceLocale string
	var targetLocales []string
	switch input.Type {
	case "string":
		in := input.String
		payload["sourceText"] = in.SourceText
		if in.Context != nil {
			payload["context"] = *in.Context
		}
		if in.MaxLength != nil {
			payload["maxLength"] = *in.MaxLength
		}
		sourceLocale, targetLocales, metadata = in.SourceLocale, in.TargetLocales, in.Metadata
	case "file":
		in := input.File
		payload["sourceFileId"] = in.SourceFileID
		payload["fileFormat"] = in.FileFormat
		if in.Branch != nil {
			payload["branch"] = *in.Branch
		}
		sourceLocale, targetLocales, metadata = in.SourceLocale, in.TargetLocales, in.Metadata
		if in.Step != nil {
			metadata = make(map[string]string, len(in.Metadata)+2)
			for key, value := range in.Metadata {
				metadata[key] = value
			}
			metadata["workflowTaskStep"] = taskStepStored[*in.Step].Step
		}
	default:
		in := input.Keys
		var projectSource []string
		if scope.SourceLocale != nil {
			projectSource = []string{*scope.SourceLocale}
		}
		sourceLocale = projectLocaleSpelling(projectSource, in.SourceLocale)
		targetLocales = make([]string, len(in.TargetLocales))
		for i, locale := range in.TargetLocales {
			targetLocales[i] = projectLocaleSpelling(scope.TargetLocales, locale)
		}
		if in.Metadata != nil {
			// A key job is a proofread task, so it never carries another step's name.
			metadata = make(map[string]string, len(in.Metadata))
			for key, value := range in.Metadata {
				if key != "workflowTaskStep" {
					metadata[key] = value
				}
			}
		}
	}
	payload["sourceLocale"] = sourceLocale
	payload["targetLocales"] = targetLocales
	if input.Title != "" || input.Description != "" {
		merged := make(map[string]string, len(metadata)+2)
		for key, value := range metadata {
			merged[key] = value
		}
		if input.Title != "" {
			merged["title"] = input.Title
		}
		if input.Description != "" {
			merged["description"] = input.Description
		}
		metadata = merged
	}
	if metadata != nil {
		payload["metadata"] = metadata
	}
	return payload, sourceLocale, targetLocales
}

// validateJobLocales ports validateJobLocalesAgainstProject: external TMS projects take the
// provider's exact locale IDs; native projects take canonical tags the project enables.
func validateJobLocales(scope projectScope, sourceLocale string, targetLocales []string) error {
	duplicate := jobLocaleError{"duplicate_job_target_locales", "Target locales must be unique"}
	if scope.Source == "external_tms" {
		if scope.SourceLocale != nil && sourceLocale != *scope.SourceLocale {
			return jobLocaleError{"job_source_locale_not_in_project", "Source locale must match the synced TMS project source locale"}
		}
		if len(scope.TargetLocales) > 0 {
			var invalid []string
			for _, locale := range targetLocales {
				if !contains(scope.TargetLocales, locale) {
					invalid = append(invalid, locale)
				}
			}
			if len(invalid) > 0 {
				return jobLocaleError{"job_target_locale_not_in_project", "Target locales must be configured on the project: " + strings.Join(invalid, ", ")}
			}
		}
		if len(sortedUnique(targetLocales)) != len(targetLocales) {
			return duplicate
		}
		return nil
	}
	source, ok := canonicalLocale(sourceLocale)
	if !ok {
		return jobLocaleError{"invalid_job_source_locale", "Invalid source locale"}
	}
	if scope.SourceLocale != nil && !strings.EqualFold(strings.TrimSpace(*scope.SourceLocale), source) {
		return jobLocaleError{"job_source_locale_not_in_project", "Source locale must match the project source locale"}
	}
	seen := map[string]struct{}{}
	for _, raw := range targetLocales {
		target, ok := canonicalLocale(raw)
		if !ok {
			return jobLocaleError{"invalid_job_target_locale", "Invalid target locale: " + raw}
		}
		if len(scope.TargetLocales) > 0 {
			enabled := false
			for _, entry := range scope.TargetLocales {
				if strings.EqualFold(strings.TrimSpace(entry), target) {
					enabled = true
					break
				}
			}
			if !enabled {
				return jobLocaleError{"job_target_locale_not_in_project", "Target locale is not enabled on this project: " + target}
			}
		}
		if strings.EqualFold(target, source) {
			return jobLocaleError{"job_source_in_targets", "Source locale cannot appear in target locales"}
		}
		key := strings.ToLower(target)
		if _, dup := seen[key]; dup {
			return duplicate
		}
		seen[key] = struct{}{}
	}
	return nil
}

// jobSourceStoredFile is the stored file a file job translates.
type jobSourceStoredFile struct {
	ID          string
	ProjectID   *string
	CreatedBy   *string
	Filename    string
	SourceKind  string
	SHA256      string
	SourcePath  *string
	SourceHash  *string
	CommitSHA   *string
	WorkflowRun *string
	Surface     *string
}

// loadJobSourceFile follows getStoredFileForJobScope and canAccessStoredFileWithProjectScope: a
// file of the project, or one in no project that the token's owner may read.
func loadJobSourceFile(ctx context.Context, db queryRower, actor principal, projectID, fileID string) (jobSourceStoredFile, error) {
	var file jobSourceStoredFile
	text := func(key string) string {
		return `NULLIF(CASE WHEN jsonb_typeof(f.metadata->'` + key + `') = 'string' THEN trim(f.metadata->>'` + key + `') END, '')`
	}
	err := db.QueryRow(ctx, `SELECT f.id, f.project_id, f.created_by_user_id::text, f.filename, f.source_kind, f.sha256,
			`+text("sourcePath")+`, `+text("sourceHash")+`, `+text("commitSha")+`, `+text("workflowRunId")+`, `+text("uploadSurface")+`
		FROM stored_files f
		WHERE f.id = $1 AND f.organization_id = $2 AND (f.project_id = $3 OR f.project_id IS NULL)
		LIMIT 1`, fileID, actor.OrganizationID, projectID).Scan(&file.ID, &file.ProjectID, &file.CreatedBy, &file.Filename,
		&file.SourceKind, &file.SHA256, &file.SourcePath, &file.SourceHash, &file.CommitSHA, &file.WorkflowRun, &file.Surface)
	if errors.Is(err, pgx.ErrNoRows) {
		return jobSourceStoredFile{}, errJobSourceFileNotFound
	}
	if err != nil {
		return jobSourceStoredFile{}, fmt.Errorf("load job source file: %w", err)
	}
	orgWide := actor.Role == "admin" || actor.Role == "localization_manager"
	if file.ProjectID == nil && !orgWide && file.CreatedBy != nil && *file.CreatedBy != actor.UserID {
		return jobSourceStoredFile{}, errJobSourceFileNotFound
	}
	return file, nil
}

// ensureSourceFileVersion ports ensureRepositorySourceFileVersionForStoredFile: the file's
// version (on the branch, when one is named; the default branch first otherwise), or a new
// version for an uploaded repository file that has none.
func ensureSourceFileVersion(ctx context.Context, tx pgx.Tx, organizationID, projectID string, file jobSourceStoredFile, branch *string) (*string, error) {
	where := newSQLFilter("v.stored_file_id = $1 AND v.organization_id = $2 AND v.project_id = $3", file.ID, organizationID, projectID)
	if branch != nil {
		name := normalizeBranchName(*branch)
		if name == "" {
			name = "main"
		}
		where.add("sf.branch_name = ?", name)
	}
	var id string
	err := tx.QueryRow(ctx, `SELECT v.id::text FROM repository_source_file_versions v
		JOIN repository_source_files sf ON sf.id = v.repository_source_file_id
		WHERE `+where.sql()+`
		ORDER BY CASE WHEN sf.branch_name = 'main' THEN 0 ELSE 1 END, v.created_at DESC, v.id DESC
		LIMIT 1`, where.args...).Scan(&id)
	if err == nil {
		return &id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("find source file version: %w", err)
	}
	if file.SourceKind != "repository_file" || file.ProjectID == nil || file.SourcePath == nil {
		return nil, nil
	}
	branchName := "main"
	if branch != nil && strings.TrimSpace(*branch) != "" {
		branchName = strings.TrimSpace(*branch)
	}
	sourcePath := normalizeJobSourcePath(*file.SourcePath)
	var sourceFileID string
	if err := tx.QueryRow(ctx, `INSERT INTO repository_source_files (organization_id, project_id, source_path, branch_name)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (project_id, branch_name, source_path) DO UPDATE SET updated_at = now()
		RETURNING id`, organizationID, *file.ProjectID, sourcePath, branchName).Scan(&sourceFileID); err != nil {
		return nil, fmt.Errorf("upsert repository source file: %w", err)
	}
	sourceHash := file.SHA256
	if file.SourceHash != nil {
		sourceHash = *file.SourceHash
	}
	if err := tx.QueryRow(ctx, `INSERT INTO repository_source_file_versions
			(repository_source_file_id, organization_id, project_id, source_path, stored_file_id, source_hash,
			commit_sha, workflow_run_id, uploaded_by_user_id, upload_surface)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id::text`, sourceFileID, organizationID, *file.ProjectID, sourcePath, file.ID, sourceHash,
		file.CommitSHA, file.WorkflowRun, file.CreatedBy, file.Surface).Scan(&id); err != nil {
		return nil, fmt.Errorf("insert source file version: %w", err)
	}
	return &id, nil
}

// checkJobBudget ports assertOrganizationCanEnqueueTranslationJobInTransaction: at most 50 open
// jobs (key jobs for people aside) and 120 new jobs an hour per workspace.
func checkJobBudget(ctx context.Context, tx pgx.Tx, organizationID string, isKeyJob bool) error {
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
		"organization_job_budget:"+organizationID); err != nil {
		return fmt.Errorf("lock job budget: %w", err)
	}
	var open, recent int
	if err := tx.QueryRow(ctx, `SELECT
			(SELECT count(*) FROM jobs j
				WHERE j.organization_id = $1 AND j.status IN ('queued', 'running', 'waiting_for_review')
					AND NOT EXISTS (SELECT 1 FROM translation_job_details d
						WHERE d.job_id = j.id AND d.type = 'keys' AND j.kind = 'proofread')),
			(SELECT count(*) FROM jobs WHERE organization_id = $1 AND created_at >= now() - interval '1 hour')`,
		organizationID).Scan(&open, &recent); err != nil {
		return fmt.Errorf("count job budget: %w", err)
	}
	if !isKeyJob && open >= maxOpenJobsPerOrganization {
		return jobBudgetError{fmt.Sprintf("Organization has %d open jobs. Wait for jobs to finish before creating more.", open)}
	}
	if recent >= maxJobsCreatedPerHour {
		return jobBudgetError{"Organization job creation rate limit exceeded. Try again later."}
	}
	return nil
}

// insertKeyJobStrings ports insertKeyJobKeys: the selected visible strings of the project's
// files, at most 5,000.
func insertKeyJobStrings(ctx context.Context, tx pgx.Tx, organizationID, projectID, jobID string, input keysJobInput) error {
	where := newSQLFilter(`organization_id = $1 AND project_id = $2 AND NOT is_hidden AND repository_source_file_id IS NOT NULL`,
		organizationID, projectID)
	switch {
	case input.StringIDs != nil:
		where.add("id::text = ANY(?::text[])", input.StringIDs)
	case input.Keys != nil:
		where.add("key = ANY(?::text[])", input.Keys)
	default:
		where.add("tags @> ?::text[]", input.Tags)
	}
	where.args = append(where.args, maxJobStrings+1)
	rows, err := tx.Query(ctx, fmt.Sprintf(`SELECT id::text FROM project_translation_keys WHERE %s LIMIT $%d`,
		where.sql(), len(where.args)), where.args...)
	if err != nil {
		return fmt.Errorf("select key job strings: %w", err)
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return fmt.Errorf("select key job strings: %w", err)
	}
	if len(ids) == 0 {
		return errKeyJobNoStrings
	}
	if len(ids) > maxJobStrings {
		return errKeyJobTooManyStrings
	}
	if _, err := tx.Exec(ctx, `INSERT INTO translation_job_keys (job_id, translation_key_id)
		SELECT $1, unnest($2::uuid[])`, jobID, ids); err != nil {
		return fmt.Errorf("insert key job strings: %w", err)
	}
	return nil
}
