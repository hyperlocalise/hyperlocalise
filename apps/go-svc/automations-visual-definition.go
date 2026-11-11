package main

import (
	"encoding/json"
	"math"
	"regexp"
	"strings"
)

const (
	visualWorkflowSchemaV2   = 2
	visualWorkflowSchemaV3   = 3
	visualWorkflowMaxNodes   = 200
	visualWorkflowMaxEdges   = 400
	visualWorkflowGraphIDMax = 128
)

var (
	visualAuthField     = regexp.MustCompile(`(?i)^(authorization|cookie|password|secret|token|access[_-]?token|api[_-]?key)$`)
	visualCatalogTypeRE = regexp.MustCompile(`^[a-z0-9]+(?:[._][a-z0-9]+)+$`)
)

func emptyVisualWorkflowDefinition(name string) json.RawMessage {
	if strings.TrimSpace(name) == "" {
		name = "Untitled workflow"
	}
	raw, _ := json.Marshal(map[string]any{
		"schemaVersion": visualWorkflowSchemaV3,
		"name":          name,
		"nodes": []any{
			map[string]any{
				"id":     "trigger",
				"type":   "trigger.manual",
				"config": map[string]any{"kind": "trigger.manual"},
			},
		},
		"edges": []any{},
		"editor": map[string]any{
			"positions": map[string]any{
				"trigger": map[string]any{"x": 40, "y": 160},
			},
		},
	})
	return raw
}

func normalizeVisualWorkflowDefinition(raw json.RawMessage, fallbackName string) (json.RawMessage, string, error) {
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil || payload == nil {
		return nil, "", automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
	}
	version, ok := jsonNumber(payload["schemaVersion"])
	if !ok || version != float64(int(version)) || (int(version) != visualWorkflowSchemaV2 && int(version) != visualWorkflowSchemaV3) {
		return nil, "", automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
	}
	name, _ := payload["name"].(string)
	name = strings.TrimSpace(name)
	if name == "" {
		name = strings.TrimSpace(fallbackName)
	}
	if name == "" || utf16Length(name) > automationNameMaxChars {
		return nil, "", automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
	}
	payload["name"] = name
	nodes, err := parseVisualWorkflowNodes(payload["nodes"])
	if err != nil {
		return nil, "", err
	}
	edges, err := parseVisualWorkflowEdges(payload["edges"], int(version))
	if err != nil {
		return nil, "", err
	}
	editor, err := parseVisualWorkflowEditor(payload["editor"])
	if err != nil {
		return nil, "", err
	}
	if err := rejectLiteralHTTPCredentials(nodes); err != nil {
		return nil, "", err
	}
	normalized := map[string]any{
		"schemaVersion": visualWorkflowSchemaV3,
		"name":          name,
		"nodes":         nodes,
		"edges":         edges,
		"editor":        editor,
	}
	encoded, err := json.Marshal(normalized)
	if err != nil {
		return nil, "", automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
	}
	return encoded, name, nil
}

func parseVisualWorkflowNodes(raw any) ([]map[string]any, error) {
	items, ok := raw.([]any)
	if !ok {
		return nil, automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
	}
	if len(items) > visualWorkflowMaxNodes {
		return nil, automationFailureDetails(400, "invalid_graph", "Workflow graph is invalid.", map[string]any{
			"issues": []map[string]string{{"code": "too_many_nodes"}},
		})
	}
	nodes := make([]map[string]any, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		node, ok := item.(map[string]any)
		if !ok {
			return nil, automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
		}
		id, _ := node["id"].(string)
		nodeType, _ := node["type"].(string)
		id = strings.TrimSpace(id)
		nodeType = strings.TrimSpace(nodeType)
		if id == "" || utf16Length(id) > visualWorkflowGraphIDMax || nodeType == "" || !visualCatalogTypeRE.MatchString(nodeType) {
			return nil, automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
		}
		if _, dup := seen[id]; dup {
			return nil, automationFailureDetails(400, "invalid_graph", "Workflow graph is invalid.", map[string]any{
				"issues": []map[string]string{{"code": "duplicate_node_id", "nodeId": id}},
			})
		}
		seen[id] = struct{}{}
		config, _ := node["config"].(map[string]any)
		if config == nil {
			return nil, automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
		}
		kind, _ := config["kind"].(string)
		if strings.TrimSpace(kind) != nodeType {
			return nil, automationFailureDetails(400, "invalid_graph", "Workflow graph is invalid.", map[string]any{
				"issues": []map[string]string{{"code": "invalid_node_config", "nodeId": id}},
			})
		}
		normalized := map[string]any{"id": id, "type": nodeType, "config": config}
		if inputs, ok := node["inputs"].(map[string]any); ok {
			normalized["inputs"] = inputs
		}
		if outputFields, ok := node["outputFields"].([]any); ok {
			normalized["outputFields"] = outputFields
		}
		if bodyNodeIDs, ok := node["bodyNodeIds"].([]any); ok {
			normalized["bodyNodeIds"] = bodyNodeIDs
		}
		if collect, ok := node["collect"].(map[string]any); ok {
			normalized["collect"] = collect
		}
		nodes = append(nodes, normalized)
	}
	return nodes, nil
}

func parseVisualWorkflowEdges(raw any, version int) ([]map[string]any, error) {
	items, ok := raw.([]any)
	if !ok {
		return nil, automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
	}
	if len(items) > visualWorkflowMaxEdges {
		return nil, automationFailureDetails(400, "invalid_graph", "Workflow graph is invalid.", map[string]any{
			"issues": []map[string]string{{"code": "too_many_edges"}},
		})
	}
	edges := make([]map[string]any, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		edge, ok := item.(map[string]any)
		if !ok {
			return nil, automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
		}
		id := trimGraphID(edge["id"])
		source := trimGraphID(edge["source"])
		target := trimGraphID(edge["target"])
		if id == "" || source == "" || target == "" {
			return nil, automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
		}
		if _, dup := seen[id]; dup {
			return nil, automationFailureDetails(400, "invalid_graph", "Workflow graph is invalid.", map[string]any{
				"issues": []map[string]string{{"code": "duplicate_edge_id"}},
			})
		}
		seen[id] = struct{}{}
		kind := "execution"
		sourcePort := "success"
		targetPort := "input"
		if version == visualWorkflowSchemaV3 {
			kind, _ = edge["kind"].(string)
			sourcePort = trimGraphID(edge["sourcePortId"])
			targetPort = trimGraphID(edge["targetPortId"])
			if kind != "execution" && kind != "data" {
				return nil, automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
			}
			if sourcePort == "" || targetPort == "" {
				return nil, automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
			}
		} else {
			if handle := nullableGraphID(edge["sourceHandle"]); handle != "" {
				sourcePort = handle
			}
			if handle := nullableGraphID(edge["targetHandle"]); handle != "" {
				targetPort = handle
			}
		}
		edges = append(edges, map[string]any{
			"id":           id,
			"source":       source,
			"target":       target,
			"kind":         kind,
			"sourcePortId": sourcePort,
			"targetPortId": targetPort,
		})
	}
	return edges, nil
}

func parseVisualWorkflowEditor(raw any) (map[string]any, error) {
	editor, ok := raw.(map[string]any)
	if !ok {
		return nil, automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
	}
	positionsRaw, ok := editor["positions"].(map[string]any)
	if !ok {
		return nil, automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
	}
	positions := make(map[string]any, len(positionsRaw))
	for id, value := range positionsRaw {
		point, ok := value.(map[string]any)
		if !ok {
			return nil, automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
		}
		x, xOK := jsonNumber(point["x"])
		y, yOK := jsonNumber(point["y"])
		if !xOK || !yOK {
			return nil, automationFailure(400, "invalid_definition", "Workflow definition is invalid.")
		}
		positions[id] = map[string]any{"x": x, "y": y}
	}
	return map[string]any{"positions": positions}, nil
}

func rejectLiteralHTTPCredentials(nodes []map[string]any) error {
	for _, node := range nodes {
		nodeType, _ := node["type"].(string)
		if nodeType != "action.http" {
			continue
		}
		config, _ := node["config"].(map[string]any)
		if containsVisualSecret(config) {
			return automationFailure(400, "invalid_definition", "Use credential references for sensitive fields.")
		}
	}
	return nil
}

func containsVisualSecret(value any) bool {
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			if containsVisualSecret(item) {
				return true
			}
		}
	case map[string]any:
		for key, item := range typed {
			if visualAuthField.MatchString(key) && !isEmptyVisualValue(item) {
				return true
			}
			if containsVisualSecret(item) {
				return true
			}
		}
	}
	return false
}

func isEmptyVisualValue(value any) bool {
	if value == nil {
		return true
	}
	text, ok := value.(string)
	return ok && text == ""
}

func jsonNumber(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			return 0, false
		}
		return typed, true
	case int:
		return float64(typed), true
	case json.Number:
		parsed, err := typed.Float64()
		return parsed, err == nil
	default:
		return 0, false
	}
}

func trimGraphID(value any) string {
	text, _ := value.(string)
	text = strings.TrimSpace(text)
	if text == "" || utf16Length(text) > visualWorkflowGraphIDMax {
		return ""
	}
	return text
}

func nullableGraphID(value any) string {
	if value == nil {
		return ""
	}
	return trimGraphID(value)
}
