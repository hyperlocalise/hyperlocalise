package translationfileparser

import "encoding/json"

// EntriesCommandOutputValue is the JSON shape emitted by `hl entries` for one key.
// Keys without metadata stay plain strings for backward compatibility.
type EntriesCommandOutputValue any

// EncodeEntriesCommandOutput renders ingest entries for `hl entries` JSON output.
func EncodeEntriesCommandOutput(entries map[string]IngestEntry) map[string]EntriesCommandOutputValue {
	if len(entries) == 0 {
		return map[string]EntriesCommandOutputValue{}
	}

	out := make(map[string]EntriesCommandOutputValue, len(entries))
	for key, entry := range entries {
		if entry.MaxLength > 0 {
			out[key] = map[string]any{
				"text":      entry.Text,
				"maxLength": entry.MaxLength,
			}
			continue
		}
		out[key] = entry.Text
	}
	return out
}

func decodeEntriesCommandOutput(raw map[string]json.RawMessage) (map[string]IngestEntry, error) {
	if len(raw) == 0 {
		return map[string]IngestEntry{}, nil
	}

	out := make(map[string]IngestEntry, len(raw))
	for key, value := range raw {
		var text string
		if err := json.Unmarshal(value, &text); err == nil {
			out[key] = IngestEntry{Text: text}
			continue
		}

		var enriched struct {
			Text      string `json:"text"`
			MaxLength int    `json:"maxLength"`
		}
		if err := json.Unmarshal(value, &enriched); err != nil {
			return nil, err
		}
		out[key] = IngestEntry{
			Text:      enriched.Text,
			MaxLength: enriched.MaxLength,
		}
	}
	return out, nil
}
