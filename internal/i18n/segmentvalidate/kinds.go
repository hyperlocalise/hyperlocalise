package segmentvalidate

import (
	"path/filepath"
	"strings"
)

type FormatKind int

const (
	FormatMarkdown FormatKind = iota
	FormatHTML
	FormatLiquid
	FormatICUInvariant
	FormatWebVTT
	FormatAsciiDoc
	FormatOffice
)

func KindForSourcePath(path string) FormatKind {
	path = strings.TrimSpace(path)
	if isOfficePackageKey(path) {
		return FormatOffice
	}
	ext := filepath.Ext(path)
	if ext == "" {
		return FormatICUInvariant
	}

	// BOLT OPTIMIZATION: Match common extensions directly on ext to avoid
	// strings.ToLower heap allocation.
	switch ext {
	case ".json", ".properties", ".ini", ".po", ".pot", ".csv", ".tsv", ".toml", ".arb", ".strings", ".xcstrings", ".xml", ".resx", ".resw", ".yml", ".yaml", ".ts", ".txt":
		return FormatICUInvariant
	case ".html", ".htm", ".srt", ".sbv", ".svg":
		return FormatHTML
	case ".md", ".mdx", ".markdown":
		return FormatMarkdown
	case ".adoc", ".asciidoc", ".asc":
		return FormatAsciiDoc
	case ".vtt":
		return FormatWebVTT
	case ".liquid":
		return FormatLiquid
	case ".docx", ".pptx", ".pdf":
		return FormatOffice
	}

	// Fallback for uncommon casing or other extensions
	switch strings.ToLower(ext) {
	case ".md", ".mdx", ".markdown", ".mdown", ".mkdn", ".mdwn", ".mkd":
		return FormatMarkdown
	case ".adoc", ".asciidoc", ".asc":
		return FormatAsciiDoc
	case ".html", ".htm", ".srt", ".sbv", ".svg":
		return FormatHTML
	case ".vtt":
		return FormatWebVTT
	case ".liquid":
		return FormatLiquid
	case ".docx", ".pptx", ".pdf":
		return FormatOffice
	default:
		return FormatICUInvariant
	}
}

// Office CAT keys are the package part plus paragraph index, e.g. word/document.xml#12.
func isOfficePackageKey(path string) bool {
	hash := strings.LastIndex(path, "#")
	if hash <= 0 {
		return false
	}
	part := strings.ToLower(path[:hash])
	if strings.HasPrefix(part, "page-") {
		return true
	}
	if !strings.HasSuffix(part, ".xml") {
		return false
	}
	return strings.HasPrefix(part, "word/") || strings.HasPrefix(part, "ppt/")
}
