package editor_export

import (
	"fmt"
	"path"
	"strings"
)

// Format identifies a filtered CAT export serialization.
type Format string

const (
	FormatCSV   Format = "csv"
	FormatTMX   Format = "tmx"
	FormatXLF   Format = "xlf"
	FormatXLIFF Format = "xliff"
	FormatXLSX  Format = "xlsx"
)

// MaxRows is the maximum number of segments per export request.
const MaxRows = 5_000

// ParseFormat normalizes and validates a format query value.
func ParseFormat(raw string) (Format, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "csv":
		return FormatCSV, nil
	case "tmx":
		return FormatTMX, nil
	case "xlf":
		return FormatXLF, nil
	case "xliff":
		return FormatXLIFF, nil
	case "xlsx":
		return FormatXLSX, nil
	default:
		return "", fmt.Errorf("unsupported export format")
	}
}

// FormatFromFilename infers a bilingual export format from a file name or path.
func FormatFromFilename(name string) (Format, error) {
	ext := strings.ToLower(strings.TrimPrefix(path.Ext(strings.TrimSpace(name)), "."))
	if ext == "" {
		return "", fmt.Errorf("unsupported export format")
	}
	return ParseFormat(ext)
}
