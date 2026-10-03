package main

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

func qaFindingStatus(r *http.Request) (string, error) {
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	switch status {
	case "", "all", "open", "ignored", "resolved":
		return status, nil
	default:
		return "", qaReportFailure(400, "invalid_qa_report_query", "Invalid finding status")
	}
}

// Reviews apply to the exact diagnostic snapshot, across scans of the same rule.
// Reopening clears every matching exception so an older scan cannot resurrect it.
func (api *qaReportAPI) reviewFindingHandler(r *http.Request, actor qaReportActor) (any, int, error) {
	if !actor.canPromoteFindings() {
		return nil, 0, qaReportFailure(403, "forbidden", "You cannot review findings")
	}
	id, err := uuid.Parse(r.PathValue("findingId"))
	if err != nil {
		return nil, 0, qaReportFailure(404, "qa_finding_not_found", "Finding not found")
	}
	var body struct {
		Status string `json:"status"`
		Reason string `json:"reason"`
	}
	if err := readQaReportBody(r, &body); err != nil {
		return nil, 0, err
	}
	body.Reason = strings.TrimSpace(body.Reason)
	if (body.Status != "ignored" && body.Status != "open") || (body.Status == "ignored" && (body.Reason == "" || len(body.Reason) > 1000)) {
		return nil, 0, qaReportFailure(400, "invalid_qa_review", "Choose a review status and provide a reason of up to 1000 characters")
	}
	findings, err := api.loadFindingsForPromote(r.Context(), actor.organizationID, []uuid.UUID{id})
	if err != nil {
		return nil, 0, err
	}
	if len(findings) != 1 {
		return nil, 0, qaReportFailure(404, "qa_finding_not_found", "Finding not found")
	}
	if err := api.assertFindingsAccessible(r.Context(), actor, findings); err != nil {
		return nil, 0, err
	}
	if err := api.assertFindingsOnLatestSucceededRuns(r.Context(), actor.organizationID, findings); err != nil {
		return nil, 0, err
	}
	if body.Status == "open" {
		body.Reason = ""
	}
	// IS NOT DISTINCT FROM keeps null translation_key_id rows in the same diagnostic
	// snapshot — plain = never matches null to null, so ignore/reopen would no-op.
	_, err = api.pool.Exec(r.Context(), `update translation_qa_findings f set status = $3,
        ignore_reason = nullif($4, ''), reviewed_by_user_id = $5, reviewed_at = now()
        from translation_qa_findings selected
        where selected.id = $2 and selected.organization_id = $1
        and f.organization_id = selected.organization_id and f.project_id = selected.project_id
        and f.translation_key_id is not distinct from selected.translation_key_id
        and f.target_locale = selected.target_locale
        and f.check_type = selected.check_type and f.message = selected.message
        and f.source_text = selected.source_text and f.target_text = selected.target_text
        and f.rule_version = selected.rule_version`, actor.organizationID, id, body.Status, body.Reason, actor.userID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"finding": map[string]any{"id": id.String(), "status": body.Status, "ignoreReason": body.Reason}}, 200, nil
}

func (api *qaReportAPI) enrichQaFindings(ctx context.Context, organizationID string, findings []map[string]any) error {
	if len(findings) == 0 {
		return nil
	}
	ids := make([]string, 0, len(findings))
	byID := make(map[string]map[string]any, len(findings))
	for _, f := range findings {
		id, _ := f["id"].(string)
		ids = append(ids, id)
		byID[id] = f
	}
	rows, err := api.pool.Query(ctx, `select f.id, f.status, f.ignore_reason,
        (k.source_text is distinct from f.source_text or coalesce(t.text, '') <> f.target_text),
        (select i.identifier from issue_sheet_issues i where i.organization_id = f.organization_id
          and i.project_id = f.project_id and i.metadata->'qaFinding'->>'findingId' = f.id::text limit 1)
        from translation_qa_findings f
        left join project_translation_keys k on k.id = f.translation_key_id
        left join project_translations t on t.translation_key_id = f.translation_key_id and t.target_locale = f.target_locale
        where f.organization_id = $1 and f.id = any($2::uuid[])`, organizationID, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id, status string
		var reason, issueIdentifier *string
		var changed bool
		if err := rows.Scan(&id, &status, &reason, &changed, &issueIdentifier); err != nil {
			return err
		}
		f := byID[id]
		f["status"] = status
		f["ignoreReason"] = reason
		f["needsRecheck"] = changed
		f["issueIdentifier"] = issueIdentifier
	}
	return rows.Err()
}
