package check

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/stretchr/testify/require"
)

func TestCheckClassifiesViolations(t *testing.T) {
	note := mandatoryDoc("workspace:org", "Use vous, never tu.\n\nKeep Acme in English.")
	noteChunks := guidelines.Chunks(note)
	hit := guidelines.Chunk{ID: "hit-1", DocumentID: "doc:1", RevisionID: "r9", Text: "Dates use DD/MM/YYYY."}
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}, Passages: []guidelines.Chunk{noteChunks[0], hit}, SearchAvailable: true}}
	classifier := &fakeClassifier{probabilities: map[string]float64{
		"s1_P1": 0.92,
		"s1_P2": 0.1,
		"s1_P3": 0.2,
		"s2_P1": 0.05,
		"s2_P2": 0.08,
		"s2_P3": 0.88,
	}}
	result, err := New(retriever, classifier, nil).Check(context.Background(), guidelines.Scope{OrganizationID: "org", Locale: "fr-FR"}, Request{
		TargetLocale: "fr-FR",
		Checks:       []Field{FieldTarget},
		Segments: []Segment{
			{ID: "s1", Source: "Can you help?", Target: "Peux-tu 🙂 aider tu?"},
			{ID: "s2", Source: "Due 12/03/2026", Target: "Échéance 03/12/2026"},
		},
	})
	require.NoError(t, err)
	require.True(t, result.SearchAvailable)
	require.Equal(t, "typesafe-ai/jev", result.Model)
	require.Equal(t, 12, retriever.limit)
	require.Contains(t, retriever.query, "Peux-tu")
	require.Len(t, classifier.questions, 6)
	require.Contains(t, classifier.questions["s1_P1"].Instructions, "s1")

	state, ok := classifier.state.(classifyState)
	require.True(t, ok)
	require.Equal(t, []string{"P1", "P2", "P3"}, []string{state.Passages[0].Label, state.Passages[1].Label, state.Passages[2].Label})

	require.Len(t, result.Findings, 2)
	require.Equal(t, Finding{
		SegmentID: "s1", Field: FieldTarget, Severity: "warning", Start: 0, End: utf16Len("Peux-tu 🙂 aider tu?"),
		Message: ClassifierFindingMessage, PassageID: noteChunks[0].ID, ReasoningAvailable: true,
	}, result.Findings[0])
	require.Equal(t, "s2", result.Findings[1].SegmentID)
	require.Equal(t, "hit-1", result.Findings[1].PassageID)
	require.True(t, result.Findings[1].ReasoningAvailable)
	require.Empty(t, result.Findings[1].Suggestion)
	require.Equal(t, []Passage{
		{ID: noteChunks[0].ID, DocumentID: "workspace:org", Text: "Use vous, never tu."},
		{ID: "hit-1", DocumentID: "doc:1", Text: "Dates use DD/MM/YYYY."},
	}, result.Passages)
}

func TestCheckUTF16OffsetsAndEmptyQuote(t *testing.T) {
	start, end, ok := locate("🙂 tu", "tu")
	require.True(t, ok)
	require.Equal(t, 3, start)
	require.Equal(t, 5, end)
	start, end, ok = locate("🙂 tu", "")
	require.True(t, ok)
	require.Equal(t, 0, start)
	require.Equal(t, 5, end)
}

func TestCheckSkipsClassifierWithoutGuidelinesAndSurfacesClassifierErrors(t *testing.T) {
	classifier := violateAll()
	result, err := New(&fakeRetriever{}, classifier, nil).Check(context.Background(), guidelines.Scope{OrganizationID: "org"}, Request{Segments: []Segment{{ID: "s1", Target: "Bonjour"}}})
	require.NoError(t, err)
	require.Zero(t, classifier.calls)
	require.Empty(t, result.Findings)
	require.False(t, result.SearchAvailable)

	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{mandatoryDoc("workspace:org", "Rule.")}}}
	classifier = cleanAll()
	result, err = New(retriever, classifier, nil).Check(context.Background(), guidelines.Scope{OrganizationID: "org"}, Request{Segments: []Segment{{ID: "s1", Target: "Bonjour"}}})
	require.NoError(t, err)
	require.Empty(t, result.Findings)
	require.Equal(t, 1, classifier.calls)

	classifier.err = errors.New("gateway down")
	_, err = New(retriever, classifier, nil).Check(context.Background(), guidelines.Scope{OrganizationID: "org"}, Request{Segments: []Segment{{ID: "s1", Target: "Bonjour"}}})
	require.Error(t, err)
}

func TestNormalize(t *testing.T) {
	req, err := Normalize(Request{Segments: []Segment{{ID: "a", Source: "x"}, {ID: "b", Target: "y"}}})
	require.NoError(t, err)
	require.Equal(t, []Field{FieldSource, FieldTarget}, req.Checks)

	tooMany := make([]Segment, MaxSegments+1)
	for i := range tooMany {
		tooMany[i] = Segment{ID: strings.Repeat("a", i+1), Target: "x"}
	}
	invalid := []Request{
		{},
		{Segments: tooMany},
		{Segments: []Segment{{ID: "a", Target: strings.Repeat("é", MaxTotalRunes+1)}}},
		{Segments: []Segment{{ID: "a"}}},
		{Segments: []Segment{{ID: "a", Target: "x"}, {ID: "a", Target: "y"}}},
		{Segments: []Segment{{ID: " ", Target: "x"}}},
		{Segments: []Segment{{ID: "a", Target: "x"}}, Checks: []Field{"style"}},
	}
	for _, req := range invalid {
		_, err := Normalize(req)
		require.ErrorIs(t, err, ErrInvalidInput)
	}
}

func TestCheckRejectsOverBudgetMandatoryPassages(t *testing.T) {
	doc1 := mandatoryDoc("workspace:org", strings.Repeat("a", 15000))
	doc2 := mandatoryDoc("project:p1", strings.Repeat("b", 15000))
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{doc1, doc2}}}
	classifier := violateAll()
	_, err := New(retriever, classifier, nil).Check(context.Background(), guidelines.Scope{OrganizationID: "org"}, Request{
		Segments: []Segment{{ID: "s1", Target: "Bonjour"}},
	})
	require.ErrorIs(t, err, ErrMandatoryPassagesOverBudget)
	require.Zero(t, classifier.calls)
}

func TestCheckAllowsDroppingOptionalPassagesWhenOverBudget(t *testing.T) {
	note := mandatoryDoc("workspace:org", strings.Repeat("a", 18000))
	hit := guidelines.Chunk{ID: "hit-1", DocumentID: "doc:1", RevisionID: "r9", Text: strings.Repeat("x", 5000)}
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{note}, Passages: []guidelines.Chunk{hit}, SearchAvailable: true}}
	classifier := cleanAll()
	result, err := New(retriever, classifier, nil).Check(context.Background(), guidelines.Scope{OrganizationID: "org"}, Request{
		Segments: []Segment{{ID: "s1", Target: "Bonjour"}},
	})
	require.NoError(t, err)
	require.Equal(t, 1, classifier.calls)
	state := classifier.state.(classifyState)
	require.NotEmpty(t, state.Passages)
	for _, passage := range state.Passages {
		require.NotContains(t, passage.Text, "xxxxx")
	}
	require.True(t, result.SearchAvailable)
}

func TestRetrievalQueryStaysWithinRetrieveLimit(t *testing.T) {
	query := retrievalQuery(Request{Segments: []Segment{{ID: "a", Source: strings.Repeat("é", 9000), Target: strings.Repeat("ü", 9000)}}})
	require.LessOrEqual(t, len(query), maxQueryBytes)
	require.True(t, strings.HasPrefix(query, "é"))
}

func TestOpenAIModelSendsStrictSchema(t *testing.T) {
	var body map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/chat/completions", r.URL.Path)
		require.Equal(t, "Bearer key", r.Header.Get("Authorization"))
		raw, _ := io.ReadAll(r.Body)
		require.NoError(t, json.Unmarshal(raw, &body))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"1","object":"chat.completion","created":1,"model":"m","usage":{"prompt_tokens":11,"completion_tokens":4},"choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"{\"findings\":[]}"}}]}`))
	}))
	defer server.Close()

	model, err := NewOpenAIModel(OpenAIConfig{BaseURL: server.URL, APIKey: "key", Model: "openai/gpt-5-mini"})
	require.NoError(t, err)
	output, err := model.Complete(context.Background(), "system", "user")
	require.NoError(t, err)
	require.JSONEq(t, `{"findings":[]}`, output.Text)
	require.Equal(t, 11, output.InputTokens)
	require.Equal(t, 4, output.OutputTokens)
	format := body["response_format"].(map[string]any)
	require.Equal(t, "json_schema", format["type"])
	require.Equal(t, true, format["json_schema"].(map[string]any)["strict"])

	_, err = NewOpenAIModel(OpenAIConfig{APIKey: "key"})
	require.ErrorIs(t, err, ErrInvalidInput)
}

func TestOpenAIModelRejectsIncompleteReplies(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		wantErr string
	}{
		{
			name:    "truncated",
			body:    `{"id":"1","object":"chat.completion","created":1,"model":"m","choices":[{"index":0,"finish_reason":"length","message":{"role":"assistant","content":"{\"findings\":["}}]}`,
			wantErr: "truncated",
		},
		{
			name:    "refused",
			body:    `{"id":"1","object":"chat.completion","created":1,"model":"m","choices":[{"index":0,"finish_reason":"content_filter","message":{"role":"assistant","content":""}}]}`,
			wantErr: "refused",
		},
		{
			name:    "empty",
			body:    `{"id":"1","object":"chat.completion","created":1,"model":"m","choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":""}}]}`,
			wantErr: "empty content",
		},
		{
			name:    "refusal text",
			body:    `{"id":"1","object":"chat.completion","created":1,"model":"m","choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"","refusal":"I can't help with that."}}]}`,
			wantErr: "refused",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(tc.body))
			}))
			t.Cleanup(server.Close)
			model, err := NewOpenAIModel(OpenAIConfig{BaseURL: server.URL, APIKey: "key", Model: "openai/gpt-5-mini"})
			require.NoError(t, err)
			_, err = model.Complete(context.Background(), "system", "user")
			require.ErrorContains(t, err, tc.wantErr)
		})
	}
}
