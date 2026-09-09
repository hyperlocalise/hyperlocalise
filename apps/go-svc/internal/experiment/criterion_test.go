package experiment

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEvaluateCriterionExact(t *testing.T) {
	ok, err := evaluateCriterion(
		[]byte(`{"type":"attribute","name":"plan","match":"exact","value":"pro"}`),
		map[string]any{"plan": "pro"},
	)
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"plan","match":"exact","value":"pro"}`),
		map[string]any{"plan": "free"},
	)
	require.NoError(t, err)
	require.False(t, ok)
}

func TestEvaluateCriterionAndOr(t *testing.T) {
	raw := []byte(`{"type":"and","children":[{"type":"attribute","name":"plan","match":"exact","value":"pro"},{"type":"attribute","name":"country","match":"in","value":["AU","NZ"]}]}`)
	ok, err := evaluateCriterion(raw, map[string]any{"plan": "pro", "country": "AU"})
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = evaluateCriterion(raw, map[string]any{"plan": "pro", "country": "US"})
	require.NoError(t, err)
	require.False(t, ok)
}

func TestEvaluateCriterionNullMeansEveryone(t *testing.T) {
	ok, err := evaluateCriterion(nil, map[string]any{})
	require.NoError(t, err)
	require.True(t, ok)
}

func TestEvaluateCriterionExactKeepsJSONTypes(t *testing.T) {
	t.Parallel()

	ok, err := evaluateCriterion(
		[]byte(`{"type":"attribute","name":"enabled","match":"exact","value":true}`),
		map[string]any{"enabled": true},
	)
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"enabled","match":"exact","value":true}`),
		map[string]any{"enabled": "true"},
	)
	require.NoError(t, err)
	require.False(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"count","match":"exact","value":1}`),
		map[string]any{"count": "1"},
	)
	require.NoError(t, err)
	require.False(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"count","match":"exact","value":1}`),
		map[string]any{"count": 1},
	)
	require.NoError(t, err)
	require.True(t, ok)
}

func TestEvaluateCriterionNotAndNullChecks(t *testing.T) {
	t.Parallel()

	ok, err := evaluateCriterion(
		[]byte(`{"type":"not","children":[{"type":"attribute","name":"plan","match":"exact","value":"pro"}]}`),
		map[string]any{"plan": "free"},
	)
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = evaluateCriterion([]byte(`{"type":"not","children":[]}`), map[string]any{})
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"missing","match":"is_null"}`),
		map[string]any{},
	)
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"plan","match":"is_not_null"}`),
		map[string]any{"plan": "pro"},
	)
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"plan","match":"is_not_null"}`),
		map[string]any{},
	)
	require.NoError(t, err)
	require.False(t, ok)
}

func TestEvaluateCriterionComparisonsAndMembership(t *testing.T) {
	t.Parallel()

	ok, err := evaluateCriterion(
		[]byte(`{"type":"attribute","name":"score","match":"gt","value":10}`),
		map[string]any{"score": 11},
	)
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"score","match":"gte","value":10}`),
		map[string]any{"score": 10},
	)
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"score","match":"lt","value":10}`),
		map[string]any{"score": 9},
	)
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"score","match":"lte","value":10}`),
		map[string]any{"score": 10},
	)
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"score","match":"gt","value":10}`),
		map[string]any{"score": "not-a-number"},
	)
	require.NoError(t, err)
	require.False(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"country","match":"in","value":["AU","NZ"]}`),
		map[string]any{"country": "NZ"},
	)
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"email","match":"contains_substring","value":"@example.com"}`),
		map[string]any{"email": "dev@example.com"},
	)
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"tags","match":"contains_any","value":["beta","vip"]}`),
		map[string]any{"tags": []any{"alpha", "vip"}},
	)
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"tags","match":"contains_any","value":["beta"]}`),
		map[string]any{"tags": []any{}},
	)
	require.NoError(t, err)
	require.False(t, ok)

	ok, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"path","match":"contains_substring_any","value":["/admin","/billing"]}`),
		map[string]any{"path": "/org/billing/plans"},
	)
	require.NoError(t, err)
	require.True(t, ok)
}

func TestEvaluateCriterionEmptyOrAndUnknownErrors(t *testing.T) {
	t.Parallel()

	ok, err := evaluateCriterion([]byte(`{"type":"or","children":[]}`), map[string]any{})
	require.NoError(t, err)
	require.False(t, ok)

	_, err = evaluateCriterion([]byte(`{"type":"mystery"}`), map[string]any{})
	require.ErrorContains(t, err, `unknown criterion type "mystery"`)

	_, err = evaluateCriterion(
		[]byte(`{"type":"attribute","name":"plan","match":"weird"}`),
		map[string]any{"plan": "pro"},
	)
	require.ErrorContains(t, err, `unknown match "weird"`)
}
