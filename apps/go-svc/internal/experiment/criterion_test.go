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
