package translationfileparser

import (
	"bytes"
	"fmt"

	"gopkg.in/yaml.v3"
)

// MarshalYAML rewrites string leaves in a YAML locale template while keeping
// existing key order and comments carried by yaml.Node where possible. Output
// is re-encoded by yaml.v3 using the template's detected space indentation,
// falling back to 2 spaces when the template has no nested indentation.
func MarshalYAML(template []byte, values map[string]string) ([]byte, error) {
	return marshalYAML(template, values, nil)
}

// MarshalYAMLWithPrune rewrites YAML string leaves and removes mapping string
// leaves that are not present in pruneKeys. Sequence entries are not pruned so
// indexes stay stable, matching JSON array writeback behavior. Output uses the
// same indentation detection as MarshalYAML.
func MarshalYAMLWithPrune(template []byte, values map[string]string, pruneKeys map[string]struct{}) ([]byte, error) {
	return marshalYAML(template, values, pruneKeys)
}

func marshalYAML(template []byte, values map[string]string, pruneKeys map[string]struct{}) ([]byte, error) {
	var doc yaml.Node
	if len(bytes.TrimSpace(template)) == 0 {
		return nil, fmt.Errorf("yaml decode: empty YAML document")
	}
	if err := yaml.Unmarshal(template, &doc); err != nil {
		return nil, fmt.Errorf("yaml decode: %w", err)
	}

	root := yamlDocumentRoot(&doc)
	if root == nil || isYAMLNull(root) {
		return nil, fmt.Errorf("yaml root must be mapping, got null")
	}
	if root.Kind != yaml.MappingNode {
		return nil, fmt.Errorf("yaml root must be mapping, got %s", yamlNodeKindName(root.Kind))
	}
	if err := validateYAMLMarshalTemplate(root); err != nil {
		return nil, fmt.Errorf("yaml validate template: %w", err)
	}
	if pruneKeys != nil {
		pruneYAMLMappingStringFields(root, "", pruneKeys)
	}
	if err := rewriteYAMLNode(root, "", values); err != nil {
		return nil, err
	}

	var out bytes.Buffer
	encoder := yaml.NewEncoder(&out)
	encoder.SetIndent(detectYAMLIndent(template, 2))
	if err := encoder.Encode(&doc); err != nil {
		_ = encoder.Close()
		return nil, fmt.Errorf("yaml encode: %w", err)
	}
	if err := encoder.Close(); err != nil {
		return nil, fmt.Errorf("yaml encode: %w", err)
	}
	return out.Bytes(), nil
}

func validateYAMLMarshalTemplate(root *yaml.Node) error {
	entries := make(map[string]string)
	return flattenYAMLNode(entries, "", root)
}

func detectYAMLIndent(template []byte, fallback int) int {
	if fallback <= 0 {
		fallback = 2
	}

	minIndent := 0
	inBlockScalar := false
	blockIndent := 0
	for _, line := range bytes.Split(template, []byte{'\n'}) {
		trimmed := bytes.TrimSpace(line)
		if len(trimmed) == 0 {
			continue
		}

		indent := 0
		for indent < len(line) && line[indent] == ' ' {
			indent++
		}

		if inBlockScalar {
			if indent > blockIndent {
				continue
			}
			inBlockScalar = false
		}

		if bytes.HasPrefix(trimmed, []byte("#")) {
			continue
		}

		// Skip lines that are unlikely to be YAML mapping keys, such as
		// plain scalar continuation lines.
		if !bytes.Contains(trimmed, []byte(": ")) && !bytes.HasSuffix(trimmed, []byte(":")) &&
			!bytes.HasPrefix(trimmed, []byte("- ")) && !bytes.Equal(trimmed, []byte("-")) {
			continue
		}

		trimmed = bytes.TrimRight(trimmed, " \t")
		if isYAMLBlockScalarLine(trimmed) {
			inBlockScalar = true
			blockIndent = indent
		}

		if indent == 0 {
			continue
		}
		if minIndent == 0 || indent < minIndent {
			minIndent = indent
		}
	}
	if minIndent > 0 {
		return minIndent
	}
	return fallback
}

func isYAMLBlockScalarLine(line []byte) bool {
	separator := bytes.LastIndex(line, []byte(": "))
	if separator == -1 {
		return false
	}

	indicator := line[separator+2:]
	stripped := bytes.TrimRight(indicator, "-+0123456789")
	return bytes.Equal(stripped, []byte("|")) || bytes.Equal(stripped, []byte(">"))
}

func pruneYAMLMappingStringFields(node *yaml.Node, prefix string, allowed map[string]struct{}) bool {
	if node.Kind != yaml.MappingNode {
		return true
	}

	pruned := node.Content[:0]
	for i := 0; i+1 < len(node.Content); i += 2 {
		keyNode := node.Content[i]
		valueNode := node.Content[i+1]
		key, err := yamlMappingKey(keyNode, prefix)
		if err != nil {
			pruned = append(pruned, keyNode, valueNode)
			continue
		}
		nextKey := key
		if prefix != "" {
			nextKey = prefix + "." + key
		}

		keep := true
		switch valueNode.Kind {
		case yaml.ScalarNode:
			if valueNode.Tag == "!!str" {
				_, keep = allowed[nextKey]
			}
		case yaml.MappingNode:
			keep = pruneYAMLMappingStringFields(valueNode, nextKey, allowed)
		case yaml.SequenceNode:
			// Keep sequence-valued keys as a whole; pruning individual entries
			// would shift indexes and make subsequent writes unstable.
			keep = true
		}
		if keep {
			pruned = append(pruned, keyNode, valueNode)
		}
	}
	node.Content = pruned
	return len(node.Content) > 0
}

func rewriteYAMLNode(node *yaml.Node, prefix string, values map[string]string) error {
	switch node.Kind {
	case yaml.MappingNode:
		return rewriteYAMLMapping(node, prefix, values)
	case yaml.SequenceNode:
		return rewriteYAMLSequence(node, prefix, values)
	case yaml.ScalarNode:
		if node.Tag != "!!str" {
			return fmt.Errorf("yaml key %q must be string, sequence, or mapping, got %s", prefix, yamlNodeTagName(node))
		}
		if replacement, ok := values[prefix]; ok {
			node.Value = replacement
		}
		return nil
	case yaml.AliasNode:
		return fmt.Errorf("yaml key %q uses alias/anchor, which is not supported for locale files", prefix)
	default:
		return fmt.Errorf("yaml key %q must be string, sequence, or mapping, got %s", prefix, yamlNodeKindName(node.Kind))
	}
}

func rewriteYAMLMapping(node *yaml.Node, prefix string, values map[string]string) error {
	for i := 0; i+1 < len(node.Content); i += 2 {
		key, err := yamlMappingKey(node.Content[i], prefix)
		if err != nil {
			return err
		}
		nextKey := key
		if prefix != "" {
			nextKey = prefix + "." + key
		}
		if err := rewriteYAMLNode(node.Content[i+1], nextKey, values); err != nil {
			return err
		}
	}
	return nil
}

func rewriteYAMLSequence(node *yaml.Node, prefix string, values map[string]string) error {
	if prefix == "" {
		return fmt.Errorf("yaml root must be mapping, got sequence")
	}
	for idx, item := range node.Content {
		nextKey := fmt.Sprintf("%s[%d]", prefix, idx)
		if err := rewriteYAMLNode(item, nextKey, values); err != nil {
			return err
		}
	}
	return nil
}
