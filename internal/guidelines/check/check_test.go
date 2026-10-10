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

type fakeRetriever struct {
	result guidelines.Result
	err    error
	scope  guidelines.Scope
	query  string
	limit  int
}

func (f *fakeRetriever) Retrieve(_ context.Context, scope guidelines.Scope, query string, limit int) (guidelines.Result, error) {
	f.scope, f.query, f.limit = scope, query, limit
	return f.result, f.err
}

type fakeModel struct {
	output string
	err    error
	user   string
	calls  int
}

func (f *fakeModel) Complete(_ context.Context, _, user string) (string, error) {
	f.calls++
	f.user = user
	return f.output, f.err
}

func (f *fakeModel) Name() string { return "test-model" }

func mandatoryDoc(id, content string) guidelines.Document {
	return guidelines.Document{ID: id, RevisionID: "r1", Version: 1, Scope: guidelines.Scope{OrganizationID: "org"}, Content: content, Mandatory: true}
}

func TestCheckGroundsFindings(t *testing.T) {
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
	]}`}
	result, err := New(retriever, model).Check(context.Background(), guidelines.Scope{OrganizationID: "org", Locale: "fr-FR"}, Request{
		TargetLocale: "fr-FR",
		Checks:       []Field{FieldTarget},
		Segments: []Segment{
			{ID: "s1", Source: "Can you help?", Target: "Peux-tu 🙂 aider tu?"},
			{ID: "s2", Source: "Due 12/03/2026", Target: "Échéance 03/12/2026"},
		},
	})
	require.NoError(t, err)
	require.True(t, result.SearchAvailable)
	require.Equal(t, "test-model", result.Model)
	require.Equal(t, 12, retriever.limit)
	require.Contains(t, retriever.query, "Peux-tu")
	require.Contains(t, model.user, `<passage label="P1">`)
	require.Contains(t, model.user, `<passage label="P3">`)
	require.NotContains(t, model.user, `<passage label="P4">`, "duplicate mandatory chunk from search is not repeated")

	require.Len(t, result.Findings, 2)
	require.Equal(t, Finding{SegmentID: "s1", Field: FieldTarget, Severity: "error", Start: 5, End: 7, Message: "Use vous.", Suggestion: "vous", PassageID: noteChunks[0].ID}, result.Findings[0])
	require.Equal(t, "warning", result.Findings[1].Severity)
	require.Equal(t, "hit-1", result.Findings[1].PassageID)
	require.Equal(t, 9, result.Findings[1].Start)
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

func TestCheckSkipsModelWithoutGuidelinesAndToleratesBadOutput(t *testing.T) {
	model := &fakeModel{}
	result, err := New(&fakeRetriever{}, model).Check(context.Background(), guidelines.Scope{OrganizationID: "org"}, Request{Segments: []Segment{{ID: "s1", Target: "Bonjour"}}})
	require.NoError(t, err)
	require.Zero(t, model.calls)
	require.Empty(t, result.Findings)
	require.False(t, result.SearchAvailable)

	model.output = "not json"
	retriever := &fakeRetriever{result: guidelines.Result{Mandatory: []guidelines.Document{mandatoryDoc("workspace:org", "Rule.")}}}
	result, err = New(retriever, model).Check(context.Background(), guidelines.Scope{OrganizationID: "org"}, Request{Segments: []Segment{{ID: "s1", Target: "Bonjour"}}})
	require.NoError(t, err)
	require.Empty(t, result.Findings)

	model.err = errors.New("gateway down")
	_, err = New(retriever, model).Check(context.Background(), guidelines.Scope{OrganizationID: "org"}, Request{Segments: []Segment{{ID: "s1", Target: "Bonjour"}}})
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
		_, _ = w.Write([]byte(`{"id":"1","object":"chat.completion","created":1,"model":"m","choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"{\"findings\":[]}"}}]}`))
	}))
	defer server.Close()

	model, err := NewOpenAIModel(OpenAIConfig{BaseURL: server.URL, APIKey: "key", Model: "openai/gpt-5-mini"})
	require.NoError(t, err)
	output, err := model.Complete(context.Background(), "system", "user")
	require.NoError(t, err)
	require.JSONEq(t, `{"findings":[]}`, output)
	format := body["response_format"].(map[string]any)
	require.Equal(t, "json_schema", format["type"])
	require.Equal(t, true, format["json_schema"].(map[string]any)["strict"])

	_, err = NewOpenAIModel(OpenAIConfig{APIKey: "key"})
	require.ErrorIs(t, err, ErrInvalidInput)
}
