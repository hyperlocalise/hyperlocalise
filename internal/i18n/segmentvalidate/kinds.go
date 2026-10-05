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
)

func KindForSourcePath(path string) FormatKind {
	path = strings.TrimSpace(path)
	ext := filepath.Ext(path)
	if ext == "" {
		return FormatICUInvariant
	}

	// BOLT OPTIMIZATION: Match common extensions directly on ext to avoid
	// strings.ToLower heap allocation.
	switch ext {
	case ".json", ".properties", ".ini", ".po", ".csv", ".tsv", ".toml", ".arb", ".strings", ".xcstrings", ".xml", ".resx", ".resw", ".yml", ".yaml", ".ts":
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
	default:
		return FormatICUInvariant
	}
}
