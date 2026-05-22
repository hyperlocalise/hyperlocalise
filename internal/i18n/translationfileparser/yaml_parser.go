package translationfileparser

import (
	"bytes"
	"fmt"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// YAMLParser parses YAML locale files into the same flattened key/value shape
// as JSONParser. Nested mappings use dotted keys, and sequences use [index].
type YAMLParser struct{}

func (p YAMLParser) Parse(content []byte) (map[string]string, error) {
	root, err := decodeYAMLDocument(content)
	if err != nil {
		return nil, err
	}
	if root == nil {
		return map[string]string{}, nil
	}

	out := make(map[string]string)
	if err := flattenYAMLNode(out, "", root); err != nil {
		return nil, err
	}
	return out, nil
}

func decodeYAMLDocument(content []byte) (*yaml.Node, error) {
	trimmed := bytes.TrimSpace(content)
	if len(trimmed) == 0 {
		return nil, nil
	}

	var doc yaml.Node
	if err := yaml.Unmarshal(content, &doc); err != nil {
		return nil, fmt.Errorf("yaml decode: %w", err)
	}

	root := yamlDocumentRoot(&doc)
	if root == nil || isYAMLNull(root) {
		return nil, nil
	}
	if root.Kind != yaml.MappingNode {
		return nil, fmt.Errorf("yaml root must be mapping, got %s", yamlNodeKindName(root.Kind))
	}
	return root, nil
}

func yamlDocumentRoot(doc *yaml.Node) *yaml.Node {
	if doc == nil {
		return nil
	}
	if doc.Kind == yaml.DocumentNode {
		if len(doc.Content) == 0 {
			return nil
		}
		return doc.Content[0]
	}
	return doc
}

func flattenYAMLNode(out map[string]string, prefix string, node *yaml.Node) error {
	switch node.Kind {
	case yaml.MappingNode:
		return flattenYAMLMapping(out, prefix, node)
	case yaml.SequenceNode:
		return flattenYAMLSequence(out, prefix, node)
	case yaml.ScalarNode:
		if node.Tag != "!!str" {
			return fmt.Errorf("yaml key %q must be string, sequence, or mapping, got %s", prefix, yamlNodeTagName(node))
		}
		if prefix == "" {
			return fmt.Errorf("yaml root must be mapping, got scalar")
		}
		if _, exists := out[prefix]; exists {
			return fmt.Errorf("yaml key %q appears more than once after flattening", prefix)
		}
		out[prefix] = node.Value
		return nil
	case yaml.AliasNode:
		return fmt.Errorf("yaml key %q uses alias/anchor, which is not supported for locale files", prefix)
	default:
		return fmt.Errorf("yaml key %q must be string, sequence, or mapping, got %s", prefix, yamlNodeKindName(node.Kind))
	}
}

func flattenYAMLMapping(out map[string]string, prefix string, node *yaml.Node) error {
	for i := 0; i+1 < len(node.Content); i += 2 {
		keyNode := node.Content[i]
		valueNode := node.Content[i+1]
		key, err := yamlMappingKey(keyNode, prefix)
		if err != nil {
			return err
		}

		nextKey := key
		if prefix != "" {
			nextKey = prefix + "." + key
		}
		if err := flattenYAMLNode(out, nextKey, valueNode); err != nil {
			return err
		}
	}
	return nil
}

func flattenYAMLSequence(out map[string]string, prefix string, node *yaml.Node) error {
	if prefix == "" {
		return fmt.Errorf("yaml root must be mapping, got sequence")
	}
	for idx, item := range node.Content {
		// BOLT OPTIMIZATION: Use string concatenation and strconv.Itoa instead of fmt.Sprintf
		// to reduce allocation and formatting overhead in recursive flattening.
		nextKey := prefix + "[" + strconv.Itoa(idx) + "]"
		if err := flattenYAMLNode(out, nextKey, item); err != nil {
			return err
		}
	}
	return nil
}

func yamlMappingKey(node *yaml.Node, parent string) (string, error) {
	label := yamlMappingParentLabel(parent)
	if node.Kind != yaml.ScalarNode {
		return "", fmt.Errorf("yaml mapping under %q must use scalar string keys, got %s", label, yamlNodeKindName(node.Kind))
	}
	key := strings.TrimSpace(node.Value)
	if key == "" {
		return "", fmt.Errorf("yaml mapping under %q has an empty key", label)
	}
	if strings.ContainsAny(key, ".[]") {
		return "", fmt.Errorf("yaml mapping under %q has unsupported key %q: keys cannot contain '.', '[' or ']'", label, key)
	}
	return key, nil
}

func yamlMappingParentLabel(parent string) string {
	if parent == "" {
		return "(root)"
	}
	return parent
}

func yamlNodeKindName(kind yaml.Kind) string {
	switch kind {
	case yaml.DocumentNode:
		return "document"
	case yaml.SequenceNode:
		return "sequence"
	case yaml.MappingNode:
		return "mapping"
	case yaml.ScalarNode:
		return "scalar"
	case yaml.AliasNode:
		return "alias"
	default:
		// BOLT OPTIMIZATION: Use string concatenation and strconv.Itoa instead of fmt.Sprintf.
		return "unknown(" + strconv.Itoa(int(kind)) + ")"
	}
}

func yamlNodeTagName(node *yaml.Node) string {
	if node == nil {
		return "<nil>"
	}
	if strings.TrimSpace(node.Tag) == "" {
		return yamlNodeKindName(node.Kind)
	}
	return node.Tag
}

func isYAMLNull(node *yaml.Node) bool {
	return node.Kind == yaml.ScalarNode && node.Tag == "!!null"
}
