package translationfileparser

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"slices"
	"strings"
)

// ErrTargetFormatUnsupported reports a file type MarshalTargetFromSource cannot write.
var ErrTargetFormatUnsupported = errors.New("target format unsupported")

// MarshalTargetFromSource writes translated values into a copy of the source file and
// returns it in the source file's own format. A key that values does not hold keeps what
// the source has. It serves callers with no target file to merge into, such as a server
// export. File types it does not cover return ErrTargetFormatUnsupported.
func MarshalTargetFromSource(sourcePath string, source []byte, values map[string]string, sourceLocale, targetLocale string) ([]byte, error) {
	values = valuesForSourceKeys(sourcePath, source, values)
	ext := strings.ToLower(filepath.Ext(strings.TrimSpace(sourcePath)))
	switch ext {
	case ".yaml", ".yml":
		return MarshalYAML(source, values)
	case ".xlf", ".xlif", ".xliff":
		return MarshalXLIFF(source, values, sourceLocale, targetLocale)
	case ".po", ".pot":
		return MarshalPOFileForLocale(source, values, targetLocale)
	case ".html", ".htm":
		content, _ := MarshalHTML(source, values)
		return content, nil
	case ".liquid":
		content, _ := MarshalLiquid(source, values)
		return content, nil
	case ".strings":
		return MarshalAppleStrings(source, values)
	case ".stringsdict":
		return MarshalAppleStringsdict(source, values)
	case ".xcstrings":
		return MarshalXCStrings(source, source, values, sourceLocale, targetLocale)
	case ".csv":
		return marshalDelimitedTargetFromSource(source, values, sourceLocale, targetLocale, 0)
	case ".tsv":
		return marshalDelimitedTargetFromSource(source, values, sourceLocale, targetLocale, '\t')
	case ".toml":
		return MarshalTOML(source, values)
	case ".ini":
		return MarshalINI(source, values)
	case ".properties":
		return MarshalJavaProperties(source, values)
	case ".php":
		return MarshalPHPArrayLocale(source, values)
	case ".ftl":
		return MarshalFluent(source, values)
	case ".xml":
		if IsAndroidStringResourcePath(sourcePath) {
			return MarshalAndroidXMLResources(source, values)
		}
		return MarshalGenericXMLWithTargetLocale(source, values, sourceLocale, targetLocale)
	case ".resx", ".resw":
		return MarshalGenericXMLWithTargetLocale(source, values, sourceLocale, targetLocale)
	case ".srt":
		return MarshalSubtitles(source, values, SubtitleSRT)
	case ".vtt":
		return MarshalSubtitles(source, values, SubtitleVTT)
	case ".sbv":
		return MarshalSubtitles(source, values, SubtitleSBV)
	case ".svg":
		return MarshalSVG(source, values)
	}
	if ext == ".ts" && LooksLikeQtLinguistTS(source) {
		return MarshalQtLinguist(source, values, sourceLocale, targetLocale)
	}
	if slices.Contains(JSTSLocaleModuleExts, ext) {
		return MarshalJSTSLocaleModule(source, values)
	}
	return nil, fmt.Errorf("%w: %q", ErrTargetFormatUnsupported, ext)
}

// valuesForSourceKeys keeps only values for keys the source file has. Writers that
// append unknown keys would otherwise add stale entries. Ingest stores keys trimmed (a
// gettext msgid often ends in "\n"), so a value is also matched by its trimmed key, but
// only to the one file key that trims to it and is not itself spelled that way.
func valuesForSourceKeys(sourcePath string, source []byte, values map[string]string) map[string]string {
	if len(values) == 0 {
		return values
	}
	entries, err := NewDefaultStrategy().Parse(sourcePath, source)
	if err != nil {
		// The writer reports the problem with the file itself.
		return values
	}
	keysByTrimmed := make(map[string]int, len(entries))
	for key := range entries {
		keysByTrimmed[strings.TrimSpace(key)]++
	}
	valuesByTrimmed := make(map[string]string, len(values))
	for key, value := range values {
		valuesByTrimmed[strings.TrimSpace(key)] = value
	}
	kept := make(map[string]string, len(values))
	for key := range entries {
		if value, ok := values[key]; ok {
			kept[key] = value
			continue
		}
		trimmed := strings.TrimSpace(key)
		if _, spelledTrimmed := entries[trimmed]; spelledTrimmed || keysByTrimmed[trimmed] > 1 {
			continue
		}
		if value, ok := valuesByTrimmed[trimmed]; ok {
			kept[key] = value
		}
	}
	return kept
}

// Header names that mark a CSV laid out as one value column, not one column per locale.
var genericDelimitedValueHeaders = map[string]struct{}{"value": {}, "target": {}, "source": {}, "translation": {}}

// A catalog with one column per locale gets the target locale's column filled in, and
// gains that column when it has none. Any other layout has its value column rewritten.
func marshalDelimitedTargetFromSource(source []byte, values map[string]string, sourceLocale, targetLocale string, delimiter rune) ([]byte, error) {
	parser := CSVParser{Delimiter: delimiter}
	headers, err := delimitedHeaders(source, delimiter)
	if err != nil {
		return nil, err
	}
	if column, ok := delimitedLocaleColumn(headers, targetLocale, false); ok {
		parser.ValueColumn = column
	} else if isLocaleColumnCatalog(headers, sourceLocale) {
		source, err = appendDelimitedColumn(source, strings.TrimSpace(targetLocale), len(headers), delimiter)
		if err != nil {
			return nil, err
		}
		parser.ValueColumn = strings.TrimSpace(targetLocale)
	}
	return MarshalCSV(source, values, parser)
}

func delimitedHeaders(source []byte, delimiter rune) ([]string, error) {
	headers, err := newCSVReader(bytes.NewReader(source), delimiter).Read()
	if errors.Is(err, io.EOF) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("csv decode: %w", err)
	}
	return normalizeCSVHeaders(headers), nil
}

func normalizeLocaleName(locale string) string {
	return strings.ReplaceAll(strings.ToLower(strings.TrimSpace(locale)), "_", "-")
}

// delimitedLocaleColumn finds the header naming locale, ignoring case and "_" versus "-".
// byLanguage also accepts a header for the same base language ("en" for "en-US").
func delimitedLocaleColumn(headers []string, locale string, byLanguage bool) (string, bool) {
	want := normalizeLocaleName(locale)
	if want == "" {
		return "", false
	}
	language, _, _ := strings.Cut(want, "-")
	for _, header := range headers {
		name := normalizeLocaleName(header)
		if name == want {
			return header, true
		}
		if headerLanguage, _, _ := strings.Cut(name, "-"); byLanguage && headerLanguage == language {
			return header, true
		}
	}
	return "", false
}

func isLocaleColumnCatalog(headers []string, sourceLocale string) bool {
	if len(headers) == 0 {
		return false
	}
	if _, ok := delimitedLocaleColumn(headers, sourceLocale, true); ok {
		return true
	}
	keyIdx := resolveCSVColumn(headers, "", []string{"key", "id"})
	valueColumns := 0
	for i, header := range headers {
		if i == keyIdx {
			continue
		}
		if _, generic := genericDelimitedValueHeaders[header]; generic {
			return false
		}
		valueColumns++
	}
	return valueColumns >= 2
}

// appendDelimitedColumn adds a column named header after the header row's last column.
func appendDelimitedColumn(source []byte, header string, width int, delimiter rune) ([]byte, error) {
	r := newCSVReader(bytes.NewReader(source), delimiter)
	var buf bytes.Buffer
	buf.Grow(len(source))
	w := csv.NewWriter(&buf)
	if delimiter != 0 {
		w.Comma = delimiter
	}
	first := true
	for {
		row, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("csv decode: %w", err)
		}
		cell := ""
		if first {
			cell, first = header, false
		}
		// Cells past the header's width stay after the new column.
		row = ensureCSVLen(row, width)
		withColumn := make([]string, 0, len(row)+1)
		withColumn = append(withColumn, row[:width]...)
		withColumn = append(withColumn, cell)
		withColumn = append(withColumn, row[width:]...)
		if err := w.Write(withColumn); err != nil {
			return nil, fmt.Errorf("csv write: %w", err)
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, fmt.Errorf("csv write: %w", err)
	}
	return buf.Bytes(), nil
}
