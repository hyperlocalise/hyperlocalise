package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"unicode/utf16"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines/check"
	"github.com/jackc/pgx/v5"
)

type qaExplainFinding struct {
	ProjectID          string
	TranslationKeyID   *string
	Key                string
	TargetLocale       string
	CheckType          string
	SourceText         string
	TargetText         string
	PassageID          string
	ReasoningAvailable bool
	SourceLocale       string
}

func (row qaExplainFinding) explainable() bool {
	return row.CheckType == "guideline" &&
		row.ReasoningAvailable &&
		strings.TrimSpace(row.PassageID) != "" &&
		strings.TrimSpace(row.SourceLocale) != ""
}

func (api *qaReportAPI) explainFindingHandler(r *http.Request, actor qaReportActor) (any, int, error) {
	id, err := uuid.Parse(r.PathValue("findingId"))
	if err != nil {
		return nil, 0, qaReportFailure(404, "qa_finding_not_found", "Finding not found")
	}
	row, err := api.loadFindingForExplain(r.Context(), actor.organizationID, id)
	if err != nil {
		return nil, 0, err
	}
	if _, err := api.ownedNativeProject(r.Context(), actor, row.ProjectID); err != nil {
		return nil, 0, err
	}
	if !row.explainable() {
		return nil, 0, qaReportFailure(409, "qa_finding_not_explainable", "This finding cannot be explained")
	}
	if api.guidelines == nil || api.guidelines.checker == nil {
		return nil, 0, qaReportFailure(503, "guideline_check_unavailable", "Guideline checks are not configured")
	}
	sourceLocale, err := guidelines.NormalizeLocale(row.SourceLocale)
	if err != nil {
		return nil, 0, qaReportFailure(409, "qa_finding_not_explainable", "This finding cannot be explained")
	}
	targetLocale, err := guidelines.NormalizeLocale(row.TargetLocale)
	if err != nil {
		return nil, 0, qaReportFailure(409, "qa_finding_not_explainable", "This finding cannot be explained")
	}
	segmentID := row.Key
	if row.TranslationKeyID != nil && strings.TrimSpace(*row.TranslationKeyID) != "" {
		segmentID = *row.TranslationKeyID
	}
	result, err := api.guidelines.runExplainModel(r.Context(), actor.organizationID, guidelines.Scope{
		OrganizationID: actor.organizationID,
		ProjectID:      row.ProjectID,
		Locale:         targetLocale,
	}, check.ExplainRequest{
		Request: check.Request{
			SourceLocale: sourceLocale,
			TargetLocale: targetLocale,
			Segments: []check.Segment{{
				ID:     segmentID,
				Source: row.SourceText,
				Target: row.TargetText,
			}},
			Checks: []check.Field{check.FieldTarget},
		},
		PassageIDs: []string{row.PassageID},
	})
	if err != nil {
		var memoryErr *knowledgeMemoryError
		if errors.As(err, &memoryErr) {
			return nil, 0, qaReportFailure(memoryErr.status, memoryErr.code, memoryErr.message)
		}
		return nil, 0, err
	}
	explained, ok := firstExplainedTargetFinding(result.Findings, segmentID)
	if !ok {
		return nil, 0, qaReportFailure(502, "guideline_explain_failed", "No explanation was available for this finding")
	}
	message := qaGuidelineMessage(explained)
	tokens := qaGuidelineRelatedTokens(row.TargetText, explained)
	rawTokens, err := json.Marshal(tokens)
	if err != nil {
		return nil, 0, err
	}
	tag, err := api.pool.Exec(r.Context(), `update translation_qa_findings
        set message = $3, related_tokens = $4::jsonb, reasoning_available = false
        where id = $1 and organization_id = $2 and check_type = 'guideline' and reasoning_available = true`,
		id, actor.organizationID, message, rawTokens)
	if err != nil {
		return nil, 0, err
	}
	if tag.RowsAffected() == 0 {
		return nil, 0, qaReportFailure(409, "qa_finding_not_explainable", "This finding cannot be explained")
	}
	return map[string]any{"finding": map[string]any{
		"id":                 id.String(),
		"message":            message,
		"relatedTokens":      tokens,
		"reasoningAvailable": false,
	}}, http.StatusOK, nil
}

func (api *qaReportAPI) loadFindingForExplain(ctx context.Context, organizationID string, id uuid.UUID) (qaExplainFinding, error) {
	var row qaExplainFinding
	var passageID *string
	err := api.pool.QueryRow(ctx, `
        select f.project_id, f.translation_key_id, f.key, f.target_locale, f.check_type,
               f.source_text, f.target_text, f.passage_id, f.reasoning_available, coalesce(p.source_locale, '')
        from translation_qa_findings f
        join projects p on p.id = f.project_id
        where f.organization_id = $1 and f.id = $2`, organizationID, id).Scan(
		&row.ProjectID, &row.TranslationKeyID, &row.Key, &row.TargetLocale, &row.CheckType,
		&row.SourceText, &row.TargetText, &passageID, &row.ReasoningAvailable, &row.SourceLocale,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return qaExplainFinding{}, qaReportFailure(404, "qa_finding_not_found", "Finding not found")
	}
	if err != nil {
		return qaExplainFinding{}, err
	}
	if passageID != nil {
		row.PassageID = *passageID
	}
	return row, nil
}

func firstExplainedTargetFinding(findings []check.Finding, segmentID string) (check.Finding, bool) {
	for _, finding := range findings {
		if finding.SegmentID != segmentID || finding.Field != check.FieldTarget {
			continue
		}
		if strings.TrimSpace(finding.Message) == "" {
			continue
		}
		return finding, true
	}
	return check.Finding{}, false
}

func qaGuidelineMessage(finding check.Finding) string {
	message := strings.TrimSpace(finding.Message)
	suggestion := strings.TrimSpace(finding.Suggestion)
	if suggestion == "" {
		return message
	}
	return message + " Suggestion: " + suggestion
}

func qaGuidelineRelatedTokens(target string, finding check.Finding) []string {
	tokens := make([]string, 0)
	if quote := qaGuidelineQuote(target, finding.Start, finding.End); quote != "" {
		tokens = append(tokens, quote)
	}
	if suggestion := strings.TrimSpace(finding.Suggestion); suggestion != "" {
		tokens = append(tokens, suggestion)
	}
	return tokens
}

// qaGuidelineQuote slices target by UTF-16 offsets. A span of the whole field
// is not a quote, matching the scan finding mapper.
func qaGuidelineQuote(text string, start, end int) string {
	if start < 0 || end <= start {
		return ""
	}
	total := 0
	for _, r := range text {
		total += utf16.RuneLen(r)
	}
	if start == 0 && end == total {
		return ""
	}
	var quoted strings.Builder
	pos := 0
	started := false
	for _, r := range text {
		width := utf16.RuneLen(r)
		if pos == start {
			started = true
		}
		next := pos + width
		if started {
			quoted.WriteRune(r)
		}
		if started && next >= end {
			return quoted.String()
		}
		pos = next
	}
	if started {
		return quoted.String()
	}
	return ""
}
