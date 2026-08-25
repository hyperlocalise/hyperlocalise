package translationfileparser

import (
	"encoding/json"
	"math"
	"regexp"
	"strconv"
	"strings"
)

const maxIngestEntryLength = 100_000

// IngestEntry is a parsed translation entry with optional import metadata.
type IngestEntry struct {
	Text      string
	MaxLength int
}

var maxLengthCommentPattern = regexp.MustCompile(`(?i)(?:max[\s._-]?length|character[\s._-]?limit|hl:max-length)\s*[:=]\s*(\d+)`)

// ParseMaxLengthFromComment extracts a positive max-length limit from translator comments.
func ParseMaxLengthFromComment(comment string) (int, bool) {
	comment = strings.TrimSpace(comment)
	if comment == "" {
		return 0, false
	}

	match := maxLengthCommentPattern.FindStringSubmatch(comment)
	if len(match) < 2 {
		return 0, false
	}

	value, err := strconv.Atoi(match[1])
	if err != nil || value <= 0 || value > maxIngestEntryLength {
		return 0, false
	}

	return value, true
}

func positiveIntFromJSONValue(raw any) (int, bool) {
	switch typed := raw.(type) {
	case json.Number:
		parsed, err := typed.Int64()
		if err != nil || parsed <= 0 || parsed > maxIngestEntryLength {
			return 0, false
		}
		return int(parsed), true
	case float64:
		if typed <= 0 || typed > maxIngestEntryLength || math.Trunc(typed) != typed {
			return 0, false
		}
		return int(typed), true
	case int:
		if typed <= 0 || typed > maxIngestEntryLength {
			return 0, false
		}
		return typed, true
	case int64:
		if typed <= 0 || typed > maxIngestEntryLength {
			return 0, false
		}
		return int(typed), true
	default:
		return 0, false
	}
}

func maxLengthFromObjectFields(obj map[string]any) (int, bool) {
	for _, field := range []string{"maxLength", "characterLimit"} {
		raw, ok := obj[field]
		if !ok || raw == nil {
			continue
		}
		if value, ok := positiveIntFromJSONValue(raw); ok {
			return value, true
		}
	}
	return 0, false
}

// IngestEntriesFromStringMap wraps plain key/value parser output as ingest entries.
func IngestEntriesFromStringMap(values map[string]string) map[string]IngestEntry {
	if len(values) == 0 {
		return nil
	}

	out := make(map[string]IngestEntry, len(values))
	for key, text := range values {
		out[key] = IngestEntry{Text: text}
	}
	return out
}

func applyMaxLengthByKey(entries map[string]IngestEntry, maxLengthByKey map[string]int) map[string]IngestEntry {
	if len(maxLengthByKey) == 0 {
		return entries
	}

	out := make(map[string]IngestEntry, len(entries))
	for key, entry := range entries {
		if maxLength, ok := maxLengthByKey[key]; ok && maxLength > 0 {
			entry.MaxLength = maxLength
		}
		out[key] = entry
	}
	return out
}
