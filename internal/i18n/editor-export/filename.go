package editor_export

import (
	"path"
	"strings"
)

// BuildFilename derives a download name from the source path and target locale.
func BuildFilename(sourcePath, targetLocale, extension string) string {
	base := "cat-export"
	if sourcePath == "*" {
		base = "all-files"
	} else if sourcePath != "" {
		name := path.Base(sourcePath)
		if dot := strings.LastIndex(name, "."); dot > 0 {
			name = name[:dot]
		}
		if name != "" && name != "." {
			base = name
		}
	}
	return base + "-" + targetLocale + "." + extension
}
