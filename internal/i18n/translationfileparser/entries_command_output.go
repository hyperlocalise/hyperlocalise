package translationfileparser

// EntriesCommandOutputValue is the JSON shape emitted by `hl entries` for one key.
// Keys without metadata stay plain strings for backward compatibility.
type EntriesCommandOutputValue any

func ingestEntryNeedsObject(entry IngestEntry) bool {
	return entry.MaxLength > 0 ||
		entry.Fingerprint != "" ||
		entry.Path != "" ||
		entry.Kind != "" ||
		entry.Format != ""
}

func ingestEntryObject(entry IngestEntry) map[string]any {
	payload := map[string]any{
		"text": entry.Text,
	}
	if entry.MaxLength > 0 {
		payload["maxLength"] = entry.MaxLength
	}
	if entry.Fingerprint != "" {
		payload["fingerprint"] = entry.Fingerprint
	}
	if entry.Path != "" {
		payload["path"] = entry.Path
	}
	if entry.Kind != "" {
		payload["kind"] = entry.Kind
	}
	if entry.Format != "" {
		payload["format"] = entry.Format
	}
	return payload
}

// EncodeEntriesCommandOutput renders ingest entries for `hl entries` JSON output.
func EncodeEntriesCommandOutput(entries map[string]IngestEntry) map[string]EntriesCommandOutputValue {
	if len(entries) == 0 {
		return map[string]EntriesCommandOutputValue{}
	}

	out := make(map[string]EntriesCommandOutputValue, len(entries))
	for key, entry := range entries {
		if ingestEntryNeedsObject(entry) {
			out[key] = ingestEntryObject(entry)
			continue
		}
		out[key] = entry.Text
	}
	return out
}
