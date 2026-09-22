package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

var (
	translationQaCheckTypes = map[string]struct{}{
		"not_localized": {}, "whitespace_only": {}, "same_as_source": {}, "escaped_char_mismatch": {},
		"length": {}, "placeholder_mismatch": {}, "glossary_violation": {},
	}
	translationQaSeverities = map[string]struct{}{"error": {}, "warning": {}}
)

type qaSummary struct {
	ByCheckType map[string]int `json:"byCheckType"`
	BySeverity  map[string]int `json:"bySeverity"`
	ByLocale    map[string]int `json:"byLocale"`
}

func emptyQaSummary() qaSummary {
	return qaSummary{
		ByCheckType: map[string]int{},
		BySeverity:  map[string]int{},
		ByLocale:    map[string]int{},
	}
}

func parseWorkspaceFindingsQuery(r *http.Request) (projectID, locale, checkType, severity string, limit, offset int, err error) {
	limit, offset = 50, 0
	q := r.URL.Query()
	if raw := strings.TrimSpace(q.Get("projectId")); raw != "" {
		projectID = raw
	}
	if raw := strings.TrimSpace(q.Get("locale")); raw != "" {
		if len(raw) > 32 {
			return "", "", "", "", 0, 0, qaReportFailure(400, "invalid_qa_report_query", "Invalid QA findings query")
		}
		locale = raw
	}
	if raw := strings.TrimSpace(q.Get("checkType")); raw != "" {
		if _, ok := translationQaCheckTypes[raw]; !ok {
			return "", "", "", "", 0, 0, qaReportFailure(400, "invalid_qa_report_query", "Invalid QA findings query")
		}
		checkType = raw
	}
	if raw := strings.TrimSpace(q.Get("severity")); raw != "" {
		if _, ok := translationQaSeverities[raw]; !ok {
			return "", "", "", "", 0, 0, qaReportFailure(400, "invalid_qa_report_query", "Invalid QA findings query")
		}
		severity = raw
	}
	if raw, ok := q["limit"]; ok && strings.TrimSpace(raw[0]) != "" {
		n, parseErr := strconv.Atoi(strings.TrimSpace(raw[0]))
		if parseErr != nil || n < 1 || n > 100 {
			return "", "", "", "", 0, 0, qaReportFailure(400, "invalid_qa_report_query", "Invalid QA findings query")
		}
		limit = n
	}
	if raw, ok := q["offset"]; ok && strings.TrimSpace(raw[0]) != "" {
		n, parseErr := strconv.Atoi(strings.TrimSpace(raw[0]))
		if parseErr != nil || n < 0 {
			return "", "", "", "", 0, 0, qaReportFailure(400, "invalid_qa_report_query", "Invalid QA findings query")
		}
		offset = n
	}
	return projectID, locale, checkType, severity, limit, offset, nil
}

func (api *qaReportAPI) listWorkspaceReports(ctx context.Context, actor qaReportActor) (any, int, error) {
	rows, err := api.pool.Query(ctx, `
        with latest_qa_run as (
            select distinct on (project_id)
                id, project_id, status, trigger, segment_count, finding_count, error_count, warning_count,
                summary, started_at, completed_at, created_at
            from translation_qa_runs
            where organization_id = $1
            order by project_id, created_at desc
        )
        select
            p.id, p.name, p.qa_scan_cadence, p.qa_scan_last_run_at,
            r.id, r.status, r.trigger, r.segment_count, r.finding_count, r.error_count, r.warning_count,
            r.summary, r.started_at, r.completed_at, r.created_at
        from projects p
        left join latest_qa_run r on r.project_id = p.id
        where p.organization_id = $1 and p.source = 'native'
        and `+formatQaProjectTeamAccessSQL(2, 3, 1)+`
        order by p.name`, actor.organizationID, actor.canWriteProjectTeam(), actor.userID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	type reportPayload struct {
		ID           string    `json:"id"`
		ProjectID    string    `json:"projectId"`
		Trigger      string    `json:"trigger"`
		Status       string    `json:"status"`
		SegmentCount int       `json:"segmentCount"`
		FindingCount int       `json:"findingCount"`
		ErrorCount   int       `json:"errorCount"`
		WarningCount int       `json:"warningCount"`
		Summary      qaSummary `json:"summary"`
		ErrorCode    *string   `json:"errorCode"`
		ErrorMessage *string   `json:"errorMessage"`
		StartedAt    *string   `json:"startedAt"`
		CompletedAt  *string   `json:"completedAt"`
		CreatedAt    string    `json:"createdAt"`
	}

	reports := []map[string]any{}
	for rows.Next() {
		var projectID, projectName, cadence string
		var runID, status, trigger *string
		var segmentCount, findingCount, errorCount, warningCount *int
		var summaryRaw []byte
		var lastRunAt, startedAt, completedAt, runCreatedAt *time.Time
		if err := rows.Scan(
			&projectID, &projectName, &cadence, &lastRunAt,
			&runID, &status, &trigger, &segmentCount, &findingCount, &errorCount, &warningCount,
			&summaryRaw, &startedAt, &completedAt, &runCreatedAt,
		); err != nil {
			return nil, 0, err
		}
		var lastRunISO *string
		if lastRunAt != nil {
			lastRunISO = formatQaReportTime(lastRunAt)
		} else if runCreatedAt != nil {
			lastRunISO = formatQaReportTime(runCreatedAt)
		}
		row := map[string]any{
			"projectId":   projectID,
			"projectName": projectName,
			"cadence":     cadence,
			"lastRunAt":   lastRunISO,
			"report":      nil,
		}
		if runID != nil && status != nil {
			summary := emptyQaSummary()
			if len(summaryRaw) > 0 {
				_ = json.Unmarshal(summaryRaw, &summary)
			}
			created := time.Time{}
			if runCreatedAt != nil {
				created = *runCreatedAt
			}
			if created.IsZero() {
				created = time.Unix(0, 0).UTC()
			}
			triggerVal := "manual"
			if trigger != nil {
				triggerVal = *trigger
			}
			row["report"] = reportPayload{
				ID:           *runID,
				ProjectID:    projectID,
				Trigger:      triggerVal,
				Status:       *status,
				SegmentCount: derefInt(segmentCount),
				FindingCount: derefInt(findingCount),
				ErrorCount:   derefInt(errorCount),
				WarningCount: derefInt(warningCount),
				Summary:      summary,
				ErrorCode:    nil,
				ErrorMessage: nil,
				StartedAt:    formatQaReportTime(startedAt),
				CompletedAt:  formatQaReportTime(completedAt),
				CreatedAt:    created.UTC().Format("2006-01-02T15:04:05.000Z"),
			}
		}
		reports = append(reports, row)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"reports": reports}, 200, nil
}

func derefInt(v *int) int {
	if v == nil {
		return 0
	}
	return *v
}

func (api *qaReportAPI) listWorkspaceFindings(ctx context.Context, actor qaReportActor, r *http.Request) (any, int, error) {
	projectID, locale, checkType, severity, limit, offset, err := parseWorkspaceFindingsQuery(r)
	if err != nil {
		return nil, 0, err
	}

	projectFilter := any(nil)
	if projectID != "" {
		projectFilter = projectID
	}
	localeFilter := any(nil)
	if locale != "" {
		localeFilter = locale
	}
	checkTypeFilter := any(nil)
	if checkType != "" {
		checkTypeFilter = checkType
	}
	severityFilter := any(nil)
	if severity != "" {
		severityFilter = severity
	}

	queryArgs := []any{
		actor.organizationID,
		projectFilter,
		localeFilter,
		checkTypeFilter,
		severityFilter,
		actor.canWriteProjectTeam(),
		actor.userID,
	}

	latestRunSQL := `
        latest_succeeded_qa_run as (
            select distinct on (project_id) id, project_id
            from translation_qa_runs
            where organization_id = $1 and status = 'succeeded'
            and ($2::text is null or project_id = $2::text)
            order by project_id, completed_at desc nulls last, created_at desc
        )`

	filterSQL := `
        f.organization_id = $1
        and ($2::text is null or f.project_id = $2::text)
        and ($3::text is null or f.target_locale = $3::text)
        and ($4::text is null or f.check_type = $4::text)
        and ($5::text is null or f.severity = $5::text)
        and f.run_id = lr.id
        and ` + formatQaProjectTeamAccessSQL(6, 7, 1)

	countSQL := `with ` + latestRunSQL + `
        select count(*)::int
        from translation_qa_findings f
        inner join latest_succeeded_qa_run lr on lr.id = f.run_id
        inner join projects p on p.id = f.project_id
        where ` + filterSQL

	listSQL := `with ` + latestRunSQL + `
        select
            f.id, f.run_id, f.project_id, p.name, f.translation_key_id, f.key, f.source_path,
            f.target_locale, f.check_type, f.severity, f.category, f.message, f.related_tokens,
            f.source_text, f.target_text
        from translation_qa_findings f
        inner join latest_succeeded_qa_run lr on lr.id = f.run_id
        inner join projects p on p.id = f.project_id
        where ` + filterSQL + `
        order by p.name, f.target_locale, f.key, f.id
        limit $8 offset $9`

	var total int
	if err := api.pool.QueryRow(ctx, countSQL, queryArgs...).Scan(&total); err != nil {
		return nil, 0, err
	}

	listArgs := append(queryArgs, limit, offset)
	rows, err := api.pool.Query(ctx, listSQL, listArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	findings := []map[string]any{}
	for rows.Next() {
		var (
			id, runID, projectID, projectName, key, targetLocale, checkType, severity, category, message string
			sourceText, targetText                                                                       string
			translationKeyID                                                                             *string
			sourcePath                                                                                   *string
			relatedTokensRaw                                                                             []byte
		)
		if err := rows.Scan(
			&id, &runID, &projectID, &projectName, &translationKeyID, &key, &sourcePath,
			&targetLocale, &checkType, &severity, &category, &message, &relatedTokensRaw,
			&sourceText, &targetText,
		); err != nil {
			return nil, 0, err
		}
		relatedTokens := []string{}
		if len(relatedTokensRaw) > 0 {
			_ = json.Unmarshal(relatedTokensRaw, &relatedTokens)
		}
		editorHref := buildTranslationQaFindingHref(actor.organizationSlug, projectID, sourcePath, targetLocale, key)
		findings = append(findings, map[string]any{
			"id":               id,
			"runId":            runID,
			"projectId":        projectID,
			"projectName":      projectName,
			"translationKeyId": translationKeyID,
			"key":              key,
			"sourcePath":       sourcePath,
			"targetLocale":     targetLocale,
			"checkType":        checkType,
			"severity":         severity,
			"category":         category,
			"message":          message,
			"relatedTokens":    relatedTokens,
			"sourceText":       sourceText,
			"targetText":       targetText,
			"editorHref":       editorHref,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"findings": findings,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	}, 200, nil
}

func parseFindingIDs(raw []string) ([]uuid.UUID, error) {
	n := len(raw)
	if n == 0 || n > 100 {
		return nil, qaReportFailure(400, "invalid_qa_findings_promote", "Invalid QA findings promote payload")
	}
	// Pre-allocate ids slice capacity; since n <= 100, linear deduplication scan
	// avoids allocating a map[uuid.UUID]struct{} on the heap.
	ids := make([]uuid.UUID, 0, n)
	for _, item := range raw {
		// Canonical UUIDs are 36 bytes with non-whitespace edges. A shorter form
		// that uuid.Parse accepts (for example 32 hex digits) can also total 36
		// bytes once surrounding spaces are counted, so check the boundaries
		// before skipping TrimSpace.
		s := item
		if len(item) != 36 || item[0] <= ' ' || item[0] >= utf8.RuneSelf || item[len(item)-1] <= ' ' || item[len(item)-1] >= utf8.RuneSelf {
			s = strings.TrimSpace(item)
		}
		id, err := uuid.Parse(s)
		if err != nil {
			return nil, qaReportFailure(400, "invalid_qa_findings_promote", "Invalid QA findings promote payload")
		}
		duplicate := false
		for _, existing := range ids {
			if existing == id {
				duplicate = true
				break
			}
		}
		if !duplicate {
			ids = append(ids, id)
		}
	}
	return ids, nil
}
