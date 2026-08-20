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
	switch strings.ToLower(filepath.Ext(strings.TrimSpace(path))) {
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
