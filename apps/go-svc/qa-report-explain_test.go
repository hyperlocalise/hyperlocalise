package main

import (
	"context"
	"net/http"
	"testing"
	"unicode/utf16"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines/check"
	"github.com/stretchr/testify/require"
)

type stubGuidelineChecker struct {
	result check.Result
	err    error
	calls  int
	last   check.ExplainRequest
}

func (s *stubGuidelineChecker) CheckBeforeModel(context.Context, guidelines.Scope, check.Request, func(context.Context) error) (check.Result, error) {
	return check.Result{}, nil
}

func (s *stubGuidelineChecker) ExplainBeforeModel(ctx context.Context, _ guidelines.Scope, req check.ExplainRequest, before func(context.Context) error) (check.Result, error) {
	s.calls++
	s.last = req
	if before != nil {
		if err := before(ctx); err != nil {
			return check.Result{}, err
		}
	}
	if s.err != nil {
		return check.Result{}, s.err
	}
	return s.result, nil
}

func TestQaGuidelineQuoteSkipsWholeField(t *testing.T) {
	t.Parallel()
	target := "Peux-tu aider ?"
	total := 0
	for _, r := range target {
		total += utf16.RuneLen(r)
	}
	require.Equal(t, "tu", qaGuidelineQuote(target, 5, 7))
	require.Empty(t, qaGuidelineQuote(target, 0, total))
}

func TestQaFindingExplainReplacesClassifierCopy(t *testing.T) {
	api, scope := qaReportTestAPI(t, "admin")
	_, err := scope.Pool.Exec(t.Context(), `update projects set source_locale = 'en-US' where id = $1`, scope.ProjectID)
	require.NoError(t, err)
	runID := mustQaRun(t, scope, scope.ProjectID, "succeeded", 1, 0, 1)
	findingID := insertExplainableGuidelineFinding(t, scope, runID, "greeting")
	checker := &stubGuidelineChecker{result: check.Result{Findings: []check.Finding{{
		SegmentID:  "greeting",
		Field:      check.FieldTarget,
		Severity:   "warning",
		Start:      5,
		End:        7,
		Message:    "Use vous.",
		Suggestion: "vous",
		PassageID:  "p1",
	}}, Model: "openai/gpt-6-luna"}}
	api.guidelines = &guidelineCheckAPI{checker: checker}

	rec := qaReportRequest(api, scope, http.MethodPost, scope.OrgPath("/qa-reports/findings/"+findingID+"/explain"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "Use vous. Suggestion: vous")
	require.Equal(t, 1, checker.calls)
	require.Equal(t, []string{"p1"}, checker.last.PassageIDs)
	require.Equal(t, "en-US", checker.last.SourceLocale)
	require.Equal(t, "fr-FR", checker.last.TargetLocale)

	var message string
	var reasoning bool
	var tokens []byte
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        select message, reasoning_available, related_tokens from translation_qa_findings where id = $1`, findingID).
		Scan(&message, &reasoning, &tokens))
	require.Equal(t, "Use vous. Suggestion: vous", message)
	require.False(t, reasoning)
	require.JSONEq(t, `["tu","vous"]`, string(tokens))
}

func TestQaFindingExplainLeavesRowWhenLunaMissesOrCreditIsExhausted(t *testing.T) {
	api, scope := qaReportTestAPI(t, "admin")
	_, err := scope.Pool.Exec(t.Context(), `update projects set source_locale = 'en-US' where id = $1`, scope.ProjectID)
	require.NoError(t, err)
	runID := mustQaRun(t, scope, scope.ProjectID, "succeeded", 1, 0, 1)
	findingID := insertExplainableGuidelineFinding(t, scope, runID, "greeting")
	original := "This text may not match a project guideline."

	api.guidelines = &guidelineCheckAPI{checker: &stubGuidelineChecker{result: check.Result{}}}
	miss := qaReportRequest(api, scope, http.MethodPost, scope.OrgPath("/qa-reports/findings/"+findingID+"/explain"), "")
	require.Equal(t, http.StatusBadGateway, miss.Code, miss.Body.String())
	require.Contains(t, miss.Body.String(), "guideline_explain_failed")
	assertGuidelineFindingUnchanged(t, scope, findingID, original)

	api.guidelines = &guidelineCheckAPI{
		checker: &stubGuidelineChecker{result: check.Result{Findings: []check.Finding{{
			SegmentID: "greeting", Field: check.FieldTarget, Message: "Use vous.",
		}}}},
		meter: &recordingGuidelineMeter{tokenAllow: false},
	}
	denied := qaReportRequest(api, scope, http.MethodPost, scope.OrgPath("/qa-reports/findings/"+findingID+"/explain"), "")
	require.Equal(t, http.StatusPaymentRequired, denied.Code, denied.Body.String())
	require.Contains(t, denied.Body.String(), "ai_credit_exhausted")
	assertGuidelineFindingUnchanged(t, scope, findingID, original)
}

func TestQaFindingExplainRejectsFindingsThatAreNotClassifierRows(t *testing.T) {
	api, scope := qaReportTestAPI(t, "admin")
	runID := mustQaRun(t, scope, scope.ProjectID, "succeeded", 1, 1, 0)
	findingID := mustQaFinding(t, scope, runID, scope.ProjectID, "plain")
	checker := &stubGuidelineChecker{}
	api.guidelines = &guidelineCheckAPI{checker: checker}

	rec := qaReportRequest(api, scope, http.MethodPost, scope.OrgPath("/qa-reports/findings/"+findingID+"/explain"), "")
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "qa_finding_not_explainable")
	require.Zero(t, checker.calls)
}

func insertExplainableGuidelineFinding(t *testing.T, scope *testenv.Scope, runID, key string) string {
	t.Helper()
	id := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into translation_qa_findings (
            id, run_id, organization_id, project_id, key, target_locale, check_type, severity, category,
            message, source_text, target_text, passage_id, reasoning_available
        ) values (
            $1, $2, $3, $4, $5, 'fr-FR', 'guideline', 'warning', 'qa',
            'This text may not match a project guideline.', 'Hello', 'Peux-tu aider ?', 'p1', true
        )`, id, runID, scope.OrganizationID, scope.ProjectID, key)
	require.NoError(t, err)
	return id
}

func assertGuidelineFindingUnchanged(t *testing.T, scope *testenv.Scope, findingID, message string) {
	t.Helper()
	var stored string
	var reasoning bool
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        select message, reasoning_available from translation_qa_findings where id = $1`, findingID).
		Scan(&stored, &reasoning))
	require.Equal(t, message, stored)
	require.True(t, reasoning)
}

func TestQaFindingExplainHidesOtherOrgAndOtherTeamProjects(t *testing.T) {
	api, scope := qaReportTestAPI(t, "translator")
	_, err := scope.Pool.Exec(t.Context(), `update projects set source_locale = 'en-US' where id = $1`, scope.ProjectID)
	require.NoError(t, err)
	teamID := scope.MustTeam(t, "platform", "Platform", "")
	_, err = scope.Pool.Exec(t.Context(), `update projects set team_id = $1 where id = $2`, teamID, scope.ProjectID)
	require.NoError(t, err)
	runID := mustQaRun(t, scope, scope.ProjectID, "succeeded", 1, 0, 1)
	findingID := insertExplainableGuidelineFinding(t, scope, runID, "greeting")
	checker := &stubGuidelineChecker{result: check.Result{Findings: []check.Finding{{
		SegmentID: "greeting", Field: check.FieldTarget, Message: "Use vous.",
	}}}}
	api.guidelines = &guidelineCheckAPI{checker: checker}

	hiddenTeam := qaReportRequest(api, scope, http.MethodPost, scope.OrgPath("/qa-reports/findings/"+findingID+"/explain"), "")
	require.Equal(t, http.StatusNotFound, hiddenTeam.Code, hiddenTeam.Body.String())
	require.Contains(t, hiddenTeam.Body.String(), "project_not_found")
	require.Zero(t, checker.calls)

	other := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	otherRun := mustQaRun(t, other, other.ProjectID, "succeeded", 1, 0, 1)
	otherFinding := insertExplainableGuidelineFinding(t, other, otherRun, "greeting")
	hiddenOrg := qaReportRequest(api, scope, http.MethodPost, scope.OrgPath("/qa-reports/findings/"+otherFinding+"/explain"), "")
	require.Equal(t, http.StatusNotFound, hiddenOrg.Code, hiddenOrg.Body.String())
	require.Contains(t, hiddenOrg.Body.String(), "qa_finding_not_found")
	require.Zero(t, checker.calls)
}

func TestQaFindingExplainConflictsWhenAnotherExplainWins(t *testing.T) {
	api, scope := qaReportTestAPI(t, "admin")
	_, err := scope.Pool.Exec(t.Context(), `update projects set source_locale = 'en-US' where id = $1`, scope.ProjectID)
	require.NoError(t, err)
	runID := mustQaRun(t, scope, scope.ProjectID, "succeeded", 1, 0, 1)
	findingID := insertExplainableGuidelineFinding(t, scope, runID, "greeting")
	original := "This text may not match a project guideline."
	checker := &explainLockStealer{
		scope:     scope,
		findingID: findingID,
		result: check.Result{Findings: []check.Finding{{
			SegmentID: "greeting", Field: check.FieldTarget, Message: "Use vous.",
		}}},
	}
	api.guidelines = &guidelineCheckAPI{checker: checker}

	rec := qaReportRequest(api, scope, http.MethodPost, scope.OrgPath("/qa-reports/findings/"+findingID+"/explain"), "")
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "qa_finding_not_explainable")
	require.Equal(t, 1, checker.calls)
	var stored string
	var reasoning bool
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        select message, reasoning_available from translation_qa_findings where id = $1`, findingID).
		Scan(&stored, &reasoning))
	require.Equal(t, original, stored)
	require.False(t, reasoning)
}

type explainLockStealer struct {
	scope     *testenv.Scope
	findingID string
	result    check.Result
	calls     int
}

func (s *explainLockStealer) CheckBeforeModel(context.Context, guidelines.Scope, check.Request, func(context.Context) error) (check.Result, error) {
	return check.Result{}, nil
}

func (s *explainLockStealer) ExplainBeforeModel(ctx context.Context, _ guidelines.Scope, _ check.ExplainRequest, before func(context.Context) error) (check.Result, error) {
	s.calls++
	if before != nil {
		if err := before(ctx); err != nil {
			return check.Result{}, err
		}
	}
	_, err := s.scope.Pool.Exec(ctx, `
		update translation_qa_findings set reasoning_available = false where id = $1`, s.findingID)
	if err != nil {
		return check.Result{}, err
	}
	return s.result, nil
}
