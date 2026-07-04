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
	case ".md", ".mdx":
		return FormatMarkdown
	case ".html":
		return FormatHTML
	case ".liquid":
		return FormatLiquid
	default:
		return FormatICUInvariant
	}
}
