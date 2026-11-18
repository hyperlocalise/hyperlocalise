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

type qaReviewBody struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
}

func (body *qaReviewBody) validate() error {
	body.Reason = strings.TrimSpace(body.Reason)
	if (body.Status != "ignored" && body.Status != "open") || (body.Status == "ignored" && (body.Reason == "" || len(body.Reason) > 1000)) {
		return qaReportFailure(400, "invalid_qa_review", "Choose a review status and provide a reason of up to 1000 characters")
	}
	if body.Status == "open" {
		body.Reason = ""
	}
	return nil
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
	var body qaReviewBody
	if err := readQaReportBody(r, &body); err != nil {
		return nil, 0, err
	}
	if err := body.validate(); err != nil {
		return nil, 0, err
	}
	notFound := qaReportFailure(404, "qa_finding_not_found", "Finding not found")
	if err := api.applyQaFindingReview(r.Context(), actor, []uuid.UUID{id}, body, notFound); err != nil {
		return nil, 0, err
	}
	return map[string]any{"finding": map[string]any{"id": id.String(), "status": body.Status, "ignoreReason": body.Reason}}, 200, nil
}

// reviewFindingsHandler applies one review to up to 100 findings. It is all or
// nothing: a missing, inaccessible, or stale finding rejects the whole batch.
func (api *qaReportAPI) reviewFindingsHandler(r *http.Request, actor qaReportActor) (any, int, error) {
	if !actor.canPromoteFindings() {
		return nil, 0, qaReportFailure(403, "forbidden", "You cannot review findings")
	}
	var body struct {
		qaReviewBody
		FindingIDs []string `json:"findingIds"`
	}
	if err := readQaReportBody(r, &body); err != nil {
		return nil, 0, err
	}
	if err := body.validate(); err != nil {
		return nil, 0, err
	}
	ids, err := parseFindingIDs(body.FindingIDs)
	if err != nil {
		return nil, 0, qaReportFailure(400, "invalid_qa_review", "Select between 1 and 100 findings")
	}
	notFound := qaReportFailure(400, "qa_finding_not_found", "One or more findings were not found")
	if err := api.applyQaFindingReview(r.Context(), actor, ids, body.qaReviewBody, notFound); err != nil {
		return nil, 0, err
	}
	findings := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		findings = append(findings, map[string]any{"id": id.String(), "status": body.Status, "ignoreReason": body.Reason})
	}
	return map[string]any{"findings": findings}, 200, nil
}

// applyQaFindingReview returns notFound when any id does not exist in the organization.
func (api *qaReportAPI) applyQaFindingReview(ctx context.Context, actor qaReportActor, ids []uuid.UUID, body qaReviewBody, notFound error) error {
	findings, err := api.loadFindingsForPromote(ctx, actor.organizationID, ids)
	if err != nil {
		return err
	}
	if len(findings) != len(ids) {
		return notFound
	}
	if err := api.assertFindingsAccessible(ctx, actor, findings); err != nil {
		return err
	}
	if err := api.assertFindingsOnLatestSucceededRuns(ctx, actor.organizationID, findings); err != nil {
		return err
	}
	// IS NOT DISTINCT FROM keeps null translation_key_id rows in the same diagnostic
	// snapshot — plain = never matches null to null, so ignore/reopen would no-op.
	// Match key as well: deleted source keys both store null translation_key_id, so
	// locale + diagnostic alone would apply one review to a different key.
	_, err = api.pool.Exec(ctx, `update translation_qa_findings f set status = $3,
        ignore_reason = nullif($4, ''), reviewed_by_user_id = $5, reviewed_at = now()
        from translation_qa_findings selected
        where selected.id = any($2::uuid[]) and selected.organization_id = $1
        and f.organization_id = selected.organization_id and f.project_id = selected.project_id
        and f.translation_key_id is not distinct from selected.translation_key_id
        and f.key = selected.key
        and f.target_locale = selected.target_locale
        and f.check_type = selected.check_type and f.message = selected.message
        and f.source_text = selected.source_text and f.target_text = selected.target_text
        and f.rule_version = selected.rule_version`, actor.organizationID, ids, body.Status, body.Reason, actor.userID)
	return err
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
