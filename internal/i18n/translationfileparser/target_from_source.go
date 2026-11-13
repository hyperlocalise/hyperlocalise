package translationfileparser

import (
	"errors"
	"fmt"
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
	content, _, err := MarshalTargetFromSourceCountingUnmatched(sourcePath, source, values, sourceLocale, targetLocale)
	return content, err
}

// MarshalTargetFromSourceCountingUnmatched is MarshalTargetFromSource that also reports
// how many values matched no key of the source file. Those values are left out; a
// caller whose keys should all match (they were read from this file) can treat any as
// a sign the keys were read differently.
func MarshalTargetFromSourceCountingUnmatched(sourcePath string, source []byte, values map[string]string, sourceLocale, targetLocale string) ([]byte, int, error) {
	values, unmatched := valuesForSourceKeys(sourcePath, source, values)
	content, err := marshalTargetFromSource(sourcePath, source, values, sourceLocale, targetLocale)
	return content, unmatched, err
}

func marshalTargetFromSource(sourcePath string, source []byte, values map[string]string, sourceLocale, targetLocale string) ([]byte, error) {
	ext := strings.ToLower(filepath.Ext(strings.TrimSpace(sourcePath)))
	switch ext {
	case ".yaml", ".yml":
		return MarshalYAML(source, values)
	case ".xlf", ".xlif", ".xliff":
		// Here and for xcstrings and Qt, the file's own source language stays: the project
		// may spell it differently.
		return MarshalXLIFF(source, values, "", targetLocale)
	case ".po", ".pot":
		return MarshalPOFileForLocale(source, values, targetLocale)
	case ".liquid":
		// MarshalLiquid returns the template unchanged when it cannot read it, which
		// would pass for a file with nothing translated.
		if _, err := (LiquidParser{}).Parse(source); err != nil {
			return nil, err
		}
		content, _ := MarshalLiquid(source, values)
		return content, nil
	case ".strings":
		return MarshalAppleStrings(source, values)
	case ".stringsdict":
		return MarshalAppleStringsdict(source, values)
	case ".xcstrings":
		// An empty source locale makes the writer use the file's sourceLanguage.
		return MarshalXCStrings(source, source, values, "", targetLocale)
	case ".csv":
		// The same column ingest read the source text from, whatever the headers name.
		return MarshalCSV(source, values, CSVParser{})
	case ".tsv":
		return MarshalCSV(source, values, CSVParser{Delimiter: '\t'})
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
	case ".svg":
		return MarshalSVG(source, values)
	}
	if ext == ".ts" && LooksLikeQtLinguistTS(source) {
		return MarshalQtLinguist(source, values, "", targetLocale)
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
func valuesForSourceKeys(sourcePath string, source []byte, values map[string]string) (map[string]string, int) {
	if len(values) == 0 {
		return values, 0
	}
	entries, err := NewDefaultStrategy().Parse(sourcePath, source)
	if err != nil {
		// The writer reports the problem with the file itself.
		return values, 0
	}
	keysByTrimmed := make(map[string]int, len(entries))
	for key := range entries {
		keysByTrimmed[strings.TrimSpace(key)]++
	}
	valueKeysByTrimmed := make(map[string]string, len(values))
	for key := range values {
		valueKeysByTrimmed[strings.TrimSpace(key)] = key
	}
	kept := make(map[string]string, len(values))
	used := make(map[string]struct{}, len(values))
	for key := range entries {
		if value, ok := values[key]; ok {
			kept[key] = value
			used[key] = struct{}{}
			continue
		}
		trimmed := strings.TrimSpace(key)
		if _, spelledTrimmed := entries[trimmed]; spelledTrimmed || keysByTrimmed[trimmed] > 1 {
			continue
		}
		if valueKey, ok := valueKeysByTrimmed[trimmed]; ok {
			kept[key] = values[valueKey]
			used[valueKey] = struct{}{}
		}
	}
	return kept, len(values) - len(used)
}
