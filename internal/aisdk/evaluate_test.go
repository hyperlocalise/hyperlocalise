package aisdk

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExperimentalEvaluateSendsGatewayProtocolAndParsesJevAnswers(t *testing.T) {
	var gotPath string
	var gotAuth string
	var gotModel string
	var gotSpec string
	var gotBody evaluateRequestBody

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotModel = r.Header.Get("ai-model-id")
		gotSpec = r.Header.Get("ai-evaluation-model-specification-version")

		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Errorf("decode request: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{
			"answers": {
				"refunded": {"type": "boolean", "probability": 0.99},
				"route": {
					"type": "choice",
					"choice": "billing",
					"probabilities": {"billing": 0.9, "shipping": 0.1}
				},
				"urgency": {
					"type": "score",
					"score": 1.8,
					"probabilities": {"0": 0.1, "1": 0.0, "2": 0.9}
				}
			},
			"usage": {"inputTokens": 283, "outputTokens": 21},
			"providerMetadata": {
				"typesafe": {"confidence": {"route": 0.87, "urgency": 0.76}}
			}
		}`)
	}))
	defer srv.Close()

	client, err := NewClient(WithBaseURL(srv.URL), WithAPIKey("vck_test_key"))
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	result, err := client.ExperimentalEvaluate(context.Background(), EvaluateRequest{
		State: "The support agent issued a full refund to the customer.",
		Questions: map[string]Question{
			"refunded": BooleanQuestion("Was a refund issued?", nil),
			"route": ChoiceQuestion("Route this support ticket.", map[string]any{
				"billing":  "payment or charge problems",
				"shipping": "delivery problems",
			}),
			"urgency": ScoreQuestion("How urgent is this ticket?", []any{"low", "medium", "high"}),
		},
		ProviderOptions: map[string]any{
			"gateway": map[string]any{"zeroDataRetention": true},
		},
	})
	if err != nil {
		t.Fatalf("ExperimentalEvaluate: %v", err)
	}

	if gotPath != "/evaluation-model" {
		t.Fatalf("path = %q, want /evaluation-model", gotPath)
	}
	if gotAuth != "Bearer vck_test_key" {
		t.Fatalf("Authorization = %q", gotAuth)
	}
	if gotModel != JevModelID {
		t.Fatalf("ai-model-id = %q, want %q", gotModel, JevModelID)
	}
	if gotSpec != "4" {
		t.Fatalf("specification version = %q, want 4", gotSpec)
	}
	if gotBody.State != "The support agent issued a full refund to the customer." {
		t.Fatalf("state = %#v", gotBody.State)
	}
	if gotBody.ProviderOptions["gateway"] == nil {
		t.Fatal("expected gateway provider options")
	}

	refunded := result.Answers["refunded"]
	if refunded.Type != QuestionBoolean || refunded.Probability == nil || *refunded.Probability != 0.99 {
		t.Fatalf("refunded = %#v", refunded)
	}
	route := result.Answers["route"]
	if route.Choice != "billing" || route.Probabilities["billing"] != 0.9 {
		t.Fatalf("route = %#v", route)
	}
	urgency := result.Answers["urgency"]
	if urgency.Score == nil || *urgency.Score != 1.8 {
		t.Fatalf("urgency = %#v", urgency)
	}
	if result.Usage.TotalTokens == nil || *result.Usage.TotalTokens != 304 {
		t.Fatalf("usage = %#v", result.Usage)
	}
	confidence := result.TypeSafeConfidence()
	if confidence["route"] != 0.87 || confidence["urgency"] != 0.76 {
		t.Fatalf("confidence = %#v", confidence)
	}
}

func TestExperimentalEvaluateValidatesInput(t *testing.T) {
	client, err := NewClient(WithBaseURL("http://unused"), WithAPIKey("vck_test_key"))
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	tests := []struct {
		name    string
		req     EvaluateRequest
		wantErr string
	}{
		{
			name: "empty questions",
			req: EvaluateRequest{
				State:     "hello",
				Questions: map[string]Question{},
			},
			wantErr: "nonempty question map",
		},
		{
			name: "invalid state",
			req: EvaluateRequest{
				State: 123,
				Questions: map[string]Question{
					"ok": BooleanQuestion("yes?", nil),
				},
			},
			wantErr: "state must be a JSON-compatible",
		},
		{
			name: "choice without criteria",
			req: EvaluateRequest{
				State: "hello",
				Questions: map[string]Question{
					"route": {Type: QuestionChoice, Instructions: "pick"},
				},
			},
			wantErr: "choice criteria",
		},
		{
			name: "score with one level",
			req: EvaluateRequest{
				State: "hello",
				Questions: map[string]Question{
					"quality": ScoreQuestion("rate", []any{"low"}),
				},
			},
			wantErr: "at least two ordered levels",
		},
		{
			name: "unknown question type",
			req: EvaluateRequest{
				State: "hello",
				Questions: map[string]Question{
					"weird": {Type: "multilabel", Instructions: "nope"},
				},
			},
			wantErr: "question type must be",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := client.ExperimentalEvaluate(context.Background(), tt.req)
			if err == nil {
				t.Fatal("expected error")
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("error %q does not contain %q", err.Error(), tt.wantErr)
			}
		})
	}
}

func TestExperimentalEvaluateRejectsInvalidAnswers(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		wantErr string
	}{
		{
			name:    "missing answer",
			body:    `{"answers":{}}`,
			wantErr: "exactly one answer",
		},
		{
			name:    "wrong type",
			body:    `{"answers":{"refunded":{"type":"choice","choice":"yes"}}}`,
			wantErr: "wrong type",
		},
		{
			name:    "boolean out of range",
			body:    `{"answers":{"refunded":{"type":"boolean","probability":1.2}}}`,
			wantErr: "finite probability",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, tt.body)
			}))
			defer srv.Close()

			client, err := NewClient(WithBaseURL(srv.URL), WithAPIKey("vck_test_key"))
			if err != nil {
				t.Fatalf("NewClient: %v", err)
			}
			_, err = client.ExperimentalEvaluate(context.Background(), EvaluateRequest{
				State: "The support agent issued a full refund.",
				Questions: map[string]Question{
					"refunded": BooleanQuestion("Was a refund issued?", nil),
				},
			})
			if err == nil {
				t.Fatal("expected error")
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("error %q does not contain %q", err.Error(), tt.wantErr)
			}
		})
	}
}

func TestExperimentalEvaluateRetriesTransientUpstreamErrors(t *testing.T) {
	attempts := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		attempts++
		if attempts < 3 {
			w.WriteHeader(http.StatusBadGateway)
			_, _ = io.WriteString(w, `{"error":{"message":"temporary"}}`)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"answers":{"refunded":{"type":"boolean","probability":0.1}}}`)
	}))
	defer srv.Close()

	client, err := NewClient(WithBaseURL(srv.URL), WithAPIKey("vck_test_key"), WithMaxRetries(2))
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	result, err := client.ExperimentalEvaluate(context.Background(), EvaluateRequest{
		State: "The build failed with exit code 1.",
		Questions: map[string]Question{
			"refunded": BooleanQuestion("Did the build succeed?", &BooleanCriteria{
				True:  "exit code 0",
				False: "any non-zero exit code",
			}),
		},
	})
	if err != nil {
		t.Fatalf("ExperimentalEvaluate: %v", err)
	}
	if attempts != 3 {
		t.Fatalf("attempts = %d, want 3", attempts)
	}
	if result.Answers["refunded"].Probability == nil || *result.Answers["refunded"].Probability != 0.1 {
		t.Fatalf("answer = %#v", result.Answers["refunded"])
	}
}

func TestExperimentalEvaluateDoesNotRetryClientErrors(t *testing.T) {
	attempts := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		attempts++
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"error":{"message":"not a valid model ID"}}`)
	}))
	defer srv.Close()

	client, err := NewClient(WithBaseURL(srv.URL), WithAPIKey("vck_test_key"), WithMaxRetries(2))
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	_, err = client.ExperimentalEvaluate(context.Background(), EvaluateRequest{
		Model: "not-a-real-model",
		State: "hello",
		Questions: map[string]Question{
			"refunded": BooleanQuestion("Was a refund issued?", nil),
		},
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if attempts != 1 {
		t.Fatalf("attempts = %d, want 1", attempts)
	}
	if !strings.Contains(err.Error(), "400") {
		t.Fatalf("error %q does not contain 400", err.Error())
	}
	if strings.Contains(err.Error(), "after") {
		t.Fatalf("error %q should not report unused retries", err.Error())
	}
}

func TestExperimentalEvaluateAcceptsStructStateAndInstructions(t *testing.T) {
	type ticket struct {
		Order  string `json:"order"`
		Status string `json:"status"`
	}
	type prompt struct {
		Question string `json:"question"`
	}

	var gotBody evaluateRequestBody
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Errorf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"answers":{"refunded":{"type":"boolean","probability":0.8}}}`)
	}))
	defer srv.Close()

	client, err := NewClient(WithBaseURL(srv.URL), WithAPIKey("vck_test_key"))
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	state := ticket{Order: "A-1", Status: "refunded"}
	_, err = client.ExperimentalEvaluate(context.Background(), EvaluateRequest{
		State: &state,
		Questions: map[string]Question{
			"refunded": BooleanQuestion(prompt{Question: "Was a refund issued?"}, nil),
		},
	})
	if err != nil {
		t.Fatalf("ExperimentalEvaluate: %v", err)
	}

	stateObject, ok := gotBody.State.(map[string]any)
	if !ok {
		t.Fatalf("state = %#v, want JSON object", gotBody.State)
	}
	if stateObject["order"] != "A-1" || stateObject["status"] != "refunded" {
		t.Fatalf("state = %#v", stateObject)
	}
	question, ok := gotBody.Questions["refunded"].(map[string]any)
	if !ok {
		t.Fatalf("question = %#v, want object", gotBody.Questions["refunded"])
	}
	instructions, ok := question["instructions"].(map[string]any)
	if !ok || instructions["question"] != "Was a refund issued?" {
		t.Fatalf("instructions = %#v", question["instructions"])
	}
}

func TestNewClientRequiresAPIKey(t *testing.T) {
	t.Setenv(defaultAPIKeyEnv, "")
	_, err := NewClient()
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), defaultAPIKeyEnv) {
		t.Fatalf("error %q does not mention %s", err.Error(), defaultAPIKeyEnv)
	}
}

func TestDefaultEvaluateBaseURL(t *testing.T) {
	if defaultEvaluateBaseURL != "https://ai-gateway.vercel.sh/v4/ai" {
		t.Fatalf("defaultEvaluateBaseURL = %q", defaultEvaluateBaseURL)
	}
}

func TestScoreWeightedMeanValidation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{
			"answers": {
				"quality": {
					"type": "score",
					"score": 0.5,
					"probabilities": {"0": 0.1, "1": 0.9}
				}
			}
		}`)
	}))
	defer srv.Close()

	client, err := NewClient(WithBaseURL(srv.URL), WithAPIKey("vck_test_key"))
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	_, err = client.ExperimentalEvaluate(context.Background(), EvaluateRequest{
		State: "The PR adds tests.",
		Questions: map[string]Question{
			"quality": ScoreQuestion("Rate the PR.", []any{"poor", "good"}),
		},
	})
	if err == nil {
		t.Fatal("expected weighted-mean mismatch")
	}
	if !strings.Contains(err.Error(), "probability-weighted mean") {
		t.Fatalf("error %q", err.Error())
	}
}
