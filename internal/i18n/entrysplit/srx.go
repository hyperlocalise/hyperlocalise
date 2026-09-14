package entrysplit

import (
	"fmt"
	"os"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/srx"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

// CompileSpec loads a built-in SRX template or parses a project-relative SRX 2.0 file.
func CompileSpec(spec string) (*srx.Document, error) {
	spec = srx.NormalizeSpec(spec)
	if spec == "" {
		return nil, nil
	}
	if srx.IsNamedTemplate(spec) {
		return srx.LoadTemplate(strings.ToLower(spec))
	}

	content, err := os.ReadFile(spec)
	if err != nil {
		return nil, fmt.Errorf("read srx %q: %w", spec, err)
	}
	doc, err := srx.Parse(content)
	if err != nil {
		return nil, fmt.Errorf("compile srx %q: %w", spec, err)
	}
	return doc, nil
}

// ApplyToIngestEntries splits string values into SRX span keys before translation ingest.
func ApplyToIngestEntries(
	doc *srx.Document,
	sourcePath,
	parserMode,
	language string,
	entries map[string]translationfileparser.IngestEntry,
) (map[string]translationfileparser.IngestEntry, []string, error) {
	if doc == nil || len(entries) == 0 {
		return entries, nil, nil
	}
	if !srx.FormatSupports(sourcePath, parserMode) {
		return entries, []string{
			fmt.Sprintf("srx ignored for %s: format is already segmented or incompatible", sourcePath),
		}, nil
	}

	textByKey := make(map[string]string, len(entries))
	for key, entry := range entries {
		textByKey[key] = entry.Text
	}
	if reserved := srx.ReservedSpanKeys(textByKey); len(reserved) > 0 {
		return nil, nil, fmt.Errorf(
			"source %q has keys that collide with reserved srx span keys: %s",
			sourcePath,
			strings.Join(reserved, ", "),
		)
	}

	split := make(map[string]translationfileparser.IngestEntry, len(entries))
	for key, entry := range entries {
		if srx.ShouldSkipValue(entry.Text, parserMode) {
			split[key] = entry
			continue
		}
		spans := doc.Segment(entry.Text, language)
		if len(spans) <= 1 {
			split[key] = entry
			continue
		}
		for index, span := range spans {
			spanKey := srx.SpanKey(key, index)
			split[spanKey] = translationfileparser.IngestEntry{
				Text:        span.Text,
				MaxLength:   entry.MaxLength,
				Fingerprint: entry.Fingerprint,
				Path:        entry.Path,
				Kind:        entry.Kind,
				Format:      entry.Format,
			}
		}
	}
	return split, nil, nil
}
