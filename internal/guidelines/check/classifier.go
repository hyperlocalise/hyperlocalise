package check

import (
	"context"
	"fmt"

	"github.com/hyperlocalise/hyperlocalise/internal/aisdk"
)

// EvaluateClassifier calls an AI Gateway evaluation model (Jev by default).
type EvaluateClassifier struct {
	client *aisdk.Client
	model  string
}

// NewEvaluateClassifier wraps an evaluation client. An empty model uses Jev.
func NewEvaluateClassifier(client *aisdk.Client, model string) *EvaluateClassifier {
	if client == nil {
		return nil
	}
	return &EvaluateClassifier{client: client, model: model}
}

func (c *EvaluateClassifier) Name() string {
	if c == nil {
		return ""
	}
	if c.model != "" {
		return c.model
	}
	return aisdk.JevModelID
}

func (c *EvaluateClassifier) Classify(ctx context.Context, state any, questions map[string]BooleanQuestion) (map[string]float64, error) {
	if c == nil || c.client == nil {
		return nil, fmt.Errorf("guideline check classifier is not configured")
	}
	if len(questions) == 0 {
		return map[string]float64{}, nil
	}
	encoded := make(map[string]aisdk.Question, len(questions))
	for id, question := range questions {
		encoded[id] = aisdk.BooleanQuestion(question.Instructions, &aisdk.BooleanCriteria{
			True:  question.True,
			False: question.False,
		})
	}
	result, err := c.client.ExperimentalEvaluate(ctx, aisdk.EvaluateRequest{
		Model:     c.Name(),
		State:     state,
		Questions: encoded,
		ProviderOptions: map[string]any{
			"gateway": map[string]any{"zeroDataRetention": true},
		},
	})
	if err != nil {
		return nil, err
	}
	probabilities := make(map[string]float64, len(result.Answers))
	for id, answer := range result.Answers {
		if answer.Type != aisdk.QuestionBoolean || answer.Probability == nil {
			continue
		}
		probabilities[id] = *answer.Probability
	}
	return probabilities, nil
}
