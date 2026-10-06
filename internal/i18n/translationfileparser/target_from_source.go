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
	ext := strings.ToLower(filepath.Ext(strings.TrimSpace(sourcePath)))
	switch ext {
	case ".yaml", ".yml":
		return MarshalYAML(source, values)
	case ".xlf", ".xlif", ".xliff":
		return MarshalXLIFF(source, values, sourceLocale, targetLocale)
	case ".po":
		return MarshalPOFile(source, values)
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
		return marshalDelimitedTargetFromSource(source, values, targetLocale, 0)
	case ".tsv":
		return marshalDelimitedTargetFromSource(source, values, targetLocale, '\t')
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

// A catalog with one column per locale gets the target locale's column filled in. Any
// other layout has its value column rewritten.
func marshalDelimitedTargetFromSource(source []byte, values map[string]string, targetLocale string, delimiter rune) ([]byte, error) {
	parser := CSVParser{Delimiter: delimiter}
	hasColumn, err := delimitedHasLocaleColumn(source, targetLocale, delimiter)
	if err != nil {
		return nil, err
	}
	if hasColumn {
		parser.ValueColumn = strings.TrimSpace(targetLocale)
	}
	return MarshalCSV(source, values, parser)
}
