package aisdk

import "time"

// JevModelID is TypeSafe AI's Jev evaluation model on AI Gateway.
const JevModelID = "typesafe-ai/jev"

// QuestionType is a typed evaluation question kind.
type QuestionType string

const (
	QuestionBoolean QuestionType = "boolean"
	QuestionChoice  QuestionType = "choice"
	QuestionScore   QuestionType = "score"
)

// Question is one named decision about the shared evaluation state.
type Question struct {
	Type         QuestionType `json:"type"`
	Instructions any          `json:"instructions"`
	Criteria     any          `json:"criteria,omitempty"`
}

// BooleanCriteria describes the true and false cases of a boolean question.
type BooleanCriteria struct {
	True  any `json:"true,omitempty"`
	False any `json:"false,omitempty"`
}

// BooleanQuestion builds a boolean question.
func BooleanQuestion(instructions any, criteria *BooleanCriteria) Question {
	question := Question{
		Type:         QuestionBoolean,
		Instructions: instructions,
	}
	if criteria != nil {
		question.Criteria = criteria
	}
	return question
}

// ChoiceQuestion builds a choice question. criteria maps option keys to
// descriptions.
func ChoiceQuestion(instructions any, criteria map[string]any) Question {
	return Question{
		Type:         QuestionChoice,
		Instructions: instructions,
		Criteria:     criteria,
	}
}

// ScoreQuestion builds a score question. levels are ordered lowest to highest.
func ScoreQuestion(instructions any, levels []any) Question {
	return Question{
		Type:         QuestionScore,
		Instructions: instructions,
		Criteria:     levels,
	}
}

// EvaluateRequest is the experimental evaluate call payload.
type EvaluateRequest struct {
	// Model is an AI Gateway evaluation model ID. Defaults to JevModelID.
	Model string
	// State is the shared string, object, or array to evaluate.
	State any
	// Questions is a nonempty map of named decisions.
	Questions map[string]Question
	// Headers are extra HTTP headers for this call.
	Headers map[string]string
	// ProviderOptions are provider-specific options, for example
	// {"gateway": {"zeroDataRetention": true}}.
	ProviderOptions map[string]any
	// MaxRetries overrides the client retry count for this call. A nil value
	// uses the client default (2).
	MaxRetries *int
}

// Answer is one typed evaluation answer. Fields are populated by type:
// Choice uses Choice and optional Probabilities, Score uses Score and optional
// Probabilities, Boolean uses Probability.
type Answer struct {
	Type          QuestionType       `json:"type"`
	Choice        string             `json:"choice,omitempty"`
	Score         *float64           `json:"score,omitempty"`
	Probability   *float64           `json:"probability,omitempty"`
	Probabilities map[string]float64 `json:"probabilities,omitempty"`
}

// Usage reports token counts when the provider supplies them.
type Usage struct {
	InputTokens  *int `json:"inputTokens,omitempty"`
	OutputTokens *int `json:"outputTokens,omitempty"`
	TotalTokens  *int `json:"totalTokens,omitempty"`
}

// Rounding is the provider-declared decimal precision for probabilities and
// scores.
type Rounding struct {
	ProbabilityDecimals *int `json:"probabilityDecimals,omitempty"`
	ScoreDecimals       *int `json:"scoreDecimals,omitempty"`
}

// Warning is a provider warning from an evaluation call.
type Warning struct {
	Type    string `json:"type"`
	Feature string `json:"feature,omitempty"`
	Setting string `json:"setting,omitempty"`
	Message string `json:"message,omitempty"`
	Details string `json:"details,omitempty"`
}

// ResponseMeta describes the HTTP response that produced the result.
type ResponseMeta struct {
	Timestamp time.Time         `json:"timestamp"`
	ModelID   string            `json:"modelId"`
	Headers   map[string]string `json:"headers,omitempty"`
	Body      any               `json:"body,omitempty"`
}

// EvaluateResult is the experimental evaluate response.
type EvaluateResult struct {
	Answers          map[string]Answer `json:"answers"`
	Usage            Usage             `json:"usage"`
	Warnings         []Warning         `json:"warnings"`
	Rounding         *Rounding         `json:"rounding,omitempty"`
	ProviderMetadata map[string]any    `json:"providerMetadata,omitempty"`
	Response         ResponseMeta      `json:"response"`
}

// TypeSafeConfidence returns Jev's Choice/Score confidence map when present
// at providerMetadata.typesafe.confidence.
func (r *EvaluateResult) TypeSafeConfidence() map[string]float64 {
	if r == nil {
		return nil
	}
	typesafe, ok := r.ProviderMetadata["typesafe"].(map[string]any)
	if !ok {
		return nil
	}
	raw, ok := typesafe["confidence"].(map[string]any)
	if !ok {
		return nil
	}
	out := make(map[string]float64, len(raw))
	for id, value := range raw {
		number, ok := jsonNumber(value)
		if !ok {
			continue
		}
		out[id] = number
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
