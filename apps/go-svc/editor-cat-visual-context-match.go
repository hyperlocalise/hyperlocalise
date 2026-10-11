package main

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	visualContextMatchMaxStringIDs   = 500
	visualContextMatchMaxOverrideDay = 3650
	visualContextMatchActiveIndex    = "project_visual_context_match_processes_active_screenshot"
)

// visualContextMatchParams mirrors Smartling's MatchParams: scope matching to a
// source file (contentFileUri) or explicit strings (stringHashcodes), but not both.
// With neither, every visible string in the project is a candidate.
type visualContextMatchParams struct {
	SourcePath                   *string  `json:"sourcePath"`
	ExternalStringIDs            []string `json:"externalStringIds"`
	OverrideContextOlderThanDays *int     `json:"overrideContextOlderThanDays"`
}

type resolvedVisualContextMatch struct {
	sourceFileID *string
	keyIDs       []string
	overrideDays *int
}

type editorCatVisualContextMatchProcess struct {
	ID                  string                          `json:"id"`
	ScreenshotID        string                          `json:"screenshotId"`
	Status              string                          `json:"status"`
	CheckedStringsCount *int                            `json:"checkedStringsCount"`
	BoundStringsCount   *int                            `json:"boundStringsCount"`
	Error               *string                         `json:"error"`
	CreatedAt           time.Time                       `json:"createdAt"`
	UpdatedAt           time.Time                       `json:"updatedAt"`
	CompletedAt         *time.Time                      `json:"completedAt"`
	Bindings            []editorCatVisualContextBinding `json:"bindings"`
}

func visualContextMatchingUnavailable() error {
	return editorCatFailure(503, "visual_context_matching_unavailable", "Automatic visual context matching is not configured")
}

func (api *editorCatAPI) matchVisualContextScreenshot(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if api.matchPublisher == nil {
		return nil, 0, visualContextMatchingUnavailable()
	}
	screenshotID, err := parseEditorCatUUID(r.PathValue("screenshotId"))
	if err != nil {
		return nil, 0, err
	}
	var body visualContextMatchParams
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	var status string
	err = api.pool.QueryRow(r.Context(), `
        select status from project_visual_context_screenshots
        where id=$1 and organization_id=$2 and project_id=$3`,
		screenshotID, actor.organizationID, project.ID,
	).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, editorCatFailure(404, "visual_context_screenshot_not_found", "Visual context screenshot not found")
	}
	if err != nil {
		return nil, 0, err
	}
	if status != "ready" {
		return nil, 0, editorCatFailure(409, "visual_context_screenshot_not_ready", "Finalize the screenshot upload before matching")
	}
	resolved, err := api.resolveVisualContextMatch(r, actor, project, body)
	if err != nil {
		return nil, 0, err
	}
	process, err := insertVisualContextMatchProcess(r, api.pool, actor, project, screenshotID, resolved)
	if err != nil {
		return nil, 0, err
	}
	api.enqueueVisualContextMatch(r, actor, project, process)
	return map[string]any{"process": process}, http.StatusAccepted, nil
}

func (api *editorCatAPI) loadVisualContextMatchProcess(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	processID, err := parseEditorCatUUID(r.PathValue("processId"))
	if err != nil {
		return nil, 0, err
	}
	process := editorCatVisualContextMatchProcess{ID: processID, Bindings: []editorCatVisualContextBinding{}}
	err = api.pool.QueryRow(r.Context(), `
        select screenshot_id, status, checked_strings_count, bound_strings_count,
               error_code, created_at, updated_at, completed_at
        from project_visual_context_match_processes
        where id=$1 and organization_id=$2 and project_id=$3`,
		processID, actor.organizationID, project.ID,
	).Scan(&process.ScreenshotID, &process.Status, &process.CheckedStringsCount, &process.BoundStringsCount,
		&process.Error, &process.CreatedAt, &process.UpdatedAt, &process.CompletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, editorCatFailure(404, "visual_context_match_process_not_found", "Visual context match process not found")
	}
	if err != nil {
		return nil, 0, err
	}
	rows, err := api.pool.Query(r.Context(), `
        select id, translation_key_id, marker_left, marker_top, marker_width, marker_height
        from project_visual_context_bindings
        where match_process_id=$1 and organization_id=$2 and project_id=$3
        order by created_at, id`,
		processID, actor.organizationID, project.ID,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	for rows.Next() {
		binding := editorCatVisualContextBinding{ScreenshotID: process.ScreenshotID, Source: "auto"}
		var left, top, width, height *float64
		if err := rows.Scan(&binding.ID, &binding.ExternalStringID, &left, &top, &width, &height); err != nil {
			return nil, 0, err
		}
		binding.Marker = visualContextMarkerFromColumns(left, top, width, height)
		process.Bindings = append(process.Bindings, binding)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"process": process}, http.StatusOK, nil
}

func (api *editorCatAPI) resolveVisualContextMatch(r *http.Request, actor editorCatActor, project editorCatProject, params visualContextMatchParams) (resolvedVisualContextMatch, error) {
	var resolved resolvedVisualContextMatch
	if params.OverrideContextOlderThanDays != nil {
		days := *params.OverrideContextOlderThanDays
		if days < 1 || days > visualContextMatchMaxOverrideDay {
			return resolved, editorCatFailure(400, "invalid_project_payload", "overrideContextOlderThanDays must be between 1 and 3650")
		}
		resolved.overrideDays = &days
	}
	sourcePath := optionalTrimmedVisualContext(params.SourcePath)
	scopedToFile := sourcePath != "" && !isEditorCatAllFiles(sourcePath)
	if scopedToFile && len(params.ExternalStringIDs) > 0 {
		return resolved, editorCatFailure(400, "invalid_project_payload", "Match by sourcePath or externalStringIds, not both")
	}
	if len(sourcePath) > 2048 {
		return resolved, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if scopedToFile {
		fileID, err := api.sourceFileID(r, actor, project, sourcePath)
		if err != nil {
			return resolved, err
		}
		resolved.sourceFileID = &fileID
		return resolved, nil
	}
	if len(params.ExternalStringIDs) == 0 {
		return resolved, nil
	}
	if len(params.ExternalStringIDs) > visualContextMatchMaxStringIDs {
		return resolved, editorCatFailure(400, "invalid_project_payload", "Match at most 500 externalStringIds at a time")
	}
	seen := make(map[string]struct{}, len(params.ExternalStringIDs))
	keyIDs := make([]string, 0, len(params.ExternalStringIDs))
	for _, raw := range params.ExternalStringIDs {
		keyID, err := parseEditorCatUUID(raw)
		if err != nil {
			return resolved, editorCatFailure(404, "cat_segment_not_found", "CAT segment not found")
		}
		if _, dup := seen[keyID]; dup {
			continue
		}
		seen[keyID] = struct{}{}
		keyIDs = append(keyIDs, keyID)
	}
	var found int
	err := api.pool.QueryRow(r.Context(), `
        select count(*) from project_translation_keys
        where organization_id=$1 and project_id=$2 and id = any($3::uuid[])`,
		actor.organizationID, project.ID, keyIDs,
	).Scan(&found)
	if err != nil {
		return resolved, err
	}
	if found != len(keyIDs) {
		return resolved, editorCatFailure(404, "cat_segment_not_found", "CAT segment not found")
	}
	resolved.keyIDs = keyIDs
	return resolved, nil
}

func insertVisualContextMatchProcess(r *http.Request, db dictionaryDB, actor editorCatActor, project editorCatProject, screenshotID string, match resolvedVisualContextMatch) (*editorCatVisualContextMatchProcess, error) {
	process := &editorCatVisualContextMatchProcess{
		ScreenshotID: screenshotID,
		Status:       "queued",
		Bindings:     []editorCatVisualContextBinding{},
	}
	var keyIDs any
	if match.keyIDs != nil {
		keyIDs = match.keyIDs
	}
	err := db.QueryRow(r.Context(), `
        insert into project_visual_context_match_processes (
            organization_id, project_id, screenshot_id, status,
            repository_source_file_id, translation_key_ids, override_context_older_than_days,
            created_by_user_id
        ) values ($1,$2,$3,'queued',$4,$5::uuid[],$6,$7)
        returning id, created_at, updated_at`,
		actor.organizationID, project.ID, screenshotID,
		match.sourceFileID, keyIDs, match.overrideDays, actor.userID,
	).Scan(&process.ID, &process.CreatedAt, &process.UpdatedAt)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == visualContextMatchActiveIndex {
		return nil, editorCatFailure(409, "visual_context_match_in_progress", "This screenshot already has a match in progress")
	}
	if err != nil {
		return nil, err
	}
	return process, nil
}

// enqueueVisualContextMatch marks the process failed when the message cannot be
// sent, so callers can retry with the match endpoint instead of waiting forever.
func (api *editorCatAPI) enqueueVisualContextMatch(r *http.Request, actor editorCatActor, project editorCatProject, process *editorCatVisualContextMatchProcess) {
	err := api.matchPublisher.Publish(r.Context(), visualContextMatchMessage{SchemaVersion: 1, ProcessID: process.ID})
	if err == nil {
		return
	}
	slog.ErrorContext(r.Context(), "visual_context_match_enqueue_failed", "process_id", process.ID, "error", err)
	code := "enqueue_failed"
	_, updateErr := api.pool.Exec(r.Context(), `
        update project_visual_context_match_processes
        set status='failed', error_code=$4, completed_at=now(), updated_at=now()
        where id=$1 and organization_id=$2 and project_id=$3 and status='queued'`,
		process.ID, actor.organizationID, project.ID, code,
	)
	if updateErr != nil {
		slog.ErrorContext(r.Context(), "visual_context_match_enqueue_failure_record_failed", "process_id", process.ID, "error", updateErr)
		return
	}
	process.Status = "failed"
	process.Error = &code
}
