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

func TestCheckReusesCachedModelOutput(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.")
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}, SearchAvailable: true}}
	model := &fakeModel{output: groundedOutput()}
	cache := &memoryGuidelineCache{}
	hooks := 0
	scope := guidelines.Scope{OrganizationID: "org", Locale: "fr-FR"}
	req := cacheCheckRequest("Peux-tu aider ?", "fr-FR")
	checker := New(retriever, model, WithCache(cache))

	first, err := checker.CheckBeforeModel(context.Background(), scope, req, func(context.Context, float64) error {
		hooks++
		return nil
	})
	require.NoError(t, err)
	require.False(t, first.Cached)
	require.True(t, first.ModelInvoked)
	require.Len(t, first.Findings, 1)
	require.Equal(t, 1, hooks)
	require.Equal(t, 1, cache.sets)
	require.Equal(t, cacheTTL, cache.ttl)

	second, err := checker.CheckBeforeModel(context.Background(), scope, req, func(context.Context, float64) error {
		hooks++
		return nil
	})
	require.NoError(t, err)
	require.True(t, second.Cached)
	require.False(t, second.ModelInvoked)
	require.Equal(t, first.Findings, second.Findings)
	require.Equal(t, 1, model.calls)
	require.Equal(t, 1, hooks)
	require.Equal(t, 1, cache.sets)
}

func TestCheckCacheMissesWhenThePromptChanges(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.")
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}}}
	model := &fakeModel{output: groundedOutput()}
	checker := New(retriever, model, WithCache(&memoryGuidelineCache{}))
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

	require.Equal(t, 5, model.calls)
}

func TestCheckDoesNotCacheUnreadableModelOutput(t *testing.T) {
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{mandatoryDoc("workspace:org", "Rule.")}}}
	model := &fakeModel{output: "not json"}
	cache := &memoryGuidelineCache{}
	_, err := New(retriever, model, WithCache(cache)).Check(context.Background(), guidelines.Scope{OrganizationID: "org"}, cacheCheckRequest("Bonjour", "fr-FR"))
	require.ErrorIs(t, err, ErrUnreadableOutput)
	require.Zero(t, cache.sets)
}

func TestCheckFallsBackWhenCachedOutputFailsGrounding(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.")
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}}}
	model := &fakeModel{output: groundedOutput()}
	cache := &memoryGuidelineCache{values: map[string]string{}}
	req := cacheCheckRequest("Peux-tu aider ?", "fr-FR")
	scope := guidelines.Scope{OrganizationID: "org"}
	passages, err := promptPassages(retriever.result)
	require.NoError(t, err)
	cache.values[cacheKey(scope.OrganizationID, model.Name(), userPrompt(req, passages))] = "not json"

	result, err := New(retriever, model, WithCache(cache)).Check(context.Background(), scope, req)
	require.NoError(t, err)
	require.False(t, result.Cached)
	require.True(t, result.ModelInvoked)
	require.Len(t, result.Findings, 1)
	require.Equal(t, 1, model.calls)
	require.Equal(t, groundedOutput(), cache.values[cacheKey(scope.OrganizationID, model.Name(), userPrompt(req, passages))])
}

func TestCheckCacheErrorsStillReturnFindings(t *testing.T) {
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{mandatoryDoc("workspace:org", "Use vous, never tu.")}}}
	model := &fakeModel{output: groundedOutput()}
	scope := guidelines.Scope{OrganizationID: "org"}
	req := cacheCheckRequest("Peux-tu aider ?", "fr-FR")

	getFailed := &memoryGuidelineCache{getErr: errors.New("valkey down")}
	result, err := New(retriever, model, WithCache(getFailed)).Check(context.Background(), scope, req)
	require.NoError(t, err)
	require.False(t, result.Cached)
	require.True(t, result.ModelInvoked)
	require.Equal(t, 1, model.calls)

	model.calls = 0
	setFailed := &memoryGuidelineCache{setErr: errors.New("valkey down")}
	result, err = New(retriever, model, WithCache(setFailed)).Check(context.Background(), scope, req)
	require.NoError(t, err)
	require.Len(t, result.Findings, 1)
	require.Equal(t, 1, model.calls)
	require.Equal(t, 1, setFailed.sets)
}

func TestCheckWithoutCacheCallsTheModelEveryTime(t *testing.T) {
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{mandatoryDoc("workspace:org", "Use vous, never tu.")}}}
	model := &fakeModel{output: groundedOutput()}
	checker := New(retriever, model, WithCache(nil))
	scope := guidelines.Scope{OrganizationID: "org"}
	req := cacheCheckRequest("Peux-tu aider ?", "fr-FR")

	first, err := checker.Check(context.Background(), scope, req)
	require.NoError(t, err)
	second, err := checker.Check(context.Background(), scope, req)
	require.NoError(t, err)
	require.False(t, first.Cached)
	require.False(t, second.Cached)
	require.Equal(t, 2, model.calls)
}

func TestCheckSkipsOversizedCachedOutput(t *testing.T) {
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{mandatoryDoc("workspace:org", "Rule.")}}}
	model := &fakeModel{output: `{"findings":[{"segmentId":"s1","field":"target","severity":"warning","quote":"missing","message":"` + strings.Repeat("a", maxCachedOutputBytes) + `","suggestion":"","passage":"P1"}]}`}
	cache := &memoryGuidelineCache{}
	result, err := New(retriever, model, WithCache(cache)).Check(context.Background(), guidelines.Scope{OrganizationID: "org"}, cacheCheckRequest("Bonjour", "fr-FR"))
	require.NoError(t, err)
	require.Empty(t, result.Findings)
	require.Zero(t, cache.sets)
}
