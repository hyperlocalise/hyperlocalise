package check

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/stretchr/testify/require"
)

func TestFindingsFromProbabilitiesThresholds(t *testing.T) {
	req := Request{
		Checks:   []Field{FieldTarget},
		Segments: []Segment{{ID: "s1", Target: "Peux-tu aider ?"}},
	}
	passages := []Passage{{ID: "p1", DocumentID: "doc", Text: "Use vous."}}

	t.Run("violation", func(t *testing.T) {
		findings, cited := findingsFromProbabilities(context.Background(), req, passages, map[string]float64{"s1_P1": 0.75})
		require.Equal(t, []Finding{{
			SegmentID: "s1", Field: FieldTarget, Severity: "warning", Start: 0, End: utf16Len("Peux-tu aider ?"),
			Message: ClassifierFindingMessage, PassageID: "p1", ReasoningAvailable: true,
		}}, findings)
		require.Equal(t, passages, cited)
	})

	t.Run("uncertain", func(t *testing.T) {
		findings, cited := findingsFromProbabilities(context.Background(), req, passages, map[string]float64{"s1_P1": 0.4})
		require.Empty(t, findings)
		require.Empty(t, cited)
	})

	t.Run("clean", func(t *testing.T) {
		findings, cited := findingsFromProbabilities(context.Background(), req, passages, map[string]float64{"s1_P1": 0.399})
		require.Empty(t, findings)
		require.Empty(t, cited)
	})

	t.Run("unknown question", func(t *testing.T) {
		findings, _ := findingsFromProbabilities(context.Background(), req, passages, map[string]float64{"nope": 0.99, "s9_P1": 0.99, "s1_P9": 0.99})
		require.Empty(t, findings)
	})
}

func TestFindingFieldPrefersTargetThenSource(t *testing.T) {
	segment := Segment{ID: "s1", Source: "Hello", Target: "Bonjour"}
	field, text, ok := findingField(Request{Checks: []Field{FieldTarget, FieldSource}}, segment)
	require.True(t, ok)
	require.Equal(t, FieldTarget, field)
	require.Equal(t, "Bonjour", text)

	field, text, ok = findingField(Request{Checks: []Field{FieldSource}}, segment)
	require.True(t, ok)
	require.Equal(t, FieldSource, field)
	require.Equal(t, "Hello", text)

	_, _, ok = findingField(Request{Checks: []Field{FieldTarget}}, Segment{ID: "s1", Source: "Hello"})
	require.False(t, ok)
}

func TestParseClassifyQuestionID(t *testing.T) {
	segment, passage, ok := parseClassifyQuestionID("s2_P3")
	require.True(t, ok)
	require.Equal(t, 1, segment)
	require.Equal(t, 2, passage)
	_, _, ok = parseClassifyQuestionID("violates_P1")
	require.False(t, ok)
	_, _, ok = parseClassifyQuestionID("s0_P1")
	require.False(t, ok)
}

func TestFitClassifyStateDropsOptionalPassages(t *testing.T) {
	req := Request{Checks: []Field{FieldTarget}, Segments: []Segment{{ID: "s1", Target: "Hi"}}}
	mandatory := Passage{ID: "m", DocumentID: "d", Text: "short"}
	optional := make([]Passage, 0, 40)
	for i := 0; i < 40; i++ {
		optional = append(optional, Passage{ID: "o" + strings.Repeat("x", i+1), DocumentID: "d", Text: strings.Repeat("optional guideline text ", 200)})
	}
	passages := append([]Passage{mandatory}, optional...)
	fitted, state, err := fitClassifyState(req, passages, 1)
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(fitted), 1)
	require.Less(t, len(fitted), len(passages))
	require.Equal(t, "m", fitted[0].ID)
	raw, err := json.Marshal(state)
	require.NoError(t, err)
	require.LessOrEqual(t, len(raw), maxClassifyStateBytes)
}

func TestFitClassifyStateRejectsOversizedMandatory(t *testing.T) {
	req := Request{Checks: []Field{FieldTarget}, Segments: []Segment{{ID: "s1", Target: "Hi"}}}
	huge := Passage{ID: "m", DocumentID: "d", Text: strings.Repeat("a", maxClassifyStateBytes+1)}
	_, _, err := fitClassifyState(req, []Passage{huge}, 1)
	require.ErrorIs(t, err, ErrMandatoryPassagesOverBudget)
}

func TestCheckUsesSourceWhenTargetIsNotRequested(t *testing.T) {
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{mandatoryDoc("workspace:org", "Keep product names.")}}}
	classifier := violateAll()
	result, err := New(retriever, classifier, nil).Check(context.Background(), guidelines.Scope{OrganizationID: "org"}, Request{
		Checks:   []Field{FieldSource},
		Segments: []Segment{{ID: "s1", Source: "Buy Acme", Target: "Achetez Akme"}},
	})
	require.NoError(t, err)
	require.Len(t, result.Findings, 1)
	require.Equal(t, FieldSource, result.Findings[0].Field)
	require.Equal(t, utf16Len("Buy Acme"), result.Findings[0].End)
}
