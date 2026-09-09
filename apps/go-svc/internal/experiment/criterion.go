package experiment

import (
	"encoding/json"
	"fmt"
	"strings"
)

type criterionNode struct {
	Type  string `json:"type"`
	Name  string `json:"name"`
	Match string `json:"match"`
	// Value uses `any` instead of `json.RawMessage` so primitive values (strings, numbers, slices)
	// are decoded in a single pass during tree unmarshaling, eliminating secondary json.Unmarshal
	// calls during evaluation.
	Value    any             `json:"value"`
	Children []criterionNode `json:"children"`
}

func evaluateCriterion(raw json.RawMessage, attributes map[string]any) (bool, error) {
	// Guard against empty or "null" JSON without allocating string copies for non-null inputs.
	if len(raw) == 0 || (len(raw) == 4 && string(raw) == "null") {
		return true, nil
	}
	var node criterionNode
	if err := json.Unmarshal(raw, &node); err != nil {
		return false, fmt.Errorf("parse criterion: %w", err)
	}
	return evalNode(node, attributes)
}

func evalNode(node criterionNode, attributes map[string]any) (bool, error) {
	switch node.Type {
	case "and":
		for _, child := range node.Children {
			ok, err := evalNode(child, attributes)
			if err != nil || !ok {
				return ok, err
			}
		}
		return true, nil
	case "or":
		if len(node.Children) == 0 {
			return false, nil
		}
		for _, child := range node.Children {
			ok, err := evalNode(child, attributes)
			if err != nil {
				return false, err
			}
			if ok {
				return true, nil
			}
		}
		return false, nil
	case "not":
		if len(node.Children) == 0 {
			return true, nil
		}
		ok, err := evalNode(node.Children[0], attributes)
		if err != nil {
			return false, err
		}
		return !ok, nil
	case "attribute":
		return evalAttribute(node, attributes)
	default:
		return false, fmt.Errorf("unknown criterion type %q", node.Type)
	}
}

func evalAttribute(node criterionNode, attributes map[string]any) (bool, error) {
	value, exists := attributes[node.Name]
	switch node.Match {
	case "is_null":
		return !exists || value == nil, nil
	case "is_not_null":
		return exists && value != nil, nil
	case "exact":
		return exists && valuesEqual(value, node.Value), nil
	case "gt", "gte", "lt", "lte":
		left, leftOK := asFloat(value)
		right, rightOK := asFloat(node.Value)
		if !leftOK || !rightOK {
			return false, nil
		}
		switch node.Match {
		case "gt":
			return left > right, nil
		case "gte":
			return left >= right, nil
		case "lt":
			return left < right, nil
		default:
			return left <= right, nil
		}
	case "in":
		var needleStr string
		if str, ok := value.(string); ok {
			needleStr = str
		} else {
			needleStr = fmt.Sprint(value)
		}
		return containsAny(asStringSlice(node.Value), needleStr), nil
	case "contains_substring":
		haystack, ok := value.(string)
		needle, needleOK := node.Value.(string)
		return ok && needleOK && strings.Contains(haystack, needle), nil
	case "contains_any":
		return intersects(asStringSlice(value), asStringSlice(node.Value)), nil
	case "contains_substring_any":
		haystack, ok := value.(string)
		if !ok {
			return false, nil
		}
		for _, needle := range asStringSlice(node.Value) {
			if strings.Contains(haystack, needle) {
				return true, nil
			}
		}
		return false, nil
	default:
		return false, fmt.Errorf("unknown match %q", node.Match)
	}
}

func valuesEqual(left, right any) bool {
	if left == nil || right == nil {
		return left == right
	}
	if leftNum, leftOK := asFloat(left); leftOK {
		rightNum, rightOK := asFloat(right)
		return rightOK && leftNum == rightNum
	}
	switch typed := left.(type) {
	case bool:
		rightBool, ok := right.(bool)
		return ok && typed == rightBool
	case string:
		rightString, ok := right.(string)
		return ok && typed == rightString
	default:
		return false
	}
}

func asFloat(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case json.Number:
		n, err := typed.Float64()
		return n, err == nil
	default:
		return 0, false
	}
}

func asStringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			// Prefer direct string assertion to avoid fmt.Sprint allocations for string items.
			if str, ok := item.(string); ok {
				out = append(out, str)
			} else {
				out = append(out, fmt.Sprint(item))
			}
		}
		return out
	case string:
		return []string{typed}
	case nil:
		return nil
	default:
		return []string{fmt.Sprint(typed)}
	}
}

func containsAny(haystack []string, needle string) bool {
	for _, item := range haystack {
		if item == needle {
			return true
		}
	}
	return false
}

func intersects(left, right []string) bool {
	if len(left) == 0 || len(right) == 0 {
		return false
	}
	// Small slice fast path: avoid map allocation for small sets.
	if len(left)*len(right) <= 16 {
		for _, x := range left {
			for _, y := range right {
				if x == y {
					return true
				}
			}
		}
		return false
	}
	set := make(map[string]struct{}, len(left))
	for _, item := range left {
		set[item] = struct{}{}
	}
	for _, item := range right {
		if _, ok := set[item]; ok {
			return true
		}
	}
	return false
}
