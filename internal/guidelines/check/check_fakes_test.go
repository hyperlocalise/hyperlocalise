package check

import (
	"context"

	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
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
	output      string
	inputTokens int
	err         error
	user        string
	calls       int
}

func (f *fakeModel) Complete(_ context.Context, _, user string) (Completion, error) {
	f.calls++
	f.user = user
	return Completion{Text: f.output, InputTokens: f.inputTokens, OutputTokens: 12}, f.err
}

func (f *fakeModel) Name() string { return "test-model" }

type fakeClassifier struct {
	probabilities map[string]float64
	fill          *float64
	err           error
	state         any
	questions     map[string]BooleanQuestion
	calls         int
	name          string
}

func (f *fakeClassifier) Name() string {
	if f.name != "" {
		return f.name
	}
	return "typesafe-ai/jev"
}

func (f *fakeClassifier) Classify(_ context.Context, state any, questions map[string]BooleanQuestion) (map[string]float64, error) {
	f.calls++
	f.state = state
	f.questions = questions
	if f.err != nil {
		return nil, f.err
	}
	out := map[string]float64{}
	for id := range questions {
		if f.probabilities != nil {
			if value, ok := f.probabilities[id]; ok {
				out[id] = value
				continue
			}
		}
		if f.fill != nil {
			out[id] = *f.fill
		}
	}
	return out, nil
}

func probability(value float64) *float64 {
	return &value
}

func mandatoryDoc(id, content string) guidelines.Document {
	return guidelines.Document{ID: id, RevisionID: "r1", Version: 1, Scope: guidelines.Scope{OrganizationID: "org"}, Content: content, Mandatory: true}
}

func violateAll() *fakeClassifier {
	return &fakeClassifier{fill: probability(0.9)}
}

func cleanAll() *fakeClassifier {
	return &fakeClassifier{fill: probability(0.05)}
}
