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
	require.Equal(t, 1, cache.setCount())

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
	require.GreaterOrEqual(t, cache.setCount(), 2)
}

func TestBatchCheckPersistsPerSegmentCache(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.")
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}, SearchAvailable: true}}
	model := &fakeModel{output: `{"findings":[{"segmentId":"a","field":"target","severity":"error","quote":"tu","message":"Use vous.","suggestion":"vous","passage":"P1"}]}`}
	cache := &memoryGuidelineCache{}
	checker := New(retriever, model, WithCache(cache))
	scope := guidelines.Scope{OrganizationID: "org", Locale: "fr-FR"}
	batch := Request{
		TargetLocale: "fr-FR",
		Checks:       []Field{FieldTarget},
		Segments: []Segment{
			{ID: "a", Source: "Hi", Target: "Peux-tu aider ?"},
			{ID: "b", Source: "Bye", Target: "Au revoir"},
		},
	}

	result, err := checker.CheckBeforeModel(context.Background(), scope, batch, nil)
	require.NoError(t, err)
	require.Equal(t, 1, model.calls)
	require.Len(t, result.Findings, 1)

	for _, segment := range batch.Segments {
		cached, err := checker.CheckBeforeModel(context.Background(), scope, Request{
			TargetLocale: "fr-FR",
			Checks:       []Field{FieldTarget},
			Segments:     []Segment{segment},
		}, func(context.Context, float64) error {
			t.Fatal("cached segment must not bill")
			return nil
		})
		require.NoError(t, err)
		require.True(t, cached.Cached)
		require.False(t, cached.ModelInvoked)
	}
	require.Equal(t, 1, model.calls)
}

func TestBatchMeterLimitReturnsPartial(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.")
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}, SearchAvailable: true}}
	cache := &memoryGuidelineCache{}
	checker := New(retriever, &fakeModel{output: groundedOutput()}, WithCache(cache))
	scope := guidelines.Scope{OrganizationID: "org", Locale: "fr-FR"}

	// Segment a is already in cache; segment b would need the model.
	_, err := checker.CheckBeforeModel(context.Background(), scope, Request{
		TargetLocale: "fr-FR",
		Checks:       []Field{FieldTarget},
		Segments:     []Segment{{ID: "a", Source: "Hi", Target: "Peux-tu aider ?"}},
	}, nil)
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

func TestModelJSONForSegmentCacheRejectsUnknownPassage(t *testing.T) {
	raw, ok := modelJSONForSegmentCache(
		Segment{ID: "a", Source: "Hi", Target: "Peux-tu aider ?"},
		[]Passage{{ID: "p1", DocumentID: "d1", Text: "Use vous"}},
		[]Finding{{
			SegmentID: "a", Field: FieldTarget, Severity: "error",
			Start: 6, End: 8, Message: "Use vous", PassageID: "missing",
		}},
	)
	require.False(t, ok)
	require.Empty(t, raw)
}

func TestStoreSegmentCacheDoesNotWriteEmptyWhenRemapFails(t *testing.T) {
	cache := &memoryGuidelineCache{}
	checker := New(&fakeRetriever{}, &fakeModel{}, WithCache(cache))
	checker.storeSegmentCache(
		context.Background(),
		guidelines.Scope{OrganizationID: "org", Locale: "fr-FR"},
		Request{TargetLocale: "fr-FR", Checks: []Field{FieldTarget}},
		Segment{ID: "a", Source: "Hi", Target: "Peux-tu aider ?"},
		[]Passage{{ID: "p1", DocumentID: "d1", Text: "Use vous"}},
		[]Finding{{
			SegmentID: "a", Field: FieldTarget, Severity: "error",
			Start: 6, End: 8, Message: "Use vous", PassageID: "other",
		}},
	)
	require.Zero(t, cache.setCount())
}
