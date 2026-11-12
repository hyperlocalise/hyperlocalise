package check

import (
	"context"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/stretchr/testify/require"
)

func TestBatchCheckReusesPerSegmentCache(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.")
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}, SearchAvailable: true}}
	model := &fakeModel{output: groundedOutput()}
	cache := &memoryGuidelineCache{}
	checker := New(retriever, model, WithCache(cache))
	scope := guidelines.Scope{OrganizationID: "org", Locale: "fr-FR"}

	_, err := checker.CheckBeforeModel(context.Background(), scope, Request{
		TargetLocale: "fr-FR",
		Checks:       []Field{FieldTarget},
		Segments:     []Segment{{ID: "a", Source: "Hi", Target: "Peux-tu aider ?"}},
	}, nil)
	require.NoError(t, err)
	require.Equal(t, 1, model.calls)
	require.Equal(t, 1, cache.sets)

	_, err = checker.CheckBeforeModel(context.Background(), scope, Request{
		TargetLocale: "fr-FR",
		Checks:       []Field{FieldTarget},
		Segments: []Segment{
			{ID: "a", Source: "Hi", Target: "Peux-tu aider ?"},
			{ID: "b", Source: "Bye", Target: "Au revoir"},
		},
	}, func(context.Context, float64) error { return nil })
	require.NoError(t, err)
	require.Equal(t, 2, model.calls)
	require.GreaterOrEqual(t, cache.sets, 2)
}

func TestBatchMeterLimitReturnsPartial(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.")
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}, SearchAvailable: true}}
	cache := &memoryGuidelineCache{}
	checker := New(retriever, &fakeModel{output: groundedOutput()}, WithCache(cache))
	scope := guidelines.Scope{OrganizationID: "org", Locale: "fr-FR"}

	// Segment a is already in cache; segment b would need the model.
	_, err := checker.CheckBeforeModel(context.Background(), scope, cacheCheckRequest("Peux-tu aider ?", "fr-FR"), nil)
	require.NoError(t, err)

	result, err := checker.CheckBeforeModel(context.Background(), scope, Request{
		TargetLocale: "fr-FR",
		Checks:       []Field{FieldTarget},
		Segments: []Segment{
			{ID: "a", Source: "Hi", Target: "Peux-tu aider ?"},
			{ID: "b", Source: "Bye", Target: "Au revoir"},
		},
	}, func(context.Context, float64) error { return ErrMeterLimit })
	require.NoError(t, err)
	require.Equal(t, []string{"b"}, result.UncheckedSegmentIDs)
}
