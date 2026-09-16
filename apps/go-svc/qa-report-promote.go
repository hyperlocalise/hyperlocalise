package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type promoteFindingsBody struct {
	FindingIDs []string `json:"findingIds"`
}

type promoteFindingResult struct {
	FindingID  string `json:"findingId"`
	IssueID    string `json:"issueId"`
	Identifier string `json:"identifier"`
	Created    bool   `json:"created"`
}

func (api *qaReportAPI) promoteWorkspaceFindings(ctx context.Context, actor qaReportActor, r *http.Request) (any, int, error) {
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

type qaFindingRow struct {
	ID               uuid.UUID
	RunID            uuid.UUID
	ProjectID        string
	TranslationKeyID *string
	Key              string
	SourcePath       *string
	TargetLocale     string
	CheckType        string
	Severity         string
	Message          string
	SourceText       string
	TargetText       string
}

func (api *qaReportAPI) loadFindingsForPromote(ctx context.Context, organizationID string, ids []uuid.UUID) ([]qaFindingRow, error) {
	rows, err := api.pool.Query(ctx, `
        select id, run_id, project_id, translation_key_id, key, source_path, target_locale,
               check_type, severity, message, source_text, target_text
        from translation_qa_findings
        where organization_id = $1 and id = any($2)`, organizationID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	findings := []qaFindingRow{}
	for rows.Next() {
		var row qaFindingRow
		if err := rows.Scan(
			&row.ID, &row.RunID, &row.ProjectID, &row.TranslationKeyID, &row.Key, &row.SourcePath,
			&row.TargetLocale, &row.CheckType, &row.Severity, &row.Message, &row.SourceText, &row.TargetText,
		); err != nil {
			return nil, err
		}
		findings = append(findings, row)
	}
	return findings, rows.Err()
}

func (api *qaReportAPI) assertFindingsOnLatestSucceededRuns(ctx context.Context, organizationID string, findings []qaFindingRow) error {
	projectIDs := make([]string, 0)
	seen := map[string]struct{}{}
	for _, finding := range findings {
		if _, ok := seen[finding.ProjectID]; ok {
			continue
		}
		seen[finding.ProjectID] = struct{}{}
		projectIDs = append(projectIDs, finding.ProjectID)
	}
	rows, err := api.pool.Query(ctx, `
        select distinct on (project_id) project_id, id
        from translation_qa_runs
        where organization_id = $1 and status = 'succeeded' and project_id = any($2)
        order by project_id, completed_at desc nulls last, created_at desc`, organizationID, projectIDs)
	if err != nil {
		return err
	}
	defer rows.Close()
	latest := map[string]uuid.UUID{}
	for rows.Next() {
		var projectID string
		var runID uuid.UUID
		if err := rows.Scan(&projectID, &runID); err != nil {
			return err
		}
		latest[projectID] = runID
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, finding := range findings {
		runID, ok := latest[finding.ProjectID]
		if !ok || runID != finding.RunID {
			return qaReportFailure(400, "qa_finding_stale", "Findings must be from each project's latest successful scan")
		}
	}
	return nil
}

func (api *qaReportAPI) promoteSingleFinding(ctx context.Context, actor qaReportActor, finding qaFindingRow) (promoteFindingResult, error) {
	editorHref := buildTranslationQaFindingHref(actor.organizationSlug, finding.ProjectID, finding.SourcePath, finding.TargetLocale, finding.Key)
	externalRef := buildQaFindingExternalRef(
		finding.ProjectID,
		finding.RunID.String(),
		finding.Key,
		finding.CheckType,
		finding.TargetLocale,
	)

	var existingID, existingIdentifier string
	err := api.pool.QueryRow(ctx, `
        select id, identifier from issue_sheet_issues
        where organization_id = $1 and project_id = $2 and external_ref = $3
        limit 1`, actor.organizationID, finding.ProjectID, externalRef).Scan(&existingID, &existingIdentifier)
	if err == nil {
		return promoteFindingResult{
			FindingID:  finding.ID.String(),
			IssueID:    existingID,
			Identifier: existingIdentifier,
			Created:    false,
		}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return promoteFindingResult{}, err
	}

	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return promoteFindingResult{}, err
	}
	defer tx.Rollback(ctx)

	if err := ensureIssueStarterColumns(ctx, tx, actor.organizationID, finding.ProjectID, actor.userID); err != nil {
		return promoteFindingResult{}, err
	}

	var issueNumber int
	var projectIdentifier string
	if err := tx.QueryRow(ctx, `
        update projects set
            issue_number_seq = greatest(
                issue_number_seq,
                coalesce((select max(number) from issue_sheet_issues where project_id = $1), 0)
            ) + 1,
            updated_at = now()
        where id = $1
        returning issue_number_seq, identifier`, finding.ProjectID).Scan(&issueNumber, &projectIdentifier); err != nil {
		return promoteFindingResult{}, err
	}
	identifier := fmt.Sprintf("%s-%d", projectIdentifier, issueNumber)
	priority := "P2"
	if finding.Severity == "error" {
		priority = "P1"
	}
	title := buildQaFindingIssueTitle(finding.CheckType, finding.Key, finding.TargetLocale)
	description := buildQaFindingIssueDescription(
		finding.CheckType,
		finding.Message,
		finding.SourceText,
		finding.TargetText,
		editorHref,
	)
	metadata, err := json.Marshal(buildQaFindingIssueMetadata(
		finding.RunID.String(),
		finding.ID.String(),
		finding.CheckType,
		finding.Severity,
		editorHref,
	))
	if err != nil {
		return promoteFindingResult{}, err
	}

	var issueID string
	err = tx.QueryRow(ctx, `
        insert into issue_sheet_issues (
            identifier, number, organization_id, project_id, title, description, issue_type, status,
            target_locale, source_path, segment_id, translation_key_id, link_kind, link_url, external_ref,
            template_key, metadata, reporter_user_id
        ) values (
            $1, $2, $3, $4, $5, $6, 'qa_failure', 'open',
            $7, $8, $9, $10, 'content_editor_segment', $11, $12,
            'tpl_qa_failure', $13::jsonb, $14
        )
        on conflict do nothing
        returning id`, identifier, issueNumber, actor.organizationID, finding.ProjectID, title, description,
		finding.TargetLocale, finding.SourcePath, finding.Key, finding.TranslationKeyID, editorHref, externalRef,
		metadata, actor.userID).Scan(&issueID)
	if errors.Is(err, pgx.ErrNoRows) {
		if err := tx.QueryRow(ctx, `
            select id, identifier from issue_sheet_issues
            where organization_id = $1 and project_id = $2 and external_ref = $3
            limit 1`, actor.organizationID, finding.ProjectID, externalRef).Scan(&existingID, &existingIdentifier); err != nil {
			return promoteFindingResult{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return promoteFindingResult{}, err
		}
		return promoteFindingResult{
			FindingID:  finding.ID.String(),
			IssueID:    existingID,
			Identifier: existingIdentifier,
			Created:    false,
		}, nil
	}
	if err != nil {
		return promoteFindingResult{}, err
	}

	if _, err := tx.Exec(ctx, `
        insert into issue_sheet_activities (
            organization_id, project_id, issue_id, actor_user_id, type, payload, created_at
        ) values ($1, $2, $3, $4, 'issue_created', '{}'::jsonb, clock_timestamp())`,
		actor.organizationID, finding.ProjectID, issueID, actor.userID); err != nil {
		return promoteFindingResult{}, err
	}

	if _, err := tx.Exec(ctx, `
        insert into issue_sheet_subscriptions (organization_id, project_id, issue_id, user_id)
        values ($1, $2, $3, $4)
        on conflict do nothing`,
		actor.organizationID, finding.ProjectID, issueID, actor.userID); err != nil {
		return promoteFindingResult{}, err
	}

	var columnID string
	if err := tx.QueryRow(ctx, `
        select id from issue_sheet_columns
        where organization_id = $1 and project_id = $2 and key = 'priority'
        limit 1`, actor.organizationID, finding.ProjectID).Scan(&columnID); err == nil {
		if _, err := tx.Exec(ctx, `
            insert into issue_sheet_row_values (
                organization_id, project_id, issue_id, column_id, value
            ) values ($1, $2, $3, $4, to_jsonb($5::text))
            on conflict (issue_id, column_id) do update set value = excluded.value, updated_at = now()`,
			actor.organizationID, finding.ProjectID, issueID, columnID, priority); err != nil {
			return promoteFindingResult{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return promoteFindingResult{}, err
	}
	return promoteFindingResult{
		FindingID:  finding.ID.String(),
		IssueID:    issueID,
		Identifier: identifier,
		Created:    true,
	}, nil
}

func ensureIssueStarterColumns(ctx context.Context, tx pgx.Tx, organizationID, projectID, actorUserID string) error {
	starter := []struct {
		key, label, layer, typ string
		sortOrder              int
		config                 string
	}{
		{"priority", "Priority", "custom", "select", 10, `{"options":[{"id":"P0","label":"P0","color":"red"},{"id":"P1","label":"P1","color":"amber"},{"id":"P2","label":"P2","color":"slate"}]}`},
		{"owner_note", "Owner note", "custom", "long_text", 20, `{}`},
		{"context", "Context", "enrichment", "enrichment", 30, `{"agentKind":"context","autoRun":"never"}`},
	}
	for _, column := range starter {
		if _, err := tx.Exec(ctx, `
            insert into issue_sheet_columns (
                organization_id, project_id, key, label, layer, type, config, sort_order, created_by_user_id
            ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
            on conflict (project_id, key) do nothing`,
			organizationID, projectID, column.key, column.label, column.layer, column.typ, column.config, column.sortOrder, actorUserID); err != nil {
			return err
		}
	}
	return nil
}
