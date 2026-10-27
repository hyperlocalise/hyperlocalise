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
// append unknown keys would otherwise add stale entries, and keys stored trimmed at
// ingest are mapped back to the file's own key (a gettext msgid often ends in "\n").
func valuesForSourceKeys(sourcePath string, source []byte, values map[string]string) map[string]string {
	if len(values) == 0 {
		return values
	}
	entries, err := NewDefaultStrategy().Parse(sourcePath, source)
	if err != nil {
		// The writer reports the problem with the file itself.
		return values
	}
	kept := make(map[string]string, len(values))
	for key := range entries {
		if value, ok := values[key]; ok {
			kept[key] = value
			continue
		}
		if value, ok := values[strings.TrimSpace(key)]; ok {
			kept[key] = value
		}
	}
	return kept
}

// A catalog with one column per locale gets the target locale's column filled in, and
// gains that column when it has one for the source locale but none for the target. Any
// other layout has its value column rewritten.
func marshalDelimitedTargetFromSource(source []byte, values map[string]string, sourceLocale, targetLocale string, delimiter rune) ([]byte, error) {
	parser := CSVParser{Delimiter: delimiter}
	hasColumn, err := delimitedHasLocaleColumn(source, targetLocale, delimiter)
	if err != nil {
		return nil, err
	}
	if !hasColumn {
		hasSourceColumn, err := delimitedHasLocaleColumn(source, sourceLocale, delimiter)
		if err != nil {
			return nil, err
		}
		if hasSourceColumn {
			source, err = appendDelimitedColumn(source, strings.TrimSpace(targetLocale), delimiter)
			if err != nil {
				return nil, err
			}
			hasColumn = true
		}
	}
	if hasColumn {
		parser.ValueColumn = strings.TrimSpace(targetLocale)
	}
	return MarshalCSV(source, values, parser)
}

// appendDelimitedColumn adds an empty column named header to every row.
func appendDelimitedColumn(source []byte, header string, delimiter rune) ([]byte, error) {
	r := newCSVReader(bytes.NewReader(source), delimiter)
	var buf bytes.Buffer
	buf.Grow(len(source))
	w := csv.NewWriter(&buf)
	if delimiter != 0 {
		w.Comma = delimiter
	}
	width := -1
	for {
		row, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("csv decode: %w", err)
		}
		if width < 0 {
			width = len(row)
			row = append(row, header)
		} else {
			row = append(ensureCSVLen(row, width), "")
		}
		if err := w.Write(row); err != nil {
			return nil, fmt.Errorf("csv write: %w", err)
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, fmt.Errorf("csv write: %w", err)
	}
	return buf.Bytes(), nil
}
