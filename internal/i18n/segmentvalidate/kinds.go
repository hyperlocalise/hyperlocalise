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
)

func KindForSourcePath(path string) FormatKind {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".mdx", ".markdown", ".mdown", ".mkdn", ".mdwn", ".mkd":
		return FormatMarkdown
	case ".html", ".htm":
		return FormatHTML
	case ".liquid":
		return FormatLiquid
	default:
		return FormatICUInvariant
	}
}
