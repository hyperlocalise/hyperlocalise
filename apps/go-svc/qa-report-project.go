package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type nativeQaProject struct {
	ID              string
	QaScanCadence   string
	QaScanLastRunAt *time.Time
	QaCheckPolicy   []byte
}

type qaRunRow struct {
	ID           uuid.UUID
	ProjectID    string
	Trigger      string
	Status       string
	SegmentCount int
	FindingCount int
	ErrorCount   int
	WarningCount int
	SummaryRaw   []byte
	ErrorCode    *string
	ErrorMessage *string
	StartedAt    *time.Time
	CompletedAt  *time.Time
	CreatedAt    time.Time
}

func missingQaProject() error {
	return qaReportFailure(404, "project_not_found", "Project not found")
}

// qaProjectTeamAccessSQL is the same team gate as ownedNativeProject: org-wide
// for teams:write roles, otherwise membership on the project team (or default).
const qaProjectTeamAccessSQL = `($%d or exists(
            select 1 from team_memberships m
            join teams t on t.id = m.team_id
            where m.user_id = $%d and t.organization_id = $%d
            and (t.id = p.team_id or (p.team_id is null and t.slug = 'default'))
        ))`

func formatQaProjectTeamAccessSQL(orgWideParam, userParam, orgParam int) string {
	return fmt.Sprintf(qaProjectTeamAccessSQL, orgWideParam, userParam, orgParam)
}

func (api *qaReportAPI) ownedNativeProject(ctx context.Context, actor qaReportActor, rawProjectID string) (nativeQaProject, error) {
	projectID := normalizeDictionaryProjectID(rawProjectID)
	if projectID == "" {
		return nativeQaProject{}, missingQaProject()
	}
	var project nativeQaProject
	var source string
	err := api.pool.QueryRow(ctx, `
        select p.id, p.source, p.qa_scan_cadence, p.qa_scan_last_run_at, p.qa_check_policy
        from projects p
        where p.id = $1 and p.organization_id = $2
        and `+formatQaProjectTeamAccessSQL(3, 4, 2),
		projectID, actor.organizationID, actor.canWriteProjectTeam(), actor.userID,
	).Scan(&project.ID, &source, &project.QaScanCadence, &project.QaScanLastRunAt, &project.QaCheckPolicy)
	if errors.Is(err, pgx.ErrNoRows) {
		return nativeQaProject{}, missingQaProject()
	}
	if err != nil {
		return nativeQaProject{}, err
	}
	if source != "native" {
		return nativeQaProject{}, qaReportFailure(400, "qa_scan_not_supported", "QA reports are available for native projects")
	}
	return project, nil
}

func qaReportSettingsPayload(actor qaReportActor, cadence string, lastRunAt *time.Time, policy []byte) map[string]any {
	checks := map[string]qaCheckSetting{}
	_ = json.Unmarshal(policy, &checks)
	return map[string]any{
		"cadence":           cadence,
		"checks":            checks,
		"lastRunAt":         formatQaReportTime(lastRunAt),
		"canRun":            actor.canJobCreate(),
		"canManageSchedule": actor.canProjectWrite(),
	}
}

func serializeQaRunRow(row qaRunRow) map[string]any {
	summary := emptyQaSummary()
	if len(row.SummaryRaw) > 0 {
		_ = json.Unmarshal(row.SummaryRaw, &summary)
	}
	return map[string]any{
		"id":           row.ID.String(),
		"projectId":    row.ProjectID,
		"trigger":      row.Trigger,
		"status":       row.Status,
		"segmentCount": row.SegmentCount,
		"findingCount": row.FindingCount,
		"errorCount":   row.ErrorCount,
		"warningCount": row.WarningCount,
		"summary":      summary,
		"errorCode":    row.ErrorCode,
		// Raw exceptions stay in the run row for internal diagnosis by run ID.
		"errorMessage": nil,
		"startedAt":    formatQaReportTime(row.StartedAt),
		"completedAt":  formatQaReportTime(row.CompletedAt),
		"createdAt":    row.CreatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
	}
}

func (api *qaReportAPI) listProjectQaReports(ctx context.Context, actor qaReportActor, project nativeQaProject) (any, int, error) {
	rows, err := api.pool.Query(ctx, `
        select id, project_id, trigger, status, segment_count, finding_count, error_count, warning_count,
               summary, error_code, error_message, started_at, completed_at, created_at
        from translation_qa_runs
        where organization_id = $1 and project_id = $2
        order by created_at desc
        limit 20`, actor.organizationID, project.ID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	reports := []map[string]any{}
	for rows.Next() {
		var row qaRunRow
		if err := rows.Scan(
			&row.ID, &row.ProjectID, &row.Trigger, &row.Status, &row.SegmentCount, &row.FindingCount,
			&row.ErrorCount, &row.WarningCount, &row.SummaryRaw, &row.ErrorCode, &row.ErrorMessage,
			&row.StartedAt, &row.CompletedAt, &row.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		reports = append(reports, serializeQaRunRow(row))
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"reports":  reports,
		"settings": qaReportSettingsPayload(actor, project.QaScanCadence, project.QaScanLastRunAt, project.QaCheckPolicy),
	}, 200, nil
}

func (api *qaReportAPI) lastSuccessfulProjectQaRun(ctx context.Context, organizationID, projectID string, beforeRunID uuid.UUID) (any, error) {
	var row qaRunRow
	err := api.pool.QueryRow(ctx, `
        select id, project_id, trigger, status, segment_count, finding_count, error_count, warning_count,
               summary, error_code, error_message, started_at, completed_at, created_at
        from translation_qa_runs
        where organization_id = $1 and project_id = $2 and status = 'succeeded'
          and created_at <= (select created_at from translation_qa_runs where organization_id = $1 and project_id = $2 and id = $3)
        order by created_at desc
        limit 1`, organizationID, projectID, beforeRunID).Scan(
		&row.ID, &row.ProjectID, &row.Trigger, &row.Status, &row.SegmentCount, &row.FindingCount,
		&row.ErrorCount, &row.WarningCount, &row.SummaryRaw, &row.ErrorCode, &row.ErrorMessage,
		&row.StartedAt, &row.CompletedAt, &row.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return serializeQaRunRow(row), nil
}

func (api *qaReportAPI) getTranslationQaRun(ctx context.Context, organizationID, projectID string, runID uuid.UUID) (qaRunRow, error) {
	var row qaRunRow
	err := api.pool.QueryRow(ctx, `
        select id, project_id, trigger, status, segment_count, finding_count, error_count, warning_count,
               summary, error_code, error_message, started_at, completed_at, created_at
        from translation_qa_runs
        where organization_id = $1 and project_id = $2 and id = $3`,
		organizationID, projectID, runID).Scan(
		&row.ID, &row.ProjectID, &row.Trigger, &row.Status, &row.SegmentCount, &row.FindingCount,
		&row.ErrorCount, &row.WarningCount, &row.SummaryRaw, &row.ErrorCode, &row.ErrorMessage,
		&row.StartedAt, &row.CompletedAt, &row.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return row, qaReportFailure(404, "project_not_found", "Project not found")
	}
	return row, err
}

type qaSettingsBody struct {
	Cadence *string                   `json:"cadence"`
	Checks  map[string]qaCheckSetting `json:"checks"`
}

type qaCheckSetting struct {
	Enabled  bool   `json:"enabled"`
	Severity string `json:"severity"`
}

var qaPolicyCheckTypes = map[string]struct{}{
	"not_localized": {}, "whitespace_only": {}, "same_as_source": {}, "escaped_char_mismatch": {},
	"length": {}, "placeholder_mismatch": {}, "glossary_violation": {}, "format": {}, "spelling": {},
	"numbers_mismatch": {}, "punctuation_mismatch": {}, "character_case_mismatch": {},
}

func validQaPolicy(checks map[string]qaCheckSetting) bool {
	if len(checks) != len(qaPolicyCheckTypes) {
		return false
	}
	for key, rule := range checks {
		if _, ok := qaPolicyCheckTypes[key]; !ok || (rule.Severity != "error" && rule.Severity != "warning") {
			return false
		}
	}
	return true
}

func (api *qaReportAPI) patchProjectQaSettings(ctx context.Context, actor qaReportActor, project nativeQaProject, r *http.Request) (any, int, error) {
	var body qaSettingsBody
	if err := readQaReportBody(r, &body); err != nil {
		return nil, 0, err
	}
	cadence := project.QaScanCadence
	if body.Cadence != nil {
		cadence = strings.TrimSpace(*body.Cadence)
	}
	if (cadence != "off" && cadence != "daily") || (body.Checks != nil && !validQaPolicy(body.Checks)) {
		return nil, 0, qaReportFailure(400, "invalid_qa_report_settings", "Invalid QA report settings")
	}
	var lastRunAt *time.Time
	var policy []byte
	var policyArg any
	if body.Checks != nil {
		policyArg, _ = json.Marshal(body.Checks)
	}
	err := api.pool.QueryRow(ctx, `
        update projects
        set qa_scan_cadence = $3, qa_check_policy = coalesce($4::jsonb, qa_check_policy)
        where organization_id = $1 and id = $2
        returning qa_scan_cadence, qa_scan_last_run_at, qa_check_policy`,
		actor.organizationID, project.ID, cadence, policyArg).Scan(&cadence, &lastRunAt, &policy)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, missingQaProject()
	}
	if err != nil {
		return nil, 0, err
	}
	settings := qaReportSettingsPayload(actor, cadence, lastRunAt, policy)
	settings["canManageSchedule"] = true
	return map[string]any{"settings": settings}, 200, nil
}

func parseProjectFindingsQuery(r *http.Request) (locale, checkType, severity string, limit, offset int, err error) {
	limit, offset = 50, 0
	q := r.URL.Query()
	if raw := strings.TrimSpace(q.Get("locale")); raw != "" {
		if len(raw) > 32 {
			return "", "", "", 0, 0, qaReportFailure(400, "invalid_qa_report_query", "Invalid QA report query")
		}
		locale = raw
	}
	if raw := strings.TrimSpace(q.Get("checkType")); raw != "" {
		if _, ok := translationQaCheckTypes[raw]; !ok {
			return "", "", "", 0, 0, qaReportFailure(400, "invalid_qa_report_query", "Invalid QA report query")
		}
		checkType = raw
	}
	if raw := strings.TrimSpace(q.Get("severity")); raw != "" {
		if _, ok := translationQaSeverities[raw]; !ok {
			return "", "", "", 0, 0, qaReportFailure(400, "invalid_qa_report_query", "Invalid QA report query")
		}
		severity = raw
	}
	if raw, ok := q["limit"]; ok && strings.TrimSpace(raw[0]) != "" {
		n, parseErr := strconv.Atoi(strings.TrimSpace(raw[0]))
		if parseErr != nil || n < 1 || n > 100 {
			return "", "", "", 0, 0, qaReportFailure(400, "invalid_qa_report_query", "Invalid QA report query")
		}
		limit = n
	}
	if raw, ok := q["offset"]; ok && strings.TrimSpace(raw[0]) != "" {
		n, parseErr := strconv.Atoi(strings.TrimSpace(raw[0]))
		if parseErr != nil || n < 0 {
			return "", "", "", 0, 0, qaReportFailure(400, "invalid_qa_report_query", "Invalid QA report query")
		}
		offset = n
	}
	return locale, checkType, severity, limit, offset, nil
}

func parseLatestFindingsQuery(r *http.Request) (locale, sourcePath string, limit, offset int, err error) {
	limit, offset = 2000, 0
	locale = strings.TrimSpace(r.URL.Query().Get("locale"))
	if locale == "" || len(locale) > 32 {
		return "", "", 0, 0, qaReportFailure(400, "invalid_qa_report_query", "Invalid QA report query")
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("sourcePath")); raw != "" {
		if len(raw) > 1024 {
			return "", "", 0, 0, qaReportFailure(400, "invalid_qa_report_query", "Invalid QA report query")
		}
		sourcePath = raw
	}
	q := r.URL.Query()
	if raw, ok := q["limit"]; ok && strings.TrimSpace(raw[0]) != "" {
		n, parseErr := strconv.Atoi(strings.TrimSpace(raw[0]))
		if parseErr != nil || n < 1 || n > 2000 {
			return "", "", 0, 0, qaReportFailure(400, "invalid_qa_report_query", "Invalid QA report query")
		}
		limit = n
	}
	if raw, ok := q["offset"]; ok && strings.TrimSpace(raw[0]) != "" {
		n, parseErr := strconv.Atoi(strings.TrimSpace(raw[0]))
		if parseErr != nil || n < 0 {
			return "", "", 0, 0, qaReportFailure(400, "invalid_qa_report_query", "Invalid QA report query")
		}
		offset = n
	}
	return locale, sourcePath, limit, offset, nil
}

func (api *qaReportAPI) getProjectQaRunDetail(ctx context.Context, actor qaReportActor, projectID string, runID uuid.UUID, r *http.Request) (any, int, error) {
	locale, checkType, severity, limit, offset, err := parseProjectFindingsQuery(r)
	if err != nil {
		return nil, 0, err
	}
	row, err := api.getTranslationQaRun(ctx, actor.organizationID, projectID, runID)
	if err != nil {
		return nil, 0, err
	}

	filters := []any{actor.organizationID, projectID, runID}
	filterSQL := `
        organization_id = $1 and project_id = $2 and run_id = $3`
	arg := 4
	if locale != "" {
		filterSQL += fmt.Sprintf(" and target_locale = $%d", arg)
		filters = append(filters, locale)
		arg++
	}
	if checkType != "" {
		filterSQL += fmt.Sprintf(" and check_type = $%d", arg)
		filters = append(filters, checkType)
		arg++
	}
	if severity != "" {
		filterSQL += fmt.Sprintf(" and severity = $%d", arg)
		filters = append(filters, severity)
		arg++
	}

	status, err := qaFindingStatus(r)
	if err != nil {
		return nil, 0, err
	}
	if status != "" && status != "all" {
		filterSQL += fmt.Sprintf(" and status = $%d", arg)
		filters = append(filters, status)
		arg++
	}
	var total int
	countSQL := `select count(*)::int from translation_qa_findings where ` + filterSQL
	if err := api.pool.QueryRow(ctx, countSQL, filters...).Scan(&total); err != nil {
		return nil, 0, err
	}

	listSQL := `
        select id, run_id, key, source_path, target_locale, check_type, severity, category, message,
               related_tokens, source_text, target_text
        from translation_qa_findings
        where ` + filterSQL + `
        order by severity, target_locale, key, id
        limit $` + strconv.Itoa(arg) + ` offset $` + strconv.Itoa(arg+1)
	listArgs := append(filters, limit, offset)
	rows, err := api.pool.Query(ctx, listSQL, listArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	findings := []map[string]any{}
	for rows.Next() {
		var (
			id, runIDStr, key, targetLocale, checkTypeVal, severityVal, category, message string
			sourceText, targetText                                                        string
			sourcePath                                                                    *string
			relatedTokensRaw                                                              []byte
		)
		if err := rows.Scan(
			&id, &runIDStr, &key, &sourcePath, &targetLocale, &checkTypeVal, &severityVal, &category, &message,
			&relatedTokensRaw, &sourceText, &targetText,
		); err != nil {
			return nil, 0, err
		}
		relatedTokens := []string{}
		if len(relatedTokensRaw) > 0 {
			_ = json.Unmarshal(relatedTokensRaw, &relatedTokens)
		}
		findings = append(findings, map[string]any{
			"id":            id,
			"runId":         runIDStr,
			"projectId":     projectID,
			"key":           key,
			"sourcePath":    sourcePath,
			"targetLocale":  targetLocale,
			"checkType":     checkTypeVal,
			"severity":      severityVal,
			"category":      category,
			"message":       message,
			"relatedTokens": relatedTokens,
			"sourceText":    sourceText,
			"targetText":    targetText,
			"editorHref":    buildTranslationQaFindingHref(actor.organizationSlug, projectID, sourcePath, targetLocale, key),
		})
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	rows.Close()
	if err := api.enrichQaFindings(ctx, actor.organizationID, findings); err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"report":   serializeQaRunRow(row),
		"findings": findings,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	}, 200, nil
}

func (api *qaReportAPI) listProjectLatestFindings(ctx context.Context, actor qaReportActor, projectID string, r *http.Request) (any, int, error) {
	locale, sourcePath, limit, offset, err := parseLatestFindingsQuery(r)
	if err != nil {
		return nil, 0, err
	}

	var runID uuid.UUID
	err = api.pool.QueryRow(ctx, `
        select id from translation_qa_runs
        where organization_id = $1 and project_id = $2 and status = 'succeeded'
        order by completed_at desc nulls last, created_at desc
        limit 1`, actor.organizationID, projectID).Scan(&runID)
	if errors.Is(err, pgx.ErrNoRows) {
		return map[string]any{"runId": nil, "findings": []any{}}, 200, nil
	}
	if err != nil {
		return nil, 0, err
	}

	filterSQL := `organization_id = $1 and project_id = $2 and run_id = $3 and target_locale = $4`
	args := []any{actor.organizationID, projectID, runID, locale}
	if sourcePath != "" && sourcePath != contentEditorAllFilesSourcePath {
		filterSQL += ` and (source_path = $5 or source_path is null)`
		args = append(args, sourcePath)
	}

	listSQL := `
        select translation_key_id, key, source_path, target_locale, check_type, severity, category, message,
               related_tokens, source_text, target_text
        from translation_qa_findings
        where ` + filterSQL + `
        order by key, check_type, id
        limit $` + strconv.Itoa(len(args)+1) + ` offset $` + strconv.Itoa(len(args)+2)
	listArgs := append(args, limit, offset)
	rows, err := api.pool.Query(ctx, listSQL, listArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	findings := []map[string]any{}
	for rows.Next() {
		var (
			key, targetLocale, checkTypeVal, severityVal, category, message string
			sourceText, targetText                                          string
			translationKeyID                                                *string
			sourcePathVal                                                   *string
			relatedTokensRaw                                                []byte
		)
		if err := rows.Scan(
			&translationKeyID, &key, &sourcePathVal, &targetLocale, &checkTypeVal, &severityVal, &category, &message,
			&relatedTokensRaw, &sourceText, &targetText,
		); err != nil {
			return nil, 0, err
		}
		relatedTokens := []string{}
		if len(relatedTokensRaw) > 0 {
			_ = json.Unmarshal(relatedTokensRaw, &relatedTokens)
		}
		findings = append(findings, map[string]any{
			"translationKeyId": translationKeyID,
			"key":              key,
			"sourcePath":       sourcePathVal,
			"targetLocale":     targetLocale,
			"checkType":        checkTypeVal,
			"severity":         severityVal,
			"category":         category,
			"message":          message,
			"relatedTokens":    relatedTokens,
			"sourceText":       sourceText,
			"targetText":       targetText,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	runIDStr := runID.String()
	return map[string]any{"runId": runIDStr, "findings": findings}, 200, nil
}

func (api *qaReportAPI) promoteProjectFindings(ctx context.Context, actor qaReportActor, projectID string, r *http.Request) (any, int, error) {
	var payload promoteFindingsBody
	if err := readQaReportBody(r, &payload); err != nil {
		return nil, 0, err
	}
	findingIDs, err := parseFindingIDs(payload.FindingIDs)
	if err != nil {
		return nil, 0, err
	}
	if len(findingIDs) == 0 {
		return map[string]any{"results": []promoteFindingResult{}}, 200, nil
	}

	findings, err := api.loadFindingsForPromote(ctx, actor.organizationID, findingIDs)
	if err != nil {
		return nil, 0, err
	}
	if len(findings) != len(findingIDs) {
		return nil, 0, qaReportFailure(400, "qa_finding_not_found", "One or more findings were not found")
	}
	for _, finding := range findings {
		if finding.ProjectID != projectID {
			return nil, 0, qaReportFailure(400, "qa_finding_not_found", "One or more findings were not found")
		}
	}
	if err := api.assertFindingsOnLatestSucceededRuns(ctx, actor.organizationID, findings); err != nil {
		return nil, 0, err
	}

	results := make([]promoteFindingResult, 0, len(findings))
	for _, finding := range findings {
		result, err := api.promoteSingleFinding(ctx, actor, finding)
		if err != nil {
			return nil, 0, err
		}
		results = append(results, result)
	}
	return map[string]any{"results": results}, 200, nil
}
