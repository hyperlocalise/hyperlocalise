package check

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/stretchr/testify/require"
)

type memoryGuidelineCache struct {
	values map[string]string
	getErr error
	setErr error
	sets   int
	ttl    time.Duration
}

func (m *memoryGuidelineCache) Get(_ context.Context, key string) (string, error) {
	if m.getErr != nil {
		return "", m.getErr
	}
	value, ok := m.values[key]
	if !ok {
		return "", errors.New("miss")
	}
	return value, nil
}

func (m *memoryGuidelineCache) Set(_ context.Context, key, value string, ttl time.Duration) error {
	m.sets++
	m.ttl = ttl
	if m.setErr != nil {
		return m.setErr
	}
	if m.values == nil {
		m.values = map[string]string{}
	}
	m.values[key] = value
	return nil
}

func groundedOutput() string {
	return `{"findings":[{"segmentId":"s1","field":"target","severity":"error","quote":"tu","message":"Use vous.","suggestion":"vous","passage":"P1"}]}`
}

func cacheCheckRequest(target, locale string) Request {
	return Request{
		TargetLocale: locale,
		Checks:       []Field{FieldTarget},
		Segments:     []Segment{{ID: "s1", Source: "Can you help?", Target: target}},
	}
}

func TestCheckReusesCachedClassifierOutput(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.")
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}, SearchAvailable: true}}
	classifier := violateAll()
	cache := &memoryGuidelineCache{}
	hooks := 0
	scope := guidelines.Scope{OrganizationID: "org", Locale: "fr-FR"}
	req := cacheCheckRequest("Peux-tu aider ?", "fr-FR")
	checker := New(retriever, classifier, nil, WithCache(cache))

	first, err := checker.CheckBeforeModel(context.Background(), scope, req, func(context.Context) error {
		hooks++
		return nil
	})
	require.NoError(t, err)
	require.False(t, first.Cached)
	require.True(t, first.ModelInvoked)
	require.Len(t, first.Findings, 1)
	require.True(t, first.Findings[0].ReasoningAvailable)
	require.Equal(t, 1, hooks)
	require.Equal(t, 1, cache.sets)
	require.Equal(t, cacheTTL, cache.ttl)

	second, err := checker.CheckBeforeModel(context.Background(), scope, req, func(context.Context) error {
		hooks++
		return nil
	})
	require.NoError(t, err)
	require.True(t, second.Cached)
	require.False(t, second.ModelInvoked)
	require.Equal(t, first.Findings, second.Findings)
	require.Equal(t, 1, classifier.calls)
	require.Equal(t, 1, hooks)
	require.Equal(t, 1, cache.sets)
}

func TestCheckCacheMissesWhenTheStateChanges(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.")
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}}}
	classifier := violateAll()
	checker := New(retriever, classifier, nil, WithCache(&memoryGuidelineCache{}))
	scope := guidelines.Scope{OrganizationID: "org"}
	req := cacheCheckRequest("Peux-tu aider ?", "fr-FR")

	_, err := checker.Check(context.Background(), scope, req)
	require.NoError(t, err)

	revised := note
	revised.RevisionID = "r2"
	revised.Content = "Use vous, never tu. Keep product names in English."
	retriever.result.Mandatory = []guidelines.Document{revised}
	_, err = checker.Check(context.Background(), scope, req)
	require.NoError(t, err)

	retriever.result.Mandatory = []guidelines.Document{note}
	_, err = checker.Check(context.Background(), scope, cacheCheckRequest("Peux-tu aider encore ?", "fr-FR"))
	require.NoError(t, err)
	_, err = checker.Check(context.Background(), scope, cacheCheckRequest("Peux-tu aider ?", "fr-CA"))
	require.NoError(t, err)
	_, err = checker.Check(context.Background(), guidelines.Scope{OrganizationID: "other-org"}, req)
	require.NoError(t, err)

	require.Equal(t, 5, classifier.calls)
}

func TestCheckFallsBackWhenCachedClassifierOutputIsUnreadable(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.")
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}}}
	classifier := violateAll()
	cache := &memoryGuidelineCache{values: map[string]string{}}
	req := cacheCheckRequest("Peux-tu aider ?", "fr-FR")
	scope := guidelines.Scope{OrganizationID: "org"}
	passages, _, err := promptPassages(retriever.result, maxClassifyPassageRunes)
	require.NoError(t, err)
	state := buildClassifyState(req, passages)
	cache.values[classifyCacheKey(scope.OrganizationID, classifier.Name(), state)] = "not json"

	result, err := New(retriever, classifier, nil, WithCache(cache)).Check(context.Background(), scope, req)
	require.NoError(t, err)
	require.False(t, result.Cached)
	require.True(t, result.ModelInvoked)
	require.Len(t, result.Findings, 1)
	require.Equal(t, 1, classifier.calls)
	_, ok := decodeClassifyCache(cache.values[classifyCacheKey(scope.OrganizationID, classifier.Name(), state)])
	require.True(t, ok)
}

func TestCheckCacheErrorsStillReturnFindings(t *testing.T) {
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{mandatoryDoc("workspace:org", "Use vous, never tu.")}}}
	classifier := violateAll()
	scope := guidelines.Scope{OrganizationID: "org"}
	req := cacheCheckRequest("Peux-tu aider ?", "fr-FR")

	getFailed := &memoryGuidelineCache{getErr: errors.New("valkey down")}
	result, err := New(retriever, classifier, nil, WithCache(getFailed)).Check(context.Background(), scope, req)
	require.NoError(t, err)
	require.False(t, result.Cached)
	require.True(t, result.ModelInvoked)
	require.Equal(t, 1, classifier.calls)

	classifier.calls = 0
	setFailed := &memoryGuidelineCache{setErr: errors.New("valkey down")}
	result, err = New(retriever, classifier, nil, WithCache(setFailed)).Check(context.Background(), scope, req)
	require.NoError(t, err)
	require.Len(t, result.Findings, 1)
	require.Equal(t, 1, classifier.calls)
	require.Equal(t, 1, setFailed.sets)
}

func TestCheckWithoutCacheCallsTheClassifierEveryTime(t *testing.T) {
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{mandatoryDoc("workspace:org", "Use vous, never tu.")}}}
	classifier := violateAll()
	checker := New(retriever, classifier, nil, WithCache(nil))
	scope := guidelines.Scope{OrganizationID: "org"}
	req := cacheCheckRequest("Peux-tu aider ?", "fr-FR")

	first, err := checker.Check(context.Background(), scope, req)
	require.NoError(t, err)
	second, err := checker.Check(context.Background(), scope, req)
	require.NoError(t, err)
	require.False(t, first.Cached)
	require.False(t, second.Cached)
	require.Equal(t, 2, classifier.calls)
}

func TestCheckSkipsOversizedCachedOutput(t *testing.T) {
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{mandatoryDoc("workspace:org", "Rule.")}}}
	classifier := violateAll()
	cache := &memoryGuidelineCache{values: map[string]string{
		"ignored": strings.Repeat("a", maxCachedOutputBytes+1),
	}}
	req := cacheCheckRequest("Bonjour", "fr-FR")
	scope := guidelines.Scope{OrganizationID: "org"}
	passages, _, err := promptPassages(retriever.result, maxClassifyPassageRunes)
	require.NoError(t, err)
	cache.values[classifyCacheKey(scope.OrganizationID, classifier.Name(), buildClassifyState(req, passages))] = strings.Repeat("a", maxCachedOutputBytes+1)

	result, err := New(retriever, classifier, nil, WithCache(cache)).Check(context.Background(), scope, req)
	require.NoError(t, err)
	require.False(t, result.Cached)
	require.True(t, result.ModelInvoked)
	require.Equal(t, 1, classifier.calls)
	require.Len(t, result.Findings, 1)
}

func TestExplainReusesCachedModelOutput(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.")
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}, SearchAvailable: true}}
	model := &fakeModel{output: groundedOutput()}
	cache := &memoryGuidelineCache{}
	hooks := 0
	scope := guidelines.Scope{OrganizationID: "org", Locale: "fr-FR"}
	req := ExplainRequest{Request: cacheCheckRequest("Peux-tu aider ?", "fr-FR")}
	checker := New(retriever, nil, model, WithCache(cache))

	first, err := checker.ExplainBeforeModel(context.Background(), scope, req, func(context.Context) error {
		hooks++
		return nil
	})
	require.NoError(t, err)
	require.False(t, first.Cached)
	require.True(t, first.ModelInvoked)
	require.Len(t, first.Findings, 1)
	require.False(t, first.Findings[0].ReasoningAvailable)
	require.Equal(t, 1, hooks)
	require.Equal(t, 1, cache.sets)

	second, err := checker.ExplainBeforeModel(context.Background(), scope, req, func(context.Context) error {
		hooks++
		return nil
	})
	require.NoError(t, err)
	require.True(t, second.Cached)
	require.False(t, second.ModelInvoked)
	require.Equal(t, first.Findings, second.Findings)
	require.Equal(t, 1, model.calls)
	require.Equal(t, 1, hooks)
}

func TestExplainDoesNotCacheUnreadableModelOutput(t *testing.T) {
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{mandatoryDoc("workspace:org", "Rule.")}}}
	model := &fakeModel{output: "not json"}
	cache := &memoryGuidelineCache{}
	_, err := New(retriever, nil, model, WithCache(cache)).Explain(context.Background(), guidelines.Scope{OrganizationID: "org"}, ExplainRequest{Request: cacheCheckRequest("Bonjour", "fr-FR")})
	require.ErrorIs(t, err, ErrUnreadableOutput)
	require.Zero(t, cache.sets)
}

func TestExplainFallsBackWhenCachedOutputFailsGrounding(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.")
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}}}
	model := &fakeModel{output: groundedOutput()}
	cache := &memoryGuidelineCache{values: map[string]string{}}
	req := ExplainRequest{Request: cacheCheckRequest("Peux-tu aider ?", "fr-FR")}
	scope := guidelines.Scope{OrganizationID: "org"}
	passages, _, err := promptPassages(retriever.result, maxPassageRunes)
	require.NoError(t, err)
	cache.values[explainCacheKey(scope.OrganizationID, model.Name(), userPrompt(req.Request, passages))] = "not json"

	result, err := New(retriever, nil, model, WithCache(cache)).Explain(context.Background(), scope, req)
	require.NoError(t, err)
	require.False(t, result.Cached)
	require.True(t, result.ModelInvoked)
	require.Len(t, result.Findings, 1)
	require.Equal(t, 1, model.calls)
	require.Equal(t, groundedOutput(), cache.values[explainCacheKey(scope.OrganizationID, model.Name(), userPrompt(req.Request, passages))])
}

func TestExplainCacheMissesWhenPassageFilterChanges(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.\n\nKeep Acme in English.")
	noteChunks := guidelines.Chunks(note)
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}}}
	model := &fakeModel{output: `{"findings":[]}`}
	checker := New(retriever, nil, model, WithCache(&memoryGuidelineCache{}))
	scope := guidelines.Scope{OrganizationID: "org"}
	req := cacheCheckRequest("Peux-tu aider ?", "fr-FR")

	_, err := checker.Explain(context.Background(), scope, ExplainRequest{Request: req})
	require.NoError(t, err)
	_, err = checker.Explain(context.Background(), scope, ExplainRequest{Request: req, PassageIDs: []string{noteChunks[0].ID}})
	require.NoError(t, err)
	require.Equal(t, 2, model.calls)
}
