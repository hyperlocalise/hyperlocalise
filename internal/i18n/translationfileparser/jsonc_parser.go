package translationfileparser

import (
	"bytes"
	"encoding/json"
	"regexp"
	"strings"

	"github.com/tidwall/jsonc"
)

// JSONCParser parses JSONC translation files by stripping comments/trailing commas
// before delegating to the JSON parser logic.
type JSONCParser struct{}

var jsoncObjectKeyPattern = regexp.MustCompile(`^"((?:\\.|[^"\\])*)"\s*:\s*(.*)$`)

func (p JSONCParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	if err != nil {
		return nil, err
	}
	return values, nil
}

func (p JSONCParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	values, contextByKey, err := (JSONParser{}).ParseWithContext(jsonc.ToJSON(content))
	if err != nil {
		return nil, nil, err
	}

	commentContext := parseJSONCKeyComments(content)
	if len(commentContext) == 0 {
		return values, contextByKey, nil
	}
	if contextByKey == nil {
		contextByKey = map[string]string{}
	}
	for key, comment := range commentContext {
		if strings.TrimSpace(contextByKey[key]) != "" {
			continue
		}
		if strings.TrimSpace(values[key]) == "" {
			continue
		}
		contextByKey[key] = comment
	}
	if len(contextByKey) == 0 {
		return values, nil, nil
	}
	return values, contextByKey, nil
}

func parseJSONCKeyComments(content []byte) map[string]string {
	lines := bytes.Split(content, []byte("\n"))
	stack := []string{}
	pendingComments := []string{}
	contexts := map[string]string{}
	inBlockComment := false

	for _, rawLine := range lines {
		line := strings.TrimSpace(string(rawLine))
		if line == "" {
			continue
		}

		if inBlockComment {
			if idx := strings.Index(line, "*/"); idx >= 0 {
				comment := cleanJSONCCommentText(line[:idx])
				if comment != "" {
					pendingComments = append(pendingComments, comment)
				}
				line = strings.TrimSpace(line[idx+2:])
				inBlockComment = false
				if line == "" {
					continue
				}
			} else {
				comment := cleanJSONCCommentText(line)
				if comment != "" {
					pendingComments = append(pendingComments, comment)
				}
				continue
			}
		}

		if strings.HasPrefix(line, "//") {
			comment := cleanJSONCCommentText(line)
			if comment != "" {
				pendingComments = append(pendingComments, comment)
			}
			continue
		}
		if strings.HasPrefix(line, "/*") {
			end := strings.Index(line[2:], "*/")
			if end >= 0 {
				comment := cleanJSONCCommentText(line[:end+4])
				if comment != "" {
					pendingComments = append(pendingComments, comment)
				}
				line = strings.TrimSpace(line[end+4:])
				if line == "" {
					continue
				}
			} else {
				comment := cleanJSONCCommentText(line)
				if comment != "" {
					pendingComments = append(pendingComments, comment)
				}
				inBlockComment = true
				continue
			}
		}

		inlineComment := ""
		if idx := indexJSONCLineComment(line); idx >= 0 {
			inlineComment = cleanJSONCCommentText(line[idx:])
			line = strings.TrimSpace(line[:idx])
		}

		for len(line) > 0 && line[0] == '}' {
			if len(stack) > 0 {
				stack = stack[:len(stack)-1]
				pendingComments = nil
			}
			line = strings.TrimSpace(line[1:])
		}

		matches := jsoncObjectKeyPattern.FindStringSubmatch(line)
		if len(matches) == 0 {
			continue
		}

		decodedKey, err := decodeJSONKey(matches[1])
		if err != nil {
			continue
		}
		fullKey := decodedKey
		if len(stack) > 0 {
			fullKey = strings.Join(append(append([]string(nil), stack...), decodedKey), ".")
		}

		if len(pendingComments) > 0 {
			contexts[fullKey] = strings.Join(pendingComments, "\n")
			pendingComments = nil
		}
		if inlineComment != "" {
			if existing := strings.TrimSpace(contexts[fullKey]); existing != "" {
				contexts[fullKey] = existing + "\n" + inlineComment
			} else {
				contexts[fullKey] = inlineComment
			}
		}

		valuePart := strings.TrimSpace(matches[2])
		if strings.HasPrefix(valuePart, "{") && jsoncObjectValueSpansMultipleLines(valuePart) {
			stack = append(stack, decodedKey)
		}
	}

	if len(contexts) == 0 {
		return nil
	}
	return contexts
}

func decodeJSONKey(raw string) (string, error) {
	var decoded string
	err := json.Unmarshal([]byte("\""+raw+"\""), &decoded)
	if err != nil {
		return "", err
	}
	return decoded, nil
}

func cleanJSONCCommentText(comment string) string {
	comment = strings.TrimSpace(comment)
	comment = strings.TrimPrefix(comment, "//")
	comment = strings.TrimPrefix(comment, "/*")
	comment = strings.TrimSuffix(comment, "*/")
	comment = strings.TrimSpace(comment)
	return comment
}

func indexJSONCLineComment(line string) int {
	inString := false
	escaped := false

	for i := 0; i < len(line)-1; i++ {
		ch := line[i]

		if inString {
			if escaped {
				escaped = false
				continue
			}
			if ch == '\\' {
				escaped = true
				continue
			}
			if ch == '"' {
				inString = false
			}
			continue
		}

		if ch == '"' {
			inString = true
			continue
		}
		if ch == '/' && line[i+1] == '/' {
			return i
		}
	}

	return -1
}

func jsoncObjectValueSpansMultipleLines(valuePart string) bool {
	depth := 0
	inString := false
	escaped := false

	for i := 0; i < len(valuePart); i++ {
		ch := valuePart[i]

		if inString {
			if escaped {
				escaped = false
				continue
			}
			if ch == '\\' {
				escaped = true
				continue
			}
			if ch == '"' {
				inString = false
			}
			continue
		}

		switch ch {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			if depth > 0 {
				depth--
			}
		}
	}

	return depth > 0
}
