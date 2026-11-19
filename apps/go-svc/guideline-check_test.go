package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines/check"
	guidelinepg "github.com/hyperlocalise/hyperlocalise/internal/guidelines/postgres"
	"github.com/stretchr/testify/require"
)

type fixedGuidelineClassifier struct {
	fill  float64
	err   error
	calls int
}

func (c *fixedGuidelineClassifier) Name() string { return "typesafe-ai/jev" }

func (c *fixedGuidelineClassifier) Classify(_ context.Context, _ any, questions map[string]check.BooleanQuestion) (map[string]float64, error) {
	c.calls++
	if c.err != nil {
		return nil, c.err
	}
	out := make(map[string]float64, len(questions))
	for id := range questions {
		out[id] = c.fill
	}
	return out, nil
}

type fixedGuidelineModel struct {
	output      string
	inputTokens int
	calls       int
}

func (m *fixedGuidelineModel) Complete(context.Context, string, string) (check.Completion, error) {
	m.calls++
	return check.Completion{Text: m.output, InputTokens: m.inputTokens, OutputTokens: 8}, nil
}

func (m *fixedGuidelineModel) Name() string { return "test-model" }

type recordingGuidelineMeter struct {
	mu         sync.Mutex
	allowed    bool
	checkErr   error
	tokenAllow bool
	tokenErr   error
	checks     []autumn.CheckRequest
	tracks     []autumn.TrackRequest
	tokens     []autumn.TrackTokensRequest
}

func (m *recordingGuidelineMeter) Check(_ context.Context, req autumn.CheckRequest) (autumn.CheckResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.checks = append(m.checks, req)
	if req.FeatureID == autumn.AITokens {
		return autumn.CheckResponse{Allowed: m.tokenAllow}, m.tokenErr
	}
	return autumn.CheckResponse{Allowed: m.allowed}, m.checkErr
}

func (m *recordingGuidelineMeter) Track(_ context.Context, req autumn.TrackRequest) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tracks = append(m.tracks, req)
	return nil
}

func (m *recordingGuidelineMeter) TrackTokens(_ context.Context, req autumn.TrackTokensRequest) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tokens = append(m.tokens, req)
	return nil
}

func withGuidelineCheck(env *guidelineTestEnv, classifier check.Classifier, explainer check.Model, meter guidelineCheckMeter) {
	retriever := guidelines.NewService(guidelinepg.NewWithPool(env.scope.Pool), nil)
	env.handler.guidelineCheck = &guidelineCheckAPI{knowledge: env.handler.knowledgeMemories, checker: check.New(retriever, classifier, explainer), meter: meter}
}

func seedReadyGuideline(t *testing.T, env *guidelineTestEnv, path, content string) string {
	t.Helper()
	created := env.upload(t, http.MethodPost, path, "style.md", []byte(content), map[string]string{"mandatory": "true"})
	require.Equal(t, http.StatusAccepted, created.Code, created.Body.String())
	doc := decodeGuidelineDocument(t, created)
	_, err := env.scope.Pool.Exec(t.Context(), `update guideline_documents set status = 'ready', content = $2 where id = $1`, doc.ID, content)
	require.NoError(t, err)
	return doc.ID
}

func seedReadyProjectGuideline(t *testing.T, env *guidelineTestEnv, projectID, content string) string {
	t.Helper()
	docID := seedReadyGuideline(t, env, env.scope.OrgPath("/guidelines/documents"), content)
	attached := env.json(http.MethodPost, env.scope.OrgPath("/guidelines/documents/"+docID+"/projects"), `{"projectId":"`+projectID+`"}`)
	require.Equal(t, http.StatusOK, attached.Code, attached.Body.String())
	return docID
}

func TestGuidelineCheckReturnsClassifierFindings(t *testing.T) {
	env := newGuidelineTestEnv(t, "admin")
	docID := seedReadyGuideline(t, env, env.scope.OrgPath("/guidelines/documents"), "Address readers formally with vous.")
	classifier := &fixedGuidelineClassifier{fill: 0.91}
	explainer := &fixedGuidelineModel{output: `{"findings":[{"segmentId":"s1","field":"target","severity":"error","quote":"tu","message":"Use the formal vous.","suggestion":"vous","passage":"P1"}]}`}
	meter := &recordingGuidelineMeter{allowed: true, tokenAllow: true}
	withGuidelineCheck(env, classifier, explainer, meter)

	rec := env.json(http.MethodPost, env.scope.OrgPath("/guidelines/check"),
		`{"sourceLocale":"en","targetLocale":"fr-FR","segments":[{"id":"s1","source":"Can you help?","target":"Peux-tu aider ?"}],"checks":["target"]}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var result check.Result
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &result))
	require.Len(t, result.Findings, 1)
	finding := result.Findings[0]
	require.Equal(t, "s1", finding.SegmentID)
	require.Equal(t, 0, finding.Start)
	require.True(t, finding.ReasoningAvailable)
	require.Equal(t, check.ClassifierFindingMessage, finding.Message)
	require.Empty(t, finding.Suggestion)
	require.Len(t, result.Passages, 1)
	require.Equal(t, finding.PassageID, result.Passages[0].ID)
	require.Equal(t, guidelinepg.UploadedDocumentID(docID), result.Passages[0].DocumentID)
	require.Equal(t, "typesafe-ai/jev", result.Model)
	require.False(t, result.SearchAvailable)
	require.Zero(t, explainer.calls)

	require.Len(t, meter.checks, 1)
	require.Equal(t, autumn.GuidelineChecks, meter.checks[0].FeatureID)
	require.Equal(t, 1.0, *meter.checks[0].RequiredBalance)
	require.Len(t, meter.tracks, 1)
	require.Equal(t, env.scope.OrganizationID, meter.tracks[0].CustomerID)
	require.Equal(t, 1.0, meter.tracks[0].Value)
	require.Empty(t, meter.tokens)
}

func TestGuidelineCheckReusesCachedClassifierOutput(t *testing.T) {
	env := newGuidelineTestEnv(t, "admin")
	require.NotNil(t, env.scope.Valkey)
	seedReadyGuideline(t, env, env.scope.OrgPath("/guidelines/documents"), "Address readers formally with vous.")
	classifier := &fixedGuidelineClassifier{fill: 0.91}
	meter := &recordingGuidelineMeter{allowed: true}
	retriever := guidelines.NewService(guidelinepg.NewWithPool(env.scope.Pool), nil)
	env.handler.guidelineCheck = &guidelineCheckAPI{
		knowledge: env.handler.knowledgeMemories,
		checker:   check.New(retriever, classifier, nil, check.WithCache(env.scope.Valkey)),
		meter:     meter,
	}
	body := `{"sourceLocale":"en","targetLocale":"fr-FR","segments":[{"id":"s1","source":"Can you help?","target":"Peux-tu aider ?"}],"checks":["target"]}`
	path := env.scope.OrgPath("/guidelines/check")

	first := env.json(http.MethodPost, path, body)
	require.Equal(t, http.StatusOK, first.Code, first.Body.String())
	second := env.json(http.MethodPost, path, body)
	require.Equal(t, http.StatusOK, second.Code, second.Body.String())
	require.JSONEq(t, first.Body.String(), second.Body.String())

	var result check.Result
	require.NoError(t, json.Unmarshal(second.Body.Bytes(), &result))
	require.Len(t, result.Findings, 1)
	require.Equal(t, 1, classifier.calls)
	require.Len(t, meter.checks, 1)
	require.Len(t, meter.tracks, 1)
}

func TestGuidelineCheckValidationAndLimits(t *testing.T) {
	env := newGuidelineTestEnv(t, "member")
	path := env.scope.OrgPath("/guidelines/check")
	valid := `{"segments":[{"id":"s1","target":"Bonjour"}]}`

	env.handler.guidelineCheck = &guidelineCheckAPI{knowledge: env.handler.knowledgeMemories}
	unavailable := env.json(http.MethodPost, path, valid)
	require.Equal(t, http.StatusServiceUnavailable, unavailable.Code, unavailable.Body.String())

	classifier := &fixedGuidelineClassifier{fill: 0.05}
	meter := &recordingGuidelineMeter{allowed: false}
	withGuidelineCheck(env, classifier, nil, meter)

	for name, body := range map[string]string{
		"empty":          `{"segments":[]}`,
		"duplicate":      `{"segments":[{"id":"a","target":"x"},{"id":"a","target":"y"}]}`,
		"bad locale":     `{"targetLocale":"not a locale!","segments":[{"id":"s1","target":"x"}]}`,
		"unknown check":  `{"segments":[{"id":"s1","target":"x"}],"checks":["style"]}`,
		"malformed json": `{"segments":`,
	} {
		rec := env.json(http.MethodPost, path, body)
		require.Equal(t, http.StatusBadRequest, rec.Code, name+": "+rec.Body.String())
		require.Contains(t, rec.Body.String(), "invalid_guideline_check", name)
	}

	// No passages means the classifier is not called, so an empty balance is not a refusal.
	unlimited := env.json(http.MethodPost, path, valid)
	require.Equal(t, http.StatusOK, unlimited.Code, unlimited.Body.String())
	require.Contains(t, unlimited.Body.String(), `"findings":[]`)
	require.Zero(t, classifier.calls)
	require.Empty(t, meter.checks)
	require.Empty(t, meter.tracks)

	seedReadyGuideline(t, env.asRole("admin"), env.scope.OrgPath("/guidelines/documents"), "Address readers formally with vous.")
	limited := env.json(http.MethodPost, path, valid)
	require.Equal(t, http.StatusPaymentRequired, limited.Code, limited.Body.String())
	require.Contains(t, limited.Body.String(), "guideline_check_limit_reached")
	require.Zero(t, classifier.calls)
	require.Len(t, meter.checks, 1)
	require.Empty(t, meter.tracks)

	meter.checkErr = errors.New("autumn down")
	failed := env.json(http.MethodPost, path, valid)
	require.Equal(t, http.StatusServiceUnavailable, failed.Code, failed.Body.String())
	require.Zero(t, classifier.calls)
	require.Empty(t, meter.tracks)

	// Members can run checks once usage allows it.
	meter.checkErr, meter.allowed = nil, true
	ok := env.json(http.MethodPost, path, valid)
	require.Equal(t, http.StatusOK, ok.Code, ok.Body.String())
	require.Contains(t, ok.Body.String(), `"findings":[]`)
	require.Equal(t, 1, classifier.calls)
	require.Len(t, meter.tracks, 1)
}

func TestGuidelineCheckRejectsClassifierErrors(t *testing.T) {
	env := newGuidelineTestEnv(t, "admin")
	seedReadyGuideline(t, env, env.scope.OrgPath("/guidelines/documents"), "Address readers formally with vous.")
	classifier := &fixedGuidelineClassifier{fill: 0.91, err: errors.New("gateway down")}
	meter := &recordingGuidelineMeter{allowed: true}
	withGuidelineCheck(env, classifier, nil, meter)

	rec := env.json(http.MethodPost, env.scope.OrgPath("/guidelines/check"),
		`{"segments":[{"id":"s1","target":"Peux-tu aider ?"}]}`)
	require.Equal(t, http.StatusBadGateway, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "guideline_check_failed")
	require.Equal(t, 1, classifier.calls)
	require.Empty(t, meter.tracks)
}

func TestGuidelineExplainReturnsGroundedFindings(t *testing.T) {
	env := newGuidelineTestEnv(t, "admin")
	seedReadyGuideline(t, env, env.scope.OrgPath("/guidelines/documents"), "Address readers formally with vous.")
	classifier := &fixedGuidelineClassifier{fill: 0.91}
	explainer := &fixedGuidelineModel{output: `{"findings":[
		{"segmentId":"s1","field":"target","severity":"error","quote":"tu","message":"Use the formal vous.","suggestion":"vous","passage":"P1"}
	]}`, inputTokens: 40}
	meter := &recordingGuidelineMeter{allowed: true, tokenAllow: true}
	withGuidelineCheck(env, classifier, explainer, meter)

	rec := env.json(http.MethodPost, env.scope.OrgPath("/guidelines/explain"),
		`{"sourceLocale":"en","targetLocale":"fr-FR","segments":[{"id":"s1","source":"Can you help?","target":"Peux-tu aider ?"}],"checks":["target"]}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var result check.Result
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &result))
	require.Len(t, result.Findings, 1)
	require.Equal(t, "Use the formal vous.", result.Findings[0].Message)
	require.Equal(t, "vous", result.Findings[0].Suggestion)
	require.Equal(t, 5, result.Findings[0].Start)
	require.Equal(t, 7, result.Findings[0].End)
	require.False(t, result.Findings[0].ReasoningAvailable)
	require.Equal(t, "test-model", result.Model)
	require.Zero(t, classifier.calls)
	require.Equal(t, 1, explainer.calls)
	require.Len(t, meter.tokens, 1)
	require.Equal(t, autumn.AITokens, meter.tokens[0].FeatureID)
	require.Equal(t, "test-model", meter.tokens[0].ModelID)
	require.Equal(t, 40, meter.tokens[0].InputTokens)
	require.Equal(t, 8, meter.tokens[0].OutputTokens)
	require.Empty(t, meter.tracks)
}

func TestGuidelineExplainRejectsUnreadableOutputAndCreditExhaustion(t *testing.T) {
	env := newGuidelineTestEnv(t, "admin")
	seedReadyGuideline(t, env, env.scope.OrgPath("/guidelines/documents"), "Address readers formally with vous.")
	explainer := &fixedGuidelineModel{output: "not json"}
	meter := &recordingGuidelineMeter{allowed: true, tokenAllow: true}
	withGuidelineCheck(env, &fixedGuidelineClassifier{fill: 0.91}, explainer, meter)

	rec := env.json(http.MethodPost, env.scope.OrgPath("/guidelines/explain"),
		`{"segments":[{"id":"s1","target":"Peux-tu aider ?"}]}`)
	require.Equal(t, http.StatusBadGateway, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "guideline_check_failed")
	require.Equal(t, 1, explainer.calls)
	require.Empty(t, meter.tokens)

	meter.tokenAllow = false
	explainer.calls = 0
	denied := env.json(http.MethodPost, env.scope.OrgPath("/guidelines/explain"),
		`{"segments":[{"id":"s1","target":"Peux-tu aider ?"}]}`)
	require.Equal(t, http.StatusPaymentRequired, denied.Code, denied.Body.String())
	require.Contains(t, denied.Body.String(), "ai_credit_exhausted")
	require.Zero(t, explainer.calls)
}

func TestGuidelineCheckWriteDeadlineExceedsWork(t *testing.T) {
	require.Greater(t, guidelineCheckTimeout+guidelineCheckWriteSlack, serverWriteTimeout)
	require.GreaterOrEqual(t, guidelineCheckWriteSlack, 5*time.Second)
}

func TestGuidelineCheckWriteDeadlineReachesConnection(t *testing.T) {
	inner := &writeDeadlineRecorder{}
	wrapped := &statusRecorder{ResponseWriter: &statusRecorder{ResponseWriter: inner}}
	started := time.Now()

	setGuidelineCheckWriteDeadline(wrapped)

	require.False(t, inner.deadline.IsZero())
	require.GreaterOrEqual(t, inner.deadline.Sub(started), guidelineCheckTimeout+guidelineCheckWriteSlack-time.Second)
}

func TestGuidelineCheckInternalRouteAutoExplainsFlaggedSegments(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	env := newGuidelineTestEnv(t, "admin")
	projectID := env.scope.MustProject(t, "", "Project")
	seedReadyProjectGuideline(t, env, projectID, "Never translate Acme.")
	classifier := &fixedGuidelineClassifier{fill: 0.91}
	explainer := &fixedGuidelineModel{output: `{"findings":[{"segmentId":"s1","field":"target","severity":"warning","quote":"Akme","message":"Keep Acme.","suggestion":"Acme","passage":"P1"}]}`, inputTokens: 12}
	meter := &recordingGuidelineMeter{allowed: true, tokenAllow: true}
	withGuidelineCheck(env, classifier, explainer, meter)

	internal := func(path, body string, authenticated bool) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if authenticated {
			req.Header.Set(serverCallTokenHeader, serverCallToken())
		}
		rec := httptest.NewRecorder()
		mux := http.NewServeMux()
		registerRoutes(mux, env.handler, stubSessionVerifier{})
		mux.ServeHTTP(rec, req)
		return rec
	}
	body := `{"organizationId":"` + env.scope.OrganizationID + `","projectId":"` + projectID + `","segments":[{"id":"s1","target":"Akme"}]}`

	require.Equal(t, http.StatusUnauthorized, internal("/internal/guidelines/check", body, false).Code)

	ok := internal("/internal/guidelines/check", body, true)
	require.Equal(t, http.StatusOK, ok.Code, ok.Body.String())
	require.Contains(t, ok.Body.String(), `"message":"Keep Acme."`)
	require.Equal(t, 1, classifier.calls)
	require.Equal(t, 1, explainer.calls)
	require.Len(t, meter.tracks, 1)
	require.Equal(t, env.scope.OrganizationID, meter.tracks[0].CustomerID)
	require.Len(t, meter.tokens, 1)
	require.Equal(t, autumn.AITokens, meter.tokens[0].FeatureID)

	clean := &fixedGuidelineClassifier{fill: 0.05}
	withGuidelineCheck(env, clean, explainer, meter)
	explainer.calls = 0
	cleanOK := internal("/internal/guidelines/check", body, true)
	require.Equal(t, http.StatusOK, cleanOK.Code, cleanOK.Body.String())
	require.Contains(t, cleanOK.Body.String(), `"findings":[]`)
	require.Zero(t, explainer.calls)

	other := newGuidelineTestEnv(t, "admin")
	foreign := internal("/internal/guidelines/check", `{"organizationId":"`+other.scope.OrganizationID+`","projectId":"`+projectID+`","segments":[{"id":"s1","target":"Akme"}]}`, true)
	require.Equal(t, http.StatusNotFound, foreign.Code, foreign.Body.String())

	invalid := internal("/internal/guidelines/check", `{"organizationId":"nope","segments":[{"id":"s1","target":"Akme"}]}`, true)
	require.Equal(t, http.StatusBadRequest, invalid.Code, invalid.Body.String())

	explained := internal("/internal/guidelines/explain", body, true)
	require.Equal(t, http.StatusOK, explained.Code, explained.Body.String())
	require.Contains(t, explained.Body.String(), `"message":"Keep Acme."`)
}

func TestGuidelineCheckInternalKeepsClassifierFindingsWhenExplainFails(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	env := newGuidelineTestEnv(t, "admin")
	projectID := env.scope.MustProject(t, "", "Project")
	seedReadyProjectGuideline(t, env, projectID, "Never translate Acme.")
	classifier := &fixedGuidelineClassifier{fill: 0.91}
	explainer := &fixedGuidelineModel{output: "not json"}
	meter := &recordingGuidelineMeter{allowed: true, tokenAllow: true}
	withGuidelineCheck(env, classifier, explainer, meter)

	req := httptest.NewRequest(http.MethodPost, "/internal/guidelines/check", strings.NewReader(`{"organizationId":"`+env.scope.OrganizationID+`","projectId":"`+projectID+`","segments":[{"id":"s1","target":"Akme"}]}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	rec := httptest.NewRecorder()
	mux := http.NewServeMux()
	registerRoutes(mux, env.handler, stubSessionVerifier{})
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), check.ClassifierFindingMessage)
	require.Contains(t, rec.Body.String(), `"reasoningAvailable":true`)
	require.Equal(t, 1, explainer.calls)
}

func TestGuidelineCheckInternalSkipsExplainWhenDisabled(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	env := newGuidelineTestEnv(t, "admin")
	projectID := env.scope.MustProject(t, "", "Project")
	seedReadyProjectGuideline(t, env, projectID, "Never translate Acme.")
	classifier := &fixedGuidelineClassifier{fill: 0.91}
	explainer := &fixedGuidelineModel{output: `{"findings":[{"segmentId":"s1","field":"target","severity":"warning","quote":"Akme","message":"Keep Acme.","suggestion":"Acme","passage":"P1"}]}`, inputTokens: 12}
	meter := &recordingGuidelineMeter{allowed: true, tokenAllow: true}
	withGuidelineCheck(env, classifier, explainer, meter)

	req := httptest.NewRequest(http.MethodPost, "/internal/guidelines/check", strings.NewReader(`{"organizationId":"`+env.scope.OrganizationID+`","projectId":"`+projectID+`","autoExplain":false,"segments":[{"id":"s1","target":"Akme"}]}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	rec := httptest.NewRecorder()
	mux := http.NewServeMux()
	registerRoutes(mux, env.handler, stubSessionVerifier{})
	mux.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), check.ClassifierFindingMessage)
	require.Contains(t, rec.Body.String(), `"reasoningAvailable":true`)
	require.NotContains(t, rec.Body.String(), "Keep Acme.")
	require.Equal(t, 1, classifier.calls)
	require.Zero(t, explainer.calls)
	require.Empty(t, meter.tokens)
}

func TestGuidelineCheckProjectScope(t *testing.T) {
	env := newGuidelineTestEnv(t, "admin")
	projectID := env.scope.MustProject(t, "", "Project")
	otherProjectID := env.scope.MustProject(t, "project_other_"+env.scope.Slug, "Other")
	seedReadyProjectGuideline(t, env, projectID, "Never translate Acme.")
	classifier := &fixedGuidelineClassifier{fill: 0.91}
	withGuidelineCheck(env, classifier, nil, nil)
	path := env.scope.OrgPath("/guidelines/check")

	// An empty project scope includes every org document.
	workspace := env.json(http.MethodPost, path, `{"segments":[{"id":"s1","target":"Akme"}]}`)
	require.Equal(t, http.StatusOK, workspace.Code, workspace.Body.String())
	require.Contains(t, workspace.Body.String(), check.ClassifierFindingMessage)
	require.Equal(t, 1, classifier.calls)

	scoped := env.json(http.MethodPost, path, `{"projectId":"`+projectID+`","segments":[{"id":"s1","target":"Akme"}]}`)
	require.Equal(t, http.StatusOK, scoped.Code, scoped.Body.String())
	require.Contains(t, scoped.Body.String(), check.ClassifierFindingMessage)

	// A non-global document assigned to one project does not apply to another.
	otherProject := env.json(http.MethodPost, path, `{"projectId":"`+otherProjectID+`","segments":[{"id":"s1","target":"Akme"}]}`)
	require.Equal(t, http.StatusOK, otherProject.Code, otherProject.Body.String())
	require.Contains(t, otherProject.Body.String(), `"findings":[]`)
	require.Equal(t, 2, classifier.calls)

	other := newGuidelineTestEnv(t, "admin")
	withGuidelineCheck(other, classifier, nil, nil)
	foreign := other.json(http.MethodPost, other.scope.OrgPath("/guidelines/check"), `{"projectId":"`+projectID+`","segments":[{"id":"s1","target":"Akme"}]}`)
	require.Equal(t, http.StatusNotFound, foreign.Code, foreign.Body.String())
}
