package experiment

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
)

type errorEvalStore struct {
	err error
}

func (s errorEvalStore) LookupOrganizationID(context.Context, string) (string, error) {
	return "", s.err
}

func (s errorEvalStore) LoadFlag(context.Context, string, string) (*FlagRecord, error) {
	return nil, s.err
}

func (s errorEvalStore) LoadFlags(context.Context, string) ([]FlagRecord, error) {
	return nil, s.err
}

func (s errorEvalStore) LoadEvalRows(context.Context, string, []string) ([]EvalRow, error) {
	return nil, s.err
}

func (s errorEvalStore) TouchClientKey(context.Context, string) {}

func TestResolveConfig(t *testing.T) {
	require.Equal(t, Resolution{
		Key:          "copy",
		Reason:       "ERROR",
		Error:        "GENERAL",
		ErrorDetails: "Config flag has no value",
	}, resolveConfig(FlagRecord{Key: "copy", Kind: "config"}))

	require.Equal(t, Resolution{
		Key:          "copy",
		Reason:       "ERROR",
		Error:        "PARSE_ERROR",
		ErrorDetails: "Config flag value is not valid JSON",
	}, resolveConfig(FlagRecord{Key: "copy", Kind: "config", ConfigValue: []byte(`{`)}))

	got := resolveConfig(FlagRecord{Key: "copy", Kind: "config", ConfigValue: []byte(`{"title":"Hello"}`)})
	require.Equal(t, "copy", got.Key)
	require.Equal(t, "STATIC", got.Reason)
	require.Equal(t, map[string]any{"title": "Hello"}, got.Value)
}

func TestResolveExperiment(t *testing.T) {
	flag := FlagRecord{Key: "checkout-cta", Kind: "experiment"}
	fullRange := EvalRow{
		FlagID:       "f-exp",
		ExperimentID: "exp-1",
		Seed:         1,
		VariantKey:   "treatment",
		AllocStart:   0,
		AllocEnd:     9999,
		Enabled:      true,
		Payload:      []byte(`{"cta":"Try it"}`),
	}

	got := resolveExperiment(flag, []EvalRow{fullRange}, "user-1", nil)
	require.Equal(t, "SPLIT", got.Reason)
	require.Equal(t, "treatment", got.Variant)
	require.Equal(t, map[string]any{"cta": "Try it"}, got.Value)

	disabled := fullRange
	disabled.Enabled = false
	got = resolveExperiment(flag, []EvalRow{disabled}, "user-1", nil)
	require.Equal(t, Resolution{Key: "checkout-cta", Value: false, Reason: "DISABLED", Variant: "treatment"}, got)

	targeted := fullRange
	targeted.Criterion = json.RawMessage(`{"type":"attribute","name":"plan","match":"exact","value":"pro"}`)
	got = resolveExperiment(flag, []EvalRow{targeted}, "user-1", map[string]any{"plan": "pro"})
	require.Equal(t, "TARGETING_MATCH", got.Reason)
	require.Equal(t, map[string]any{"cta": "Try it"}, got.Value)

	got = resolveExperiment(flag, []EvalRow{targeted}, "user-1", map[string]any{"plan": "free"})
	require.Equal(t, Resolution{Key: "checkout-cta", Value: false, Reason: "STATIC"}, got)

	missedBucket := fullRange
	missedBucket.AllocStart = 0
	missedBucket.AllocEnd = -1
	got = resolveExperiment(flag, []EvalRow{missedBucket}, "user-1", nil)
	require.Equal(t, Resolution{Key: "checkout-cta", Value: false, Reason: "STATIC"}, got)

	boolean := fullRange
	boolean.Payload = nil
	got = resolveExperiment(flag, []EvalRow{boolean}, "user-1", nil)
	require.Equal(t, true, got.Value)

	invalidPayload := fullRange
	invalidPayload.Payload = []byte(`{`)
	got = resolveExperiment(flag, []EvalRow{invalidPayload}, "user-1", nil)
	require.Equal(t, true, got.Value)

	nullCriterion := fullRange
	nullCriterion.Criterion = json.RawMessage("null")
	got = resolveExperiment(flag, []EvalRow{nullCriterion}, "user-1", nil)
	require.Equal(t, "SPLIT", got.Reason)
}

func TestEvaluateFlags(t *testing.T) {
	store := NewMemoryStore("org-1")
	store.SetRows([]EvalRow{{
		FlagID:       "f-exp",
		ExperimentID: "exp-1",
		Seed:         1,
		VariantKey:   "treatment",
		AllocStart:   0,
		AllocEnd:     9999,
		Enabled:      true,
		Payload:      []byte(`true`),
	}})

	got, err := evaluateFlags(t.Context(), store, "org-1", []FlagRecord{
		{ID: "f-config", Key: "copy", Kind: "config", ConfigValue: []byte(`"hello"`)},
		{ID: "f-exp", Key: "checkout-cta", Kind: "experiment"},
	}, "user-1", nil)
	require.NoError(t, err)
	require.Equal(t, []Resolution{
		{Key: "copy", Value: "hello", Reason: "STATIC"},
		{Key: "checkout-cta", Value: true, Reason: "SPLIT", Variant: "treatment"},
	}, got)

	_, err = evaluateFlags(t.Context(), &errorEvalStore{err: errors.New("db down")}, "org-1", []FlagRecord{
		{ID: "f-exp", Key: "checkout-cta", Kind: "experiment"},
	}, "user-1", nil)
	require.EqualError(t, err, "db down")
}
