package runsvc

import (
	"fmt"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/srx"
)

func resolveMappingSRXSpec(override, mapping string) string {
	if spec := strings.TrimSpace(override); spec != "" {
		return spec
	}
	return strings.TrimSpace(mapping)
}

func (s *Service) compileSRX(spec string) (*srx.Document, string, error) {
	spec = srx.NormalizeSpec(spec)
	if spec == "" {
		return nil, "", nil
	}
	if srx.IsNamedTemplate(spec) {
		spec = strings.ToLower(spec)
	}
	if s.srxDocs == nil {
		s.srxDocs = map[string]*compiledSRX{}
	}
	if cached, ok := s.srxDocs[spec]; ok {
		return cached.doc, cached.fingerprint, nil
	}

	var (
		doc *srx.Document
		err error
	)
	if srx.IsNamedTemplate(spec) {
		doc, err = srx.LoadTemplate(spec)
	} else {
		path := s.resolveProjectPattern(spec)
		content, readErr := s.readProjectFile(path)
		if readErr != nil {
			return nil, "", fmt.Errorf("read srx %q: %w", spec, readErr)
		}
		doc, err = srx.Parse(content)
	}
	if err != nil {
		return nil, "", fmt.Errorf("compile srx %q: %w", spec, err)
	}
	compiled := &compiledSRX{doc: doc, fingerprint: doc.Fingerprint()}
	s.srxDocs[spec] = compiled
	return compiled.doc, compiled.fingerprint, nil
}

func applySRXToEntries(doc *srx.Document, sourcePath, parserMode, language string, entries, contextByKey map[string]string) (map[string]string, map[string]string, []string, error) {
	if doc == nil || len(entries) == 0 {
		return entries, contextByKey, nil, nil
	}
	if !srx.FormatSupports(sourcePath, parserMode) {
		return entries, contextByKey, []string{
			fmt.Sprintf("srx ignored for %s: format is already segmented or incompatible", sourcePath),
		}, nil
	}
	if reserved := srx.ReservedSpanKeys(entries); len(reserved) > 0 {
		return nil, nil, nil, fmt.Errorf("source %q has keys that collide with reserved srx span keys: %s", sourcePath, strings.Join(reserved, ", "))
	}

	splitEntries := make(map[string]string, len(entries))
	splitContext := make(map[string]string, len(contextByKey))
	for key, text := range entries {
		if srx.ShouldSkipValue(text, parserMode) {
			splitEntries[key] = text
			if ctx, ok := contextByKey[key]; ok {
				splitContext[key] = ctx
			}
			continue
		}
		spans := doc.Segment(text, language)
		if len(spans) <= 1 {
			splitEntries[key] = text
			if ctx, ok := contextByKey[key]; ok {
				splitContext[key] = ctx
			}
			continue
		}
		for index, span := range spans {
			spanKey := srx.SpanKey(key, index)
			splitEntries[spanKey] = span.Text
			if ctx, ok := contextByKey[key]; ok {
				splitContext[spanKey] = ctx
			}
		}
	}
	return splitEntries, splitContext, nil, nil
}

func joinSRXStagedEntries(doc *srx.Document, sourcePath, parserMode, sourceLocale, targetLocale string, sourceEntries, staged, existing map[string]string) map[string]string {
	if doc == nil || !srx.FormatSupports(sourcePath, parserMode) {
		return staged
	}

	joined := make(map[string]string, len(sourceEntries))
	for fileKey, sourceText := range sourceEntries {
		if srx.ShouldSkipValue(sourceText, parserMode) {
			if value, ok := staged[fileKey]; ok {
				joined[fileKey] = value
			}
			continue
		}
		spans := doc.Segment(sourceText, sourceLocale)
		if len(spans) <= 1 {
			if value, ok := staged[fileKey]; ok {
				joined[fileKey] = value
			}
			continue
		}

		translations := make([]string, len(spans))
		haveStaged := false
		for index := range spans {
			if value, ok := staged[srx.SpanKey(fileKey, index)]; ok {
				translations[index] = value
				haveStaged = true
			}
		}
		if !haveStaged {
			if value, ok := staged[fileKey]; ok {
				joined[fileKey] = value
			}
			continue
		}

		if existingValue, ok := existing[fileKey]; ok && existingValue != "" {
			existingSpans := doc.Segment(existingValue, firstNonEmptyLocale(targetLocale, sourceLocale))
			if len(existingSpans) == len(spans) {
				for index := range translations {
					if translations[index] == "" {
						translations[index] = existingSpans[index].Text
					}
				}
			}
		}
		joined[fileKey] = srx.Join(spans, translations)
	}

	for key, value := range staged {
		if _, _, isSpan := srx.SplitSpanKey(key); isSpan {
			continue
		}
		if _, already := joined[key]; already {
			continue
		}
		joined[key] = value
	}
	return joined
}

func firstNonEmptyLocale(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func plannedFileKey(entryKey string) string {
	return srx.FileKey(entryKey)
}
