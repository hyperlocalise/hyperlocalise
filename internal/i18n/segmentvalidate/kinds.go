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
	case ".json", ".properties", ".po", ".csv", ".arb", ".strings", ".xcstrings", ".xml", ".yml", ".yaml":
		return FormatICUInvariant
	case ".html", ".htm", ".srt":
		return FormatHTML
	case ".md", ".mdx", ".markdown":
		return FormatMarkdown
	case ".vtt":
		return FormatWebVTT
	case ".liquid":
		return FormatLiquid
	}

	// Fallback for uncommon casing or other extensions
	switch strings.ToLower(ext) {
	case ".md", ".mdx", ".markdown", ".mdown", ".mkdn", ".mdwn", ".mkd":
		return FormatMarkdown
	case ".html", ".htm", ".srt":
		return FormatHTML
	case ".vtt":
		return FormatWebVTT
	case ".liquid":
		return FormatLiquid
	default:
		return FormatICUInvariant
	}
}
