package translationfileparser

import (
	"bytes"
	"encoding/json"
	"strings"

	"github.com/tidwall/jsonc"
)

// JSONCParser parses JSONC translation files by stripping comments/trailing commas
// before delegating to the JSON parser logic.
type JSONCParser struct{}

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
	// BOLT OPTIMIZATION: Avoid bytes.Split(content, []byte("\n")) to reduce allocations for large files.
	stack := []string{}
	stackPrefix := ""
	pendingComments := []string{}
	contexts := map[string]string{}
	inBlockComment := false

	s := content
	for len(s) > 0 {
		var rawLine []byte
		idx := bytes.IndexByte(s, '\n')
		if idx < 0 {
			rawLine = s
			s = nil
		} else {
			rawLine = s[:idx]
			s = s[idx+1:]
		}

		line := bytes.TrimSpace(rawLine)
		if len(line) == 0 {
			continue
		}

		if inBlockComment {
			if idx := bytes.Index(line, []byte("*/")); idx >= 0 {
				comment := cleanJSONCCommentText(line[:idx])
				if comment != "" {
					pendingComments = append(pendingComments, comment)
				}
				line = bytes.TrimSpace(line[idx+2:])
				inBlockComment = false
				if len(line) == 0 {
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

		if bytes.HasPrefix(line, []byte("//")) {
			comment := cleanJSONCCommentText(line)
			if comment != "" {
				pendingComments = append(pendingComments, comment)
			}
			continue
		}
		if bytes.HasPrefix(line, []byte("/*")) {
			end := bytes.Index(line[2:], []byte("*/"))
			if end >= 0 {
				comment := cleanJSONCCommentText(line[:end+4])
				if comment != "" {
					pendingComments = append(pendingComments, comment)
				}
				line = bytes.TrimSpace(line[end+4:])
				if len(line) == 0 {
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
			line = bytes.TrimSpace(line[:idx])
		}

		for len(line) > 0 && line[0] == '}' {
			if len(stack) > 0 {
				// BOLT OPTIMIZATION: Avoid repeated strings.Join(stack, ".") by incrementally updating stackPrefix.
				popped := stack[len(stack)-1]
				stack = stack[:len(stack)-1]
				stackPrefix = stackPrefix[:len(stackPrefix)-len(popped)-1]
				pendingComments = nil
			}
			line = bytes.TrimSpace(line[1:])
		}

		// BOLT OPTIMIZATION: Manual scan for JSON object key/value pair avoids regex overhead.
		// Expected format: "key": value
		key, valuePart, ok := scanJSONCKeyLine(line)
		if !ok {
			continue
		}

		decodedKey, err := decodeJSONKey(key)
		if err != nil {
			continue
		}
		fullKey := stackPrefix + decodedKey

		if len(pendingComments) > 0 {
			// BOLT OPTIMIZATION: Fast-path for single comments to avoid strings.Join.
			if len(pendingComments) == 1 {
				contexts[fullKey] = pendingComments[0]
			} else {
				contexts[fullKey] = strings.Join(pendingComments, "\n")
			}
			pendingComments = nil
		}
		if inlineComment != "" {
			if existing := strings.TrimSpace(contexts[fullKey]); existing != "" {
				contexts[fullKey] = existing + "\n" + inlineComment
			} else {
				contexts[fullKey] = inlineComment
			}
		}

		if bytes.HasPrefix(valuePart, []byte("{")) && jsoncObjectValueSpansMultipleLines(valuePart) {
			// BOLT OPTIMIZATION: Avoid repeated strings.Join(stack, ".") by incrementally updating stackPrefix.
			stack = append(stack, decodedKey)
			stackPrefix += decodedKey + "."
		}
	}

	if len(contexts) == 0 {
		return nil
	}
	return contexts
}

func scanJSONCKeyLine(line []byte) (string, []byte, bool) {
	if len(line) == 0 || line[0] != '"' {
		return "", nil, false
	}

	// Find the end of the quoted key.
	escaped := false
	endKey := -1
	for i := 1; i < len(line); i++ {
		if escaped {
			escaped = false
			continue
		}
		if line[i] == '\\' {
			escaped = true
			continue
		}
		if line[i] == '"' {
			endKey = i
			break
		}
	}

	if endKey == -1 {
		return "", nil, false
	}

	// Look for the colon.
	remaining := line[endKey+1:]
	colonIdx := bytes.IndexByte(remaining, ':')
	if colonIdx == -1 {
		return "", nil, false
	}

	// Check if only whitespace exists between end quote and colon.
	for i := 0; i < colonIdx; i++ {
		ch := remaining[i]
		if ch != ' ' && ch != '\t' && ch != '\n' && ch != '\r' {
			return "", nil, false
		}
	}

	// Extract the key (without surrounding quotes).
	key := string(line[1:endKey])
	valuePart := bytes.TrimSpace(remaining[colonIdx+1:])

	return key, valuePart, true
}

func decodeJSONKey(raw string) (string, error) {
	// BOLT OPTIMIZATION: Fast-path for simple keys without escape sequences or quotes.
	// This avoids expensive json.Unmarshal for the majority of keys.
	if strings.IndexByte(raw, '\\') == -1 && strings.IndexByte(raw, '"') == -1 {
		return raw, nil
	}

	var decoded string
	err := json.Unmarshal([]byte("\""+raw+"\""), &decoded)
	if err != nil {
		return "", err
	}
	return decoded, nil
}

func cleanJSONCCommentText(comment []byte) string {
	comment = bytes.TrimSpace(comment)
	comment = bytes.TrimPrefix(comment, []byte("//"))
	comment = bytes.TrimPrefix(comment, []byte("/*"))
	comment = bytes.TrimSuffix(comment, []byte("*/"))
	comment = bytes.TrimSpace(comment)
	return string(comment)
}

func indexJSONCLineComment(line []byte) int {
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

func jsoncObjectValueSpansMultipleLines(valuePart []byte) bool {
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
