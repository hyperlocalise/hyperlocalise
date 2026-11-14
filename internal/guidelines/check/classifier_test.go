package check

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/aisdk"
	"github.com/stretchr/testify/require"
)

func TestEvaluateClassifierPostsBooleanQuestions(t *testing.T) {
	var gotBody map[string]any
	var gotModel string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/evaluation-model", r.URL.Path)
		require.Equal(t, "Bearer vck_test", r.Header.Get("Authorization"))
		gotModel = r.Header.Get("ai-model-id")
		raw, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.NoError(t, json.Unmarshal(raw, &gotBody))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"answers":{"s1_P1":{"type":"boolean","probability":0.91},"s1_P2":{"type":"boolean","probability":0.12}}}`))
	}))
	t.Cleanup(server.Close)

	client, err := aisdk.NewClient(aisdk.WithBaseURL(server.URL), aisdk.WithAPIKey("vck_test"))
	require.NoError(t, err)
	classifier := NewEvaluateClassifier(client, "")
	require.Equal(t, aisdk.JevModelID, classifier.Name())

	probabilities, err := classifier.Classify(context.Background(), classifyState{
		SourceLocale: "en",
		TargetLocale: "fr-FR",
		Checks:       []string{"target"},
		Segments:     []Segment{{ID: "s1", Target: "Peux-tu aider ?"}},
		Passages:     []labeledPassage{{Label: "P1", Text: "Use vous."}},
	}, map[string]BooleanQuestion{
		"s1_P1": {Instructions: "Does s1 violate P1?", True: "breach", False: "ok"},
		"s1_P2": {Instructions: "Does s1 violate P2?", True: "breach", False: "ok"},
	})
	require.NoError(t, err)
	require.Equal(t, aisdk.JevModelID, gotModel)
	require.InDelta(t, 0.91, probabilities["s1_P1"], 0.0001)
	require.InDelta(t, 0.12, probabilities["s1_P2"], 0.0001)

	require.Equal(t, map[string]any{"zeroDataRetention": true}, gotBody["providerOptions"].(map[string]any)["gateway"])
	questions := gotBody["questions"].(map[string]any)
	require.Equal(t, "boolean", questions["s1_P1"].(map[string]any)["type"])
	require.Equal(t, "Does s1 violate P1?", questions["s1_P1"].(map[string]any)["instructions"])
}

func TestEvaluateClassifierSkipsEmptyQuestionsAndRejectsWrongAnswerTypes(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"answers":{"s1_P1":{"type":"choice","choice":"ok"}}}`))
	}))
	t.Cleanup(server.Close)
	client, err := aisdk.NewClient(aisdk.WithBaseURL(server.URL), aisdk.WithAPIKey("vck_test"))
	require.NoError(t, err)
	classifier := NewEvaluateClassifier(client, "typesafe-ai/jev")

	empty, err := classifier.Classify(context.Background(), map[string]string{"k": "v"}, nil)
	require.NoError(t, err)
	require.Empty(t, empty)
	require.Zero(t, calls)

	_, err = classifier.Classify(context.Background(), "state", map[string]BooleanQuestion{
		"s1_P1": {Instructions: "x"},
	})
	require.Error(t, err)
	require.Equal(t, 1, calls)
}

func TestEvaluateClassifierRequiresClient(t *testing.T) {
	require.Nil(t, NewEvaluateClassifier(nil, ""))
	_, err := (*EvaluateClassifier)(nil).Classify(context.Background(), "state", map[string]BooleanQuestion{"s1_P1": {}})
	require.Error(t, err)
}
