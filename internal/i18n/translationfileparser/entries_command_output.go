package translationfileparser

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
