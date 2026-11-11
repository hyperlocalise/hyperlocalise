package main

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEmptyVisualWorkflowDefinitionIsV3(t *testing.T) {
	t.Parallel()

	var payload map[string]any
	require.NoError(t, json.Unmarshal(emptyVisualWorkflowDefinition("Launch"), &payload))
	require.Equal(t, float64(3), payload["schemaVersion"])
	require.Equal(t, "Launch", payload["name"])
	nodes, ok := payload["nodes"].([]any)
	require.True(t, ok)
	require.Len(t, nodes, 1)
	node := nodes[0].(map[string]any)
	require.Equal(t, "trigger", node["id"])
	require.Equal(t, "trigger.manual", node["type"])
}

func TestNormalizeVisualWorkflowDefinitionMigratesV2Edges(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{
        "schemaVersion": 2,
        "name": "Legacy",
        "nodes": [{"id": "trigger", "type": "trigger.manual", "config": {"kind": "trigger.manual"}}],
        "edges": [{"id": "e1", "source": "trigger", "target": "http", "sourceHandle": "success", "targetHandle": null}],
        "editor": {"positions": {"trigger": {"x": 1, "y": 2}}}
    }`)
	normalized, name, err := normalizeVisualWorkflowDefinition(raw, "Fallback")
	require.NoError(t, err)
	require.Equal(t, "Legacy", name)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(normalized, &payload))
	require.Equal(t, float64(3), payload["schemaVersion"])
	edges := payload["edges"].([]any)
	require.Len(t, edges, 1)
	edge := edges[0].(map[string]any)
	require.Equal(t, "execution", edge["kind"])
	require.Equal(t, "success", edge["sourcePortId"])
	require.Equal(t, "input", edge["targetPortId"])
}

func TestNormalizeVisualWorkflowDefinitionRejectsLiteralHTTPSecrets(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{
        "schemaVersion": 3,
        "name": "HTTP",
        "nodes": [{
            "id": "http",
            "type": "action.http",
            "config": {"kind": "action.http", "auth": {"token": "secret-token"}}
        }],
        "edges": [],
        "editor": {"positions": {}}
    }`)
	_, _, err := normalizeVisualWorkflowDefinition(raw, "HTTP")
	require.Error(t, err)
	failure := &automationError{}
	require.ErrorAs(t, err, &failure)
	require.Equal(t, "invalid_definition", failure.code)
}

func TestNormalizeVisualWorkflowDefinitionRejectsMismatchedNodeKind(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{
        "schemaVersion": 3,
        "name": "Broken",
        "nodes": [{"id": "trigger", "type": "trigger.manual", "config": {"kind": "action.http"}}],
        "edges": [],
        "editor": {"positions": {"trigger": {"x": 0, "y": 0}}}
    }`)
	_, _, err := normalizeVisualWorkflowDefinition(raw, "Broken")
	require.Error(t, err)
	failure := &automationError{}
	require.ErrorAs(t, err, &failure)
	require.Equal(t, "invalid_graph", failure.code)
}
