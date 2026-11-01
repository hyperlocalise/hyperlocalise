package main

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestReportingQueryTextCoercesScalarsForMcpQueries(t *testing.T) {
	text, ok := reportingQueryText(json.RawMessage(`"page"`))
	require.True(t, ok)
	require.Equal(t, "page", text)

	text, ok = reportingQueryText(json.RawMessage(`2`))
	require.True(t, ok)
	require.Equal(t, "2", text)

	text, ok = reportingQueryText(json.RawMessage(`true`))
	require.True(t, ok)
	require.Equal(t, "true", text)

	text, ok = reportingQueryText(json.RawMessage(`false`))
	require.True(t, ok)
	require.Equal(t, "false", text)

	_, ok = reportingQueryText(json.RawMessage(`["page"]`))
	require.False(t, ok)
	_, ok = reportingQueryText(json.RawMessage(`{"page":2}`))
	require.False(t, ok)
}
