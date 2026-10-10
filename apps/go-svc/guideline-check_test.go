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

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines/check"
	guidelinepg "github.com/hyperlocalise/hyperlocalise/internal/guidelines/postgres"
	"github.com/stretchr/testify/require"
)

type fixedGuidelineModel struct {
	output string
	calls  int
}

func (m *fixedGuidelineModel) Complete(context.Context, string, string) (string, error) {
	m.calls++
	return m.output, nil
}

func (m *fixedGuidelineModel) Name() string { return "test-model" }

type recordingGuidelineMeter struct {
	mu       sync.Mutex
	allowed  bool
	checkErr error
	checks   []autumn.CheckRequest
	tracks   []autumn.TrackRequest
}

func (m *recordingGuidelineMeter) Check(_ context.Context, req autumn.CheckRequest) (autumn.CheckResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.checks = append(m.checks, req)
	return autumn.CheckResponse{Allowed: m.allowed}, m.checkErr
}

func (m *recordingGuidelineMeter) Track(_ context.Context, req autumn.TrackRequest) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tracks = append(m.tracks, req)
	return nil
}

func withGuidelineCheck(env *guidelineTestEnv, model check.Model, meter guidelineCheckMeter) {
	retriever := guidelines.NewService(guidelinepg.NewWithPool(env.scope.Pool), nil)
	env.handler.guidelineCheck = &guidelineCheckAPI{knowledge: env.handler.knowledgeMemories, checker: check.New(retriever, model), meter: meter}
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

func TestGuidelineCheckReturnsGroundedFindings(t *testing.T) {
	env := newGuidelineTestEnv(t, "admin")
	docID := seedReadyGuideline(t, env, env.scope.OrgPath("/guidelines/documents"), "Address readers formally with vous.")
	model := &fixedGuidelineModel{output: `{"findings":[
		{"segmentId":"s1","field":"target","severity":"error","quote":"tu","message":"Use the formal vous.","suggestion":"vous","passage":"P1"},
		{"segmentId":"s1","field":"target","severity":"error","quote":"tu","message":"Uncited.","suggestion":"","passage":"P9"}
	]}`}
	meter := &recordingGuidelineMeter{allowed: true}
	withGuidelineCheck(env, model, meter)

	rec := env.json(http.MethodPost, env.scope.OrgPath("/guidelines/check"),
		`{"sourceLocale":"en","targetLocale":"fr-FR","segments":[{"id":"s1","source":"Can you help?","target":"Peux-tu aider ?"}],"checks":["target"]}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var result check.Result
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &result))
	require.Len(t, result.Findings, 1)
	finding := result.Findings[0]
	require.Equal(t, "s1", finding.SegmentID)
	require.Equal(t, 5, finding.Start)
	require.Equal(t, 7, finding.End)
	require.Len(t, result.Passages, 1)
	require.Equal(t, finding.PassageID, result.Passages[0].ID)
	require.Equal(t, guidelinepg.UploadedDocumentID(docID), result.Passages[0].DocumentID)
	require.False(t, result.SearchAvailable)

	require.Len(t, meter.checks, 1)
	require.Equal(t, guidelineCheckFeatureID, meter.checks[0].FeatureID)
	require.Equal(t, 1.0, *meter.checks[0].RequiredBalance)
	require.Len(t, meter.tracks, 1)
	require.Equal(t, env.scope.OrganizationID, meter.tracks[0].CustomerID)
	require.Equal(t, 1.0, meter.tracks[0].Value)
}

func TestGuidelineCheckValidationAndLimits(t *testing.T) {
	env := newGuidelineTestEnv(t, "member")
	path := env.scope.OrgPath("/guidelines/check")
	valid := `{"segments":[{"id":"s1","target":"Bonjour"}]}`

	env.handler.guidelineCheck = &guidelineCheckAPI{knowledge: env.handler.knowledgeMemories}
	unavailable := env.json(http.MethodPost, path, valid)
	require.Equal(t, http.StatusServiceUnavailable, unavailable.Code, unavailable.Body.String())

	model := &fixedGuidelineModel{output: `{"findings":[]}`}
	meter := &recordingGuidelineMeter{allowed: false}
	withGuidelineCheck(env, model, meter)

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

	limited := env.json(http.MethodPost, path, valid)
	require.Equal(t, http.StatusPaymentRequired, limited.Code, limited.Body.String())
	require.Contains(t, limited.Body.String(), "guideline_check_limit_reached")

	meter.checkErr = errors.New("autumn down")
	failed := env.json(http.MethodPost, path, valid)
	require.Equal(t, http.StatusServiceUnavailable, failed.Code, failed.Body.String())
	require.Zero(t, model.calls)
	require.Empty(t, meter.tracks)

	// Members can run checks once usage allows it; with no guidelines the model is skipped.
	meter.checkErr, meter.allowed = nil, true
	ok := env.json(http.MethodPost, path, valid)
	require.Equal(t, http.StatusOK, ok.Code, ok.Body.String())
	require.Contains(t, ok.Body.String(), `"findings":[]`)
	require.Zero(t, model.calls)
}

func TestGuidelineCheckInternalRoute(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	env := newGuidelineTestEnv(t, "admin")
	projectID := env.scope.MustProject(t, "", "Project")
	seedReadyGuideline(t, env, env.scope.OrgPath("/projects/"+projectID+"/guidelines/documents"), "Never translate Acme.")
	model := &fixedGuidelineModel{output: `{"findings":[{"segmentId":"s1","field":"target","severity":"warning","quote":"Akme","message":"Keep Acme.","suggestion":"Acme","passage":"P1"}]}`}
	meter := &recordingGuidelineMeter{allowed: true}
	withGuidelineCheck(env, model, meter)

	internal := func(body string, authenticated bool) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/internal/guidelines/check", strings.NewReader(body))
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

	require.Equal(t, http.StatusUnauthorized, internal(body, false).Code)

	ok := internal(body, true)
	require.Equal(t, http.StatusOK, ok.Code, ok.Body.String())
	require.Contains(t, ok.Body.String(), `"message":"Keep Acme."`)
	require.Len(t, meter.tracks, 1)
	require.Equal(t, env.scope.OrganizationID, meter.tracks[0].CustomerID)

	other := newGuidelineTestEnv(t, "admin")
	foreign := internal(`{"organizationId":"`+other.scope.OrganizationID+`","projectId":"`+projectID+`","segments":[{"id":"s1","target":"Akme"}]}`, true)
	require.Equal(t, http.StatusNotFound, foreign.Code, foreign.Body.String())

	invalid := internal(`{"organizationId":"nope","segments":[{"id":"s1","target":"Akme"}]}`, true)
	require.Equal(t, http.StatusBadRequest, invalid.Code, invalid.Body.String())
}

func TestGuidelineCheckProjectScope(t *testing.T) {
	env := newGuidelineTestEnv(t, "admin")
	projectID := env.scope.MustProject(t, "", "Project")
	seedReadyGuideline(t, env, env.scope.OrgPath("/projects/"+projectID+"/guidelines/documents"), "Never translate Acme.")
	model := &fixedGuidelineModel{output: `{"findings":[{"segmentId":"s1","field":"target","severity":"warning","quote":"Akme","message":"Keep Acme.","suggestion":"Acme","passage":"P1"}]}`}
	withGuidelineCheck(env, model, nil)
	path := env.scope.OrgPath("/guidelines/check")

	workspace := env.json(http.MethodPost, path, `{"segments":[{"id":"s1","target":"Akme"}]}`)
	require.Equal(t, http.StatusOK, workspace.Code, workspace.Body.String())
	require.Contains(t, workspace.Body.String(), `"findings":[]`)
	require.Zero(t, model.calls)

	scoped := env.json(http.MethodPost, path, `{"projectId":"`+projectID+`","segments":[{"id":"s1","target":"Akme"}]}`)
	require.Equal(t, http.StatusOK, scoped.Code, scoped.Body.String())
	require.Contains(t, scoped.Body.String(), `"message":"Keep Acme."`)

	other := newGuidelineTestEnv(t, "admin")
	withGuidelineCheck(other, model, nil)
	foreign := other.json(http.MethodPost, other.scope.OrgPath("/guidelines/check"), `{"projectId":"`+projectID+`","segments":[{"id":"s1","target":"Akme"}]}`)
	require.Equal(t, http.StatusNotFound, foreign.Code, foreign.Body.String())
}
