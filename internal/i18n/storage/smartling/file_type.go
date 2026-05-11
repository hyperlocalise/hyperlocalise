package smartling

import "strings"

// FileTypeForExtension returns the Smartling fileType for a filename extension.
// ext must include the leading dot (e.g. ".json"); callers typically use
// strings.ToLower(filepath.Ext(path)). Unknown extensions return an empty string.
func FileTypeForExtension(ext string) string {
	switch strings.ToLower(ext) {
	case ".json":
		return "json"
	case ".yaml", ".yml":
		return "yaml"
	case ".xml":
		return "xml"
	case ".html", ".htm":
		return "html"
	case ".csv":
		return "csv"
	case ".strings":
		return "ios"
	case ".stringsdict":
		return "ios_stringsdict"
	case ".properties":
		return "javaProperties"
	case ".xliff", ".xlf":
		return "xliff"
	case ".md", ".markdown":
		return "markdown"
	default:
		return ""
	}
}
