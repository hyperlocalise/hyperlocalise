package check

import (
	"context"
	"errors"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/stretchr/testify/require"
)

func TestExplainGroundsFindings(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.\n\nKeep Acme in English.")
	noteChunks := guidelines.Chunks(note)
	hit := guidelines.Chunk{ID: "hit-1", DocumentID: "doc:1", RevisionID: "r9", Text: "Dates use DD/MM/YYYY."}
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}, Passages: []guidelines.Chunk{noteChunks[0], hit}, SearchAvailable: true}}
	model := &fakeModel{output: `{"findings":[
		{"segmentId":"s1","field":"target","severity":"error","quote":"tu","message":"Use vous.","suggestion":"vous","passage":"P1"},
		{"segmentId":"s1","field":"target","severity":"error","quote":"tu","message":"Use vous.","suggestion":"vous","passage":"P1"},
		{"segmentId":"s2","field":"target","severity":"critical","quote":"03/12/2026","message":"Wrong date format.","suggestion":"","passage":"P3"},
		{"segmentId":"missing","field":"target","severity":"error","quote":"x","message":"Unknown segment.","suggestion":"","passage":"P1"},
		{"segmentId":"s1","field":"target","severity":"error","quote":"not in text","message":"Hallucinated quote.","suggestion":"","passage":"P1"},
		{"segmentId":"s1","field":"target","severity":"error","quote":"tu","message":"Uncited.","suggestion":"","passage":"P9"},
		{"segmentId":"s1","field":"source","severity":"error","quote":"you","message":"Source not requested.","suggestion":"","passage":"P1"}
	]}`, inputTokens: 40}
	result, err := New(retriever, nil, model).Explain(context.Background(), guidelines.Scope{OrganizationID: "org", Locale: "fr-FR"}, ExplainRequest{Request: Request{
		TargetLocale: "fr-FR",
		Checks:       []Field{FieldTarget},
		Segments: []Segment{
			{ID: "s1", Source: "Can you help?", Target: "Peux-tu 🙂 aider tu?"},
			{ID: "s2", Source: "Due 12/03/2026", Target: "Échéance 03/12/2026"},
		},
	}})
	require.NoError(t, err)
	require.True(t, result.SearchAvailable)
	require.Equal(t, "test-model", result.Model)
	require.Equal(t, 40, result.InputTokens)
	require.Equal(t, 12, result.OutputTokens)
	require.Contains(t, model.user, `<passage label="P1">`)
	require.Contains(t, model.user, `<passage label="P3">`)
	require.NotContains(t, model.user, `<passage label="P4">`, "duplicate mandatory chunk from search is not repeated")

	require.Len(t, result.Findings, 2)
	require.Equal(t, Finding{SegmentID: "s1", Field: FieldTarget, Severity: "error", Start: 5, End: 7, Message: "Use vous.", Suggestion: "vous", PassageID: noteChunks[0].ID}, result.Findings[0])
	require.Equal(t, "warning", result.Findings[1].Severity)
	require.Equal(t, "hit-1", result.Findings[1].PassageID)
	require.Equal(t, 9, result.Findings[1].Start)
	require.False(t, result.Findings[0].ReasoningAvailable)
	require.Equal(t, []Passage{
		{ID: noteChunks[0].ID, DocumentID: "workspace:org", Text: "Use vous, never tu."},
		{ID: "hit-1", DocumentID: "doc:1", Text: "Dates use DD/MM/YYYY."},
	}, result.Passages)
}

func TestExplainFiltersPassagesAndRejectsBadOutput(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.\n\nKeep Acme in English.")
	noteChunks := guidelines.Chunks(note)
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}}}
	model := &fakeModel{output: `{"findings":[]}`}
	result, err := New(retriever, nil, model).Explain(context.Background(), guidelines.Scope{OrganizationID: "org"}, ExplainRequest{
		Request:    Request{Segments: []Segment{{ID: "s1", Target: "Bonjour"}}},
		PassageIDs: []string{noteChunks[0].ID},
	})
	require.NoError(t, err)
	require.Equal(t, 1, model.calls)
	require.Contains(t, model.user, `<passage label="P1">`)
	require.NotContains(t, model.user, `<passage label="P2">`)
	require.Empty(t, result.Findings)

	for _, output := range []string{"", "not json", `{"findings":`} {
		model.output = output
		_, err = New(retriever, nil, model).Explain(context.Background(), guidelines.Scope{OrganizationID: "org"}, ExplainRequest{Request: Request{Segments: []Segment{{ID: "s1", Target: "Bonjour"}}}})
		require.ErrorIs(t, err, ErrUnreadableOutput, output)
	}

	model.err = errors.New("gateway down")
	model.output = `{"findings":[]}`
	_, err = New(retriever, nil, model).Explain(context.Background(), guidelines.Scope{OrganizationID: "org"}, ExplainRequest{Request: Request{Segments: []Segment{{ID: "s1", Target: "Bonjour"}}}})
	require.Error(t, err)
}

func TestExplainSkipsModelWithoutMatchingPassages(t *testing.T) {
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{mandatoryDoc("workspace:org", "Rule.")}}}
	model := &fakeModel{output: `{"findings":[]}`}
	result, err := New(retriever, nil, model).Explain(context.Background(), guidelines.Scope{OrganizationID: "org"}, ExplainRequest{
		Request:    Request{Segments: []Segment{{ID: "s1", Target: "Bonjour"}}},
		PassageIDs: []string{"missing"},
	})
	require.NoError(t, err)
	require.Zero(t, model.calls)
	require.Empty(t, result.Findings)

	result, err = New(&fakeRetriever{}, nil, model).Explain(context.Background(), guidelines.Scope{OrganizationID: "org"}, ExplainRequest{Request: Request{Segments: []Segment{{ID: "s1", Target: "Bonjour"}}}})
	require.NoError(t, err)
	require.Zero(t, model.calls)
	require.Empty(t, result.Findings)
}

func TestFilterPassages(t *testing.T) {
	passages := []Passage{{ID: "a"}, {ID: "b"}, {ID: "c"}}
	require.Equal(t, passages, filterPassages(passages, nil))
	require.Equal(t, passages, filterPassages(passages, []string{"", "  "}))
	require.Equal(t, []Passage{{ID: "b"}}, filterPassages(passages, []string{" b ", "missing"}))
}
